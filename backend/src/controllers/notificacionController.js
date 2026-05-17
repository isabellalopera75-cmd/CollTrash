const pool = require('../config/database');

const obtenerNotificaciones = async (req, res) => {
  try {
    const resultado = await pool.query(
      'SELECT * FROM notificaciones ORDER BY fecha DESC LIMIT 20'
    );
    res.json({ notificaciones: resultado.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener notificaciones' });
  }
};

const marcarLeida = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('UPDATE notificaciones SET leida = TRUE WHERE id = $1', [id]);
    res.json({ mensaje: 'Notificación marcada como leída' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al actualizar notificación' });
  }
};

const marcarTodasLeidas = async (req, res) => {
  try {
    await pool.query('UPDATE notificaciones SET leida = TRUE');
    res.json({ mensaje: 'Todas las notificaciones marcadas como leídas' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al actualizar notificaciones' });
  }
};

module.exports = {
  obtenerNotificaciones,
  marcarLeida,
  marcarTodasLeidas
};
