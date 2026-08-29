const pool = require('../config/database');
const {
  getFechaColombia, getMinutosDelDiaColombia, horaAMinutos, aFechaISO
} = require('../utils/dateUtils');

const obtenerAsignacionesPorFecha = async (req, res) => {
  const { fecha } = req.query; // Espera YYYY-MM-DD
  try {
    const resultado = await pool.query(
       `SELECT asig.*, 
              COALESCE(asig.conductor_id, rf.conductor_default_id) AS conductor_id,
              COALESCE(asig.vehiculo_id, rf.vehiculo_id) AS vehiculo_id,
              rf.nombre AS ruta_nombre,
              u.nombre AS conductor_nombre,
              v.placa AS vehiculo_placa,
              j.nombre AS jornada_nombre,
              j.hora_inicio AS j_hora_inicio,
              j.hora_limite_fin,
              COALESCE(
                (SELECT ROUND(COUNT(case when sa.estado = 'completado' then 1 end) * 100.0 / NULLIF(COUNT(sa.id), 0)) 
                 FROM sectores_asignacion sa 
                 WHERE sa.asignacion_id = asig.id), 0
              ) as progreso
       FROM asignaciones_semanales asig
       JOIN rutas_fijas rf ON rf.id = asig.ruta_fija_id
       JOIN usuarios u ON u.id = COALESCE(asig.conductor_id, rf.conductor_default_id)
       JOIN vehiculos v ON v.id = COALESCE(asig.vehiculo_id, rf.vehiculo_id)
       JOIN jornadas j ON j.id = rf.jornada_id
       WHERE asig.fecha = $1
       ORDER BY j.hora_inicio ASC`,
      [fecha]
    );

    // Obtener los conteos de los próximos 14 días a partir de hoy
    const conteos = await pool.query(
      `SELECT fecha, COUNT(*) as cantidad 
       FROM asignaciones_semanales 
       WHERE fecha >= CURRENT_DATE AND fecha <= (CURRENT_DATE + interval '14 days')
       GROUP BY fecha`
    );

    const conteosMap = {};
    conteos.rows.forEach(r => {
      // aFechaISO y no toISOString: el segundo pasa por UTC y adelanta o atrasa
      // un dia el conteo del calendario segun la hora del servidor.
      conteosMap[aFechaISO(r.fecha)] = parseInt(r.cantidad);
    });

    res.json({ 
      asignaciones: resultado.rows,
      conteos: conteosMap 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener asignaciones' });
  }
};

const reasignarAsignacion = async (req, res) => {
  const { id } = req.params;
  const { conductor_id, vehiculo_id, es_permanente } = req.body;

  try {
    const asigActual = await pool.query(
      `SELECT asig.fecha, asig.estado, asig.ruta_fija_id,
              COALESCE(asig.conductor_id, rf.conductor_default_id) AS conductor_actual_id,
              rf.jornada_id,
              j.hora_limite_fin
       FROM asignaciones_semanales asig
       JOIN rutas_fijas rf ON rf.id = asig.ruta_fija_id
       JOIN jornadas j ON j.id = rf.jornada_id
       WHERE asig.id = $1`,
      [id]
    );

    if (asigActual.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Asignación no encontrada' });
    }

    const { fecha, jornada_id, estado, ruta_fija_id, conductor_actual_id, hora_limite_fin } = asigActual.rows[0];

    if (estado !== 'pendiente') {
      return res.status(400).json({ mensaje: 'Solo se pueden reasignar rutas pendientes.' });
    }

    // REGLA: Bloquear reasignación si la jornada ya terminó.
    //
    // La comparacion se hace en minutos desde medianoche en hora de Colombia,
    // igual que en iniciarRuta. Antes se construia un Date con la hora local
    // del servidor: en un servidor en UTC la jornada de la tarde se daba por
    // terminada cinco horas antes de tiempo y el administrador no podia
    // reasignar rutas que aun estaban por delante.
    const hoy = getFechaColombia();
    const fechaAsig = aFechaISO(fecha);
    if (fechaAsig === hoy && hora_limite_fin) {
      const finMin = horaAMinutos(hora_limite_fin);
      if (finMin !== null && getMinutosDelDiaColombia() > finMin) {
        return res.status(400).json({ mensaje: '❌ La jornada ya finalizó. No se puede reasignar esta ruta.' });
      }
    }

    // REGLA: una sola reasignación manual por asignación.
    //
    // Se filtra por asignacion_id y por origen (migración 014). Antes bastaba
    // con que existiera cualquier fila de esa ruta y esa fecha, y en esa tabla
    // también se anotan los relevos por incidencia: un accidente consumía el
    // cupo del día y dejaba al administrador sin poder reasignar la ruta si el
    // conductor de reemplazo tampoco podía cubrirla.
    const yaReasignada = await pool.query(
      `SELECT id FROM cambios_conductor
       WHERE asignacion_id = $1 AND origen = 'reasignacion'`,
      [id]
    );

    if (yaReasignada.rows.length > 0) {
      return res.status(400).json({ mensaje: '⚠️ Esta ruta ya fue reasignada para esta fecha. No se puede reasignar nuevamente.' });
    }

    // Verificar conflictos con otras asignaciones del mismo día/jornada.
    // Se compara contra la tripulación efectiva de cada asignación, no contra la
    // configuración base de la ruta: de lo contrario una ruta ya reasignada ese
    // día quedaba invisible y se podía asignar el mismo conductor dos veces.
    const conflictos = await pool.query(
      `SELECT rf.nombre
       FROM asignaciones_semanales a
       JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id
       WHERE a.fecha = $1
         AND rf.jornada_id = $2
         AND a.id != $3
         AND a.estado IN ('pendiente', 'activa')
         AND (COALESCE(a.conductor_id, rf.conductor_default_id) = $4
              OR COALESCE(a.vehiculo_id, rf.vehiculo_id) = $5)`,
      [fecha, jornada_id, id, conductor_id, vehiculo_id]
    );

    if (conflictos.rows.length > 0) {
      return res.status(400).json({ 
        mensaje: `❌ Error de Logística: El conductor o el vehículo de reemplazo ya están asignados a la ruta "${conflictos.rows[0].nombre}" en este mismo turno.` 
      });
    }

    const motivoCambio = req.body.motivo || 'Reasignación diaria manual';
    // Quien tenía la asignación ahora mismo, no el titular de la ruta fija: tras
    // un relevo por incidencia ya no son la misma persona y el histórico
    // quedaba anotando como sustituido a un conductor que no iba conduciendo.
    const conductorOriginal = conductor_actual_id || null;

    // Usar transacción para garantizar atomicidad
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Registrar el cambio (guardar conductor/vehículo original para auditoría y posible reversión)
      await client.query(
        `INSERT INTO cambios_conductor
         (ruta_fija_id, asignacion_id, origen, conductor_original_id, conductor_reemplazante_id, motivo, fecha_inicio, fecha_fin, es_permanente)
         VALUES ($1, $2, 'reasignacion', $3, $4, $5, $6, $6, $7)`,
        [ruta_fija_id, id, conductorOriginal, conductor_id, motivoCambio, fecha, !!es_permanente]
      );

      // RF-03.5: el relevo se aplica sobre la asignación del día. La
      // configuración base de la ruta fija sólo se toca cuando el cambio se
      // declara permanente. Antes se sobrescribía rutas_fijas en todos los
      // casos, así que un reemplazo puntual se volvía definitivo: el conductor
      // titular perdía su ruta y el cron generaba todas las fechas futuras a
      // nombre del suplente.
      if (es_permanente) {
        await client.query(
          `UPDATE rutas_fijas SET conductor_default_id = $1, vehiculo_id = $2 WHERE id = $3`,
          [conductor_id, vehiculo_id, ruta_fija_id]
        );
      }

      // La asignación del día pasa al nuevo conductor y vehículo. El panel del
      // conductor y el monitoreo leen de aquí, no de la ruta fija (RNF-12).
      await client.query(
        `UPDATE asignaciones_semanales SET conductor_id = $1, vehiculo_id = $2 WHERE id = $3`,
        [conductor_id, vehiculo_id, id]
      );

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    res.json({ mensaje: 'Asignación reasignada con éxito', asignacionId: id, permanente: !!es_permanente });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error interno al reasignar' });
  }
};

const habilitarInicioTardio = async (req, res) => {
  const { id } = req.params;
  const admin_id = req.usuario.id;
  const { motivo } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Habilitar la asignación
    await client.query(
      `UPDATE asignaciones_semanales 
       SET habilitado_por_admin = TRUE, inicio_tardio = TRUE
       WHERE id = $1`,
      [id]
    );

    // 2. Registrar en novedades_operativas
    await client.query(
      `INSERT INTO novedades_operativas (asignacion_id, admin_id, tipo_novedad, descripcion)
       VALUES ($1, $2, $3, $4)`,
      [id, admin_id, 'REACTIVACION_MANUAL', motivo || 'Admin habilitó inicio fuera de tiempo']
    );

    await client.query('COMMIT');
    res.json({ mensaje: 'Inicio tardío habilitado exitosamente.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    res.status(500).json({ mensaje: 'Error al habilitar inicio tardío.' });
  } finally {
    client.release();
  }
};

const obtenerAsignacionesDisponibles = async (req, res) => {
  try {
    // Obtener asignaciones desde hoy y los próximos 2 días (total 3 días en el futuro cercano)
    const resultado = await pool.query(
      `SELECT asig.id, 
              asig.fecha,
              asig.estado,
              rf.id AS ruta_fija_id,
              rf.nombre AS ruta_nombre,
              j.nombre AS jornada_nombre,
              j.hora_inicio AS j_hora_inicio,
              j.hora_limite_fin
       FROM asignaciones_semanales asig
       JOIN rutas_fijas rf ON rf.id = asig.ruta_fija_id
       JOIN jornadas j ON j.id = rf.jornada_id
       WHERE asig.fecha >= CURRENT_DATE AND asig.fecha <= (CURRENT_DATE + interval '2 days')
       ORDER BY asig.fecha ASC, j.hora_inicio ASC`
    );

    res.json({ asignaciones: resultado.rows });
  } catch (error) {
    console.error('Error al obtener asignaciones disponibles:', error.message);
    res.status(500).json({ mensaje: 'Error al obtener asignaciones disponibles.' });
  }
};

module.exports = {
  obtenerAsignacionesPorFecha,
  reasignarAsignacion,
  habilitarInicioTardio,
  obtenerAsignacionesDisponibles
};
