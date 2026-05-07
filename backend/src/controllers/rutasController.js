const pool = require('../config/database');

// Crear ruta fija
const crearRutaFija = async (req, res) => {
  const { nombre, jornada_id, conductor_default_id, vehiculo_id, dias_semana, sectores } = req.body;

  try {
    // Validar campos obligatorios
    if (!nombre || !jornada_id || !conductor_default_id || !vehiculo_id || !dias_semana) {
      return res.status(400).json({ mensaje: 'Todos los campos son obligatorios.' });
    }

    // Validar que el conductor existe y tiene rol conductor
    const conductor = await pool.query(
      'SELECT id FROM usuarios WHERE id = $1 AND rol = $2 AND activo = TRUE',
      [conductor_default_id, 'conductor']
    );
    if (conductor.rows.length === 0) {
      return res.status(400).json({ mensaje: 'El conductor no existe o no está activo.' });
    }

    // Validar que el vehículo existe
    const vehiculo = await pool.query(
      'SELECT id FROM vehiculos WHERE id = $1 AND activo = TRUE',
      [vehiculo_id]
    );
    if (vehiculo.rows.length === 0) {
      return res.status(400).json({ mensaje: 'El vehículo no existe o no está activo.' });
    }

    // Crear la ruta fija
    const resultado = await pool.query(
      `INSERT INTO rutas_fijas (nombre, jornada_id, conductor_default_id, vehiculo_id, dias_semana)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nombre, jornada_id, conductor_default_id, vehiculo_id, dias_semana]
    );

    const rutaFija = resultado.rows[0];

    // Crear sectores si vienen en la petición
    if (sectores && sectores.length > 0) {
      for (const sector of sectores) {
        await pool.query(
          `INSERT INTO sectores_ruta (ruta_fija_id, nombre, orden, trazado_geom, porcentaje_requerido)
           VALUES ($1, $2, $3, $4, $5)`,
          [rutaFija.id, sector.nombre, sector.orden, sector.trazado_geom, sector.porcentaje_requerido || 90]
        );
      }
    }

    res.status(201).json({
      mensaje: 'Ruta fija creada exitosamente.',
      ruta: rutaFija
    });

  } catch (error) {
    console.error('Error al crear ruta fija:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Obtener todas las rutas fijas
const obtenerRutasFijas = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT rf.*, 
              u.nombre AS conductor_nombre,
              v.placa AS vehiculo_placa,
              j.nombre AS jornada_nombre,
              j.hora_inicio,
              j.hora_limite_fin
       FROM rutas_fijas rf
       JOIN usuarios u ON u.id = rf.conductor_default_id
       JOIN vehiculos v ON v.id = rf.vehiculo_id
       JOIN jornadas j ON j.id = rf.jornada_id
       WHERE rf.activo = TRUE
       ORDER BY rf.created_at DESC`
    );

    res.status(200).json({ rutas: resultado.rows });

  } catch (error) {
    console.error('Error al obtener rutas:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Obtener una ruta fija con sus sectores
const obtenerRutaFijaPorId = async (req, res) => {
  const { id } = req.params;

  try {
    const ruta = await pool.query(
      `SELECT rf.*, 
              u.nombre AS conductor_nombre,
              v.placa AS vehiculo_placa,
              j.nombre AS jornada_nombre,
              j.hora_inicio,
              j.hora_limite_fin
       FROM rutas_fijas rf
       JOIN usuarios u ON u.id = rf.conductor_default_id
       JOIN vehiculos v ON v.id = rf.vehiculo_id
       JOIN jornadas j ON j.id = rf.jornada_id
       WHERE rf.id = $1 AND rf.activo = TRUE`,
      [id]
    );

    if (ruta.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Ruta no encontrada.' });
    }

    // Obtener sectores de la ruta
    const sectores = await pool.query(
      'SELECT * FROM sectores_ruta WHERE ruta_fija_id = $1 ORDER BY orden ASC',
      [id]
    );

    res.status(200).json({
      ruta: ruta.rows[0],
      sectores: sectores.rows
    });

  } catch (error) {
    console.error('Error al obtener ruta:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Editar ruta fija
const editarRutaFija = async (req, res) => {
  const { id } = req.params;
  const { nombre, jornada_id, conductor_default_id, vehiculo_id, dias_semana } = req.body;

  try {
    const resultado = await pool.query(
      `UPDATE rutas_fijas 
       SET nombre = COALESCE($1, nombre),
           jornada_id = COALESCE($2, jornada_id),
           conductor_default_id = COALESCE($3, conductor_default_id),
           vehiculo_id = COALESCE($4, vehiculo_id),
           dias_semana = COALESCE($5, dias_semana)
       WHERE id = $6 AND activo = TRUE
       RETURNING *`,
      [nombre, jornada_id, conductor_default_id, vehiculo_id, dias_semana, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Ruta no encontrada.' });
    }

    res.status(200).json({
      mensaje: 'Ruta actualizada exitosamente.',
      ruta: resultado.rows[0]
    });

  } catch (error) {
    console.error('Error al editar ruta:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Eliminar ruta fija (soft delete)
const eliminarRutaFija = async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query(
      'UPDATE rutas_fijas SET activo = FALSE WHERE id = $1 RETURNING id',
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Ruta no encontrada.' });
    }

    res.status(200).json({ mensaje: 'Ruta eliminada exitosamente.' });

  } catch (error) {
    console.error('Error al eliminar ruta:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

module.exports = {
  crearRutaFija,
  obtenerRutasFijas,
  obtenerRutaFijaPorId,
  editarRutaFija,
  eliminarRutaFija
};