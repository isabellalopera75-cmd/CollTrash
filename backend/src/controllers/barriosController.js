const pool = require('../config/database');

const obtenerBarrios = async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM barrios ORDER BY nombre ASC');
    res.status(200).json({ barrios: resultado.rows });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const detectarBarrio = async (req, res) => {
  const { lat, lng } = req.query;

  try {
    if (!lat || !lng) {
      return res.status(400).json({ mensaje: 'Latitud y longitud son requeridas.' });
    }

    // Lógica simple: encontrar el barrio más cercano al centro proporcionado
    // O si se usa PostGIS: ST_Contains o ST_Distance
    const resultado = await pool.query(
      `SELECT *, 
       (6371 * acos(cos(radians($1)) * cos(radians(latitud_centro)) * cos(radians(longitud_centro) - radians($2)) + sin(radians($1)) * sin(radians(latitud_centro)))) AS distancia
       FROM barrios
       ORDER BY distancia ASC
       LIMIT 1`,
      [lat, lng]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'No se detectó ningún barrio cercano.' });
    }

    res.status(200).json({ barrio: resultado.rows[0] });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

module.exports = { obtenerBarrios, detectarBarrio };
