const pool = require('../config/database');
const { getIo } = require('../config/socket');

const crearNotificacion = async ({ usuario_id, titulo, mensaje, tipo, metadata }) => {
  try {
    const res = await pool.query(
      `INSERT INTO notificaciones (usuario_id, titulo, mensaje, tipo, metadata)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [usuario_id || null, titulo, mensaje, tipo, metadata || {}]
    );

    const io = getIo();
    if (io) {
      if (usuario_id) {
        io.to(`usuario:${usuario_id}`).emit('notificacion_nueva', res.rows[0]);
      } else {
        io.to('rol:administrador').emit('notificacion_nueva', res.rows[0]);
      }
    }
    return res.rows[0];
  } catch (error) {
    console.error('Error al crear notificación:', error);
  }
};

module.exports = { crearNotificacion };
