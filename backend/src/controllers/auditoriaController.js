const pool = require('../config/database');

const obtenerHistorial = async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT a.*, u.nombre as usuario_nombre, u.email as usuario_email
      FROM auditoria a
      LEFT JOIN usuarios u ON u.id = a.usuario_id
      ORDER BY a.fecha DESC
      LIMIT 100
    `);

    res.status(200).json({ historial: resultado.rows });
  } catch (error) {
    console.error('Error al obtener historial:', error.message);
    res.status(500).json({ mensaje: 'Error al obtener el historial de actividad.' });
  }
};

module.exports = { obtenerHistorial };
