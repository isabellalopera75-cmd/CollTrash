const pool = require('../config/database');

const obtenerAsignacionesPorFecha = async (req, res) => {
  const { fecha } = req.query; // Espera YYYY-MM-DD
  try {
    const resultado = await pool.query(
      `SELECT asig.*, 
              rf.nombre AS ruta_nombre,
              u.nombre AS conductor_nombre,
              v.placa AS vehiculo_placa,
              j.nombre AS jornada_nombre,
              j.hora_inicio AS j_hora_inicio,
              j.hora_limite_fin
       FROM asignaciones_semanales asig
       JOIN rutas_fijas rf ON rf.id = asig.ruta_fija_id
       JOIN usuarios u ON u.id = asig.conductor_id
       JOIN vehiculos v ON v.id = asig.vehiculo_id
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
  const { conductor_id, vehiculo_id } = req.body;
  
  try {
    const asigActual = await pool.query(
      `SELECT asig.fecha, asig.conductor_id, asig.ruta_fija_id, rf.jornada_id 
       FROM asignaciones_semanales asig
       JOIN rutas_fijas rf ON rf.id = asig.ruta_fija_id
       WHERE asig.id = $1`,
      [id]
    );

    if (asigActual.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Asignación no encontrada' });
    }

    const { fecha, jornada_id } = asigActual.rows[0];

    const conflictos = await pool.query(
      `SELECT rf.nombre 
       FROM asignaciones_semanales asig
       JOIN rutas_fijas rf ON rf.id = asig.ruta_fija_id
       WHERE asig.fecha = $1 
       AND rf.jornada_id = $2 
       AND asig.id != $3
       AND (asig.conductor_id = $4 OR asig.vehiculo_id = $5)`,
      [fecha, jornada_id, id, conductor_id, vehiculo_id]
    );

    if (conflictos.rows.length > 0) {
      return res.status(400).json({ 
        mensaje: `❌ Error de Logística: El conductor o el vehículo de reemplazo ya están asignados a la ruta "${conflictos.rows[0].nombre}" en este mismo turno.` 
      });
    }

    const resultado = await pool.query(
      `UPDATE asignaciones_semanales 
       SET conductor_id = $1, vehiculo_id = $2
       WHERE id = $3 RETURNING *`,
      [conductor_id, vehiculo_id, id]
    );

    const motivoCambio = req.body.motivo || 'Reasignación diaria manual';
    const conductorOriginal = asigActual.rows[0].conductor_id || null;
    
    try {
      await pool.query(
        `INSERT INTO cambios_conductor (ruta_fija_id, conductor_original_id, conductor_reemplazante_id, motivo, fecha_inicio, fecha_fin, tipo_cambio)
         VALUES ($1, $2, $3, $4, $5, $5, $6)`,
        [asigActual.rows[0].ruta_fija_id, conductorOriginal, conductor_id, motivoCambio, asigActual.rows[0].fecha, 'temporal']
      );
    } catch (err) {
      console.error("No se pudo insertar en cambios_conductor:", err.message);
    }

    res.json({ mensaje: 'Asignación reasignada con éxito e historial actualizado', asignacion: resultado.rows[0] });
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
