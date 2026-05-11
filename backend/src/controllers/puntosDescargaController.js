const pool = require('../config/database');

const obtenerPuntosDescarga = async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM puntos_descarga WHERE activo = TRUE ORDER BY nombre ASC');
    res.status(200).json({ puntos: resultado.rows });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener puntos de descarga' });
  }
};

const crearPuntoDescarga = async (req, res) => {
  const { nombre, latitud_centro, longitud_centro, tipo } = req.body;
  try {
    const resultado = await pool.query(
      'INSERT INTO puntos_descarga (nombre, latitud_centro, longitud_centro, tipo) VALUES ($1, $2, $3, $4) RETURNING *',
      [nombre, latitud_centro, longitud_centro, tipo || 'relleno']
    );
    res.status(201).json({ mensaje: 'Punto de descarga registrado', punto: resultado.rows[0] });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al registrar punto de descarga' });
  }
};

const eliminarPuntoDescarga = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE puntos_descarga SET activo = FALSE WHERE id = $1', [id]);
    res.status(200).json({ mensaje: 'Punto de descarga eliminado' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar punto de descarga' });
  }
};

module.exports = { obtenerPuntosDescarga, crearPuntoDescarga, eliminarPuntoDescarga };
