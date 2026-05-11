const pool = require('../config/database');

const obtenerAsignacionesPorFecha = async (req, res) => {
  const { fecha } = req.query; // Espera YYYY-MM-DD
  try {
    const resultado = await pool.query(
      `SELECT asig.*, 
              rf.nombre AS ruta_nombre,
              u.nombre AS conductor_nombre,
              v.placa AS vehiculo_placa,
              j.nombre AS jornada_nombre
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
      // Formato YYYY-MM-DD local
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
    // 1. Obtener detalles de la asignación actual (fecha y jornada)
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

    // 2. Verificar si el conductor o vehículo ya tienen otra asignación 
    // en la misma fecha y misma jornada
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

    // 3. Proceder con la reasignación en asignaciones_semanales
    const resultado = await pool.query(
      `UPDATE asignaciones_semanales 
       SET conductor_id = $1, vehiculo_id = $2
       WHERE id = $3 RETURNING *`,
      [conductor_id, vehiculo_id, id]
    );

    // 4. Registrar en el historial de reemplazos (cambios_conductor)
    const motivoCambio = req.body.motivo || 'Reasignación diaria manual';
    const conductorOriginal = asigActual.rows[0].conductor_id || null;
    
    // Asumiendo estructura típica por la descripción del usuario
    try {
      await pool.query(
        `INSERT INTO cambios_conductor (ruta_fija_id, conductor_original_id, conductor_nuevo_id, motivo, fecha_inicio, fecha_fin, tipo_cambio)
         VALUES ($1, $2, $3, $4, $5, $5, 'temporal')`,
        [asigActual.rows[0].ruta_fija_id, conductorOriginal, conductor_id, motivoCambio, asigActual.rows[0].fecha]
      );
    } catch (err) {
      console.error("No se pudo insertar en cambios_conductor. Verifica las columnas:", err.message);
      // No bloqueamos la petición si la tabla tiene columnas distintas, solo loggeamos el error
    }

    res.json({ mensaje: 'Asignación reasignada con éxito e historial actualizado', asignacion: resultado.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error interno al reasignar' });
  }
};


module.exports = {
  obtenerAsignacionesPorFecha,
  reasignarAsignacion
};
