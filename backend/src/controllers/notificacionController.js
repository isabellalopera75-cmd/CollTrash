const pool = require('../config/database');

const obtenerNotificaciones = async (req, res) => {
  try {
    const { id, rol } = req.usuario;
    const filtro = rol === 'administrador'
      ? 'WHERE usuario_id IS NULL OR usuario_id = $1'
      : 'WHERE usuario_id = $1';

    const resultado = await pool.query(
      `SELECT * FROM notificaciones ${filtro} ORDER BY fecha DESC LIMIT 20`,
      [id]
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
    const usuarioId = req.usuario.id;
    const filtro = req.usuario.rol === 'administrador'
      ? '(usuario_id IS NULL OR usuario_id = $2)'
      : 'usuario_id = $2';

    await pool.query(`UPDATE notificaciones SET leida = TRUE WHERE id = $1 AND ${filtro}`, [id, usuarioId]);
    res.json({ mensaje: 'Notificación marcada como leída' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al actualizar notificación' });
  }
};

const marcarTodasLeidas = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const filtro = req.usuario.rol === 'administrador'
      ? 'usuario_id IS NULL OR usuario_id = $1'
      : 'usuario_id = $1';

    await pool.query(`UPDATE notificaciones SET leida = TRUE WHERE ${filtro}`, [usuarioId]);
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
