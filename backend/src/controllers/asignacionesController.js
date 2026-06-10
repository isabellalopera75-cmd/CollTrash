const pool = require('../config/database');

const obtenerAsignacionesPorFecha = async (req, res) => {
  const { fecha } = req.query; // Espera YYYY-MM-DD
  try {
    const resultado = await pool.query(
       `SELECT asig.*, 
              rf.conductor_default_id AS conductor_id,
              rf.vehiculo_id AS vehiculo_id,
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
       JOIN usuarios u ON u.id = rf.conductor_default_id
       JOIN vehiculos v ON v.id = rf.vehiculo_id
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
      const f = new Date(r.fecha).toISOString().split('T')[0];
      conteosMap[f] = parseInt(r.cantidad);
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
      `SELECT asig.fecha, asig.estado, asig.ruta_fija_id, rf.jornada_id, rf.conductor_default_id, rf.vehiculo_id,
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

    const { fecha, jornada_id, estado, ruta_fija_id, conductor_default_id, hora_limite_fin } = asigActual.rows[0];

    if (estado !== 'pendiente') {
      return res.status(400).json({ mensaje: 'Solo se pueden reasignar rutas pendientes.' });
    }

    // REGLA: Bloquear reasignación si la jornada ya terminó
    const hoy = new Date().toISOString().split('T')[0];
    const fechaAsig = new Date(fecha).toISOString().split('T')[0];
    if (fechaAsig === hoy && hora_limite_fin) {
      const [hf, mf] = hora_limite_fin.split(':');
      const ahora = new Date();
      const fin = new Date();
      fin.setHours(parseInt(hf), parseInt(mf), 0);
      if (ahora > fin) {
        return res.status(400).json({ mensaje: '❌ La jornada ya finalizó. No se puede reasignar esta ruta.' });
      }
    }

    // REGLA: Evitar reasignaciones múltiples para la misma asignación/fecha
    const yaReasignada = await pool.query(
      `SELECT id FROM cambios_conductor 
       WHERE ruta_fija_id = $1 AND fecha_inicio = $2`,
      [ruta_fija_id, fecha]
    );

    if (yaReasignada.rows.length > 0) {
      return res.status(400).json({ mensaje: '⚠️ Esta ruta ya fue reasignada para esta fecha. No se puede reasignar nuevamente.' });
    }

    // Verificar conflictos con otras asignaciones del mismo día/jornada
    const conflictos = await pool.query(
      `SELECT rf.nombre 
       FROM asignaciones_semanales a
       JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id
       WHERE a.fecha = $1 
         AND rf.jornada_id = $2 
         AND a.id != $3
         AND (rf.conductor_default_id = $4 OR rf.vehiculo_id = $5)`,
      [fecha, jornada_id, id, conductor_id, vehiculo_id]
    );

    if (conflictos.rows.length > 0) {
      return res.status(400).json({ 
        mensaje: `❌ Error de Logística: El conductor o el vehículo de reemplazo ya están asignados a la ruta "${conflictos.rows[0].nombre}" en este mismo turno.` 
      });
    }

    const motivoCambio = req.body.motivo || 'Reasignación diaria manual';
    const conductorOriginal = conductor_default_id || null;
    const vehiculoOriginal = asigActual.rows[0].vehiculo_id || null;

    // Registrar el cambio (guardar conductor/vehículo original para auditoría y posible reversión)
    await pool.query(
      `INSERT INTO cambios_conductor 
       (ruta_fija_id, conductor_original_id, conductor_reemplazante_id, motivo, fecha_inicio, fecha_fin, es_permanente)
       VALUES ($1, $2, $3, $4, $5, $5, $6)`,
      [ruta_fija_id, conductorOriginal, conductor_id, motivoCambio, fecha, !!es_permanente]
    );

    // SIEMPRE actualizar rutas_fijas para que el nuevo conductor vea la ruta en su dashboard
    await pool.query(
      `UPDATE rutas_fijas SET conductor_default_id = $1, vehiculo_id = $2 WHERE id = $3`,
      [conductor_id, vehiculo_id, ruta_fija_id]
    );

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

  try {
    // 1. Habilitar la asignación
    await pool.query(
      `UPDATE asignaciones_semanales 
       SET habilitado_por_admin = TRUE, inicio_tardio = TRUE
       WHERE id = $1`,
      [id]
    );

    // 2. Registrar en novedades_operativas
    await pool.query(
      `INSERT INTO novedades_operativas (asignacion_id, admin_id, tipo_novedad, descripcion)
       VALUES ($1, $2, $3, $4)`,
      [id, admin_id, 'REACTIVACION_MANUAL', motivo || 'Admin habilitó inicio fuera de tiempo']
    );

    res.json({ mensaje: 'Inicio tardío habilitado exitosamente.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al habilitar inicio tardío.' });
  }
};

const obtenerAsignacionesDisponibles = async (req, res) => {
  try {
    // Generar las asignaciones de los próximos 7 días en segundo plano (asíncronamente) para no bloquear el request
    const { generarAsignaciones } = require('../services/cronService');
    generarAsignaciones().catch(err => console.error('Error al generar asignaciones en disponibles (segundo plano):', err.message));

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
