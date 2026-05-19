const pool = require('../config/database');
const { crearNotificacion } = require('../services/notificacionService');
const { getIo } = require('../config/socket');
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
});

const crearReporte = async (req, res) => {
  const { latitud, longitud, descripcion, foto_url, tipo_problema, nombre_ciudadano, barrio_id } = req.body;
  
  // El ciudadanoId es opcional si entra como invitado/Google simulado
  const ciudadanoId = req.usuario ? req.usuario.id : null;

  try {
    if (!latitud || !longitud || !tipo_problema || !nombre_ciudadano) {
      return res.status(400).json({ mensaje: 'Ubicación, tipo de problema y nombre son obligatorios.' });
    }

    const resultado = await pool.query(
      `INSERT INTO reportes_ciudadanos (ciudadano_id, latitud, longitud, descripcion, foto_url, tipo_problema, nombre_ciudadano)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [ciudadanoId, latitud, longitud, descripcion, foto_url, tipo_problema, nombre_ciudadano]
    );

    // NOTIFICAR ADMIN: Nuevo reporte ciudadano
    await crearNotificacion({
      titulo: '👥 Reporte Ciudadano',
      mensaje: `Nuevo reporte de ${nombre_ciudadano} por ${tipo_problema}.`,
      tipo: 'comunidad',
      metadata: { reporte_id: resultado.rows[0].id, tipo: 'REPORTE_CIUDADANO' }
    });

    res.status(201).json({ mensaje: 'Reporte enviado exitosamente.', reporte: resultado.rows[0] });
  } catch (error) {
    console.error('Error al crear reporte:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const obtenerReportes = async (req, res) => {
  try {
    // Usamos LEFT JOIN para que se vean los reportes aunque no tengan un ciudadano_id vinculado
    const resultado = await pool.query(
      `SELECT r.*, COALESCE(c.nombre, r.nombre_ciudadano) AS ciudadano_nombre, c.email AS ciudadano_email
       FROM reportes_ciudadanos r
       LEFT JOIN ciudadanos c ON c.id = r.ciudadano_id
       ORDER BY r.created_at DESC`
    );
    res.status(200).json({ reportes: resultado.rows });
  } catch (error) {
    console.error('Error al obtener reportes:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const atenderReporte = async (req, res) => {
  const { id } = req.params;
  const { asignacion_id } = req.body;

  try {
    const reporte = await pool.query(
      `UPDATE reportes_ciudadanos SET estado = 'en_proceso', asignacion_id = $1, atendido_at = NOW()
       WHERE id = $2 RETURNING *`,
      [asignacion_id, id]
    );

    if (reporte.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Reporte no encontrado.' });
    }

    // Emitir por Socket.io en tiempo real
    const io = getIo();
    if (io) {
      io.emit('reporte_actualizado', reporte.rows[0]);
    }

    // Si tiene email de ciudadano, intentamos notificar
    const ciudadano = await pool.query(
      'SELECT email, nombre FROM ciudadanos WHERE id = $1',
      [reporte.rows[0].ciudadano_id]
    );

    if (ciudadano.rows.length > 0 && ciudadano.rows[0].email && process.env.GMAIL_USER) {
      await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: ciudadano.rows[0].email,
        subject: 'CollTrash — Tu reporte fue atendido',
        html: `<h2>Hola ${ciudadano.rows[0].nombre}</h2>
               <p>Tu reporte de punto crítico de basura ha sido recibido y está en proceso de solución.</p>`
      });
    }

    res.status(200).json({ mensaje: 'Reporte atendido correctamente.' });
  } catch (error) {
    console.error('Error al atender:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const rechazarReporte = async (req, res) => {
  const { id } = req.params;
  const { justificacion } = req.body;

  try {
    const resultado = await pool.query(
      `UPDATE reportes_ciudadanos SET estado = 'rechazado', justificacion_rechazo = $1 WHERE id = $2 RETURNING *`,
      [justificacion, id]
    );

    // Emitir por Socket.io en tiempo real
    const io = getIo();
    if (io) {
      io.emit('reporte_actualizado', resultado.rows[0]);
    }

    res.status(200).json({ mensaje: 'Reporte rechazado.', reporte: resultado.rows[0] });
  } catch (error) {
    console.error('Error al rechazar reporte:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const actualizarEstado = async (req, res) => {
  const { id } = req.params;
  const { estado, justificacion_rechazo, ruta_id, fecha_programada } = req.body;

  try {
    let resultado;
    if (estado === 'en_proceso' || estado === 'resuelto' || estado === 'atendido') {
      const msjAceptado = `Programado para recolección en ruta asignada (${fecha_programada || 'Próximas 48h'})`;
      resultado = await pool.query(
        `UPDATE reportes_ciudadanos 
         SET estado = $1, asignacion_id = $2, justificacion_rechazo = $4, atendido_at = NOW()
         WHERE id = $3 RETURNING *`,
        [estado, ruta_id || null, id, msjAceptado]
      );
    } else if (estado === 'rechazado') {
      resultado = await pool.query(
        `UPDATE reportes_ciudadanos 
         SET estado = 'rechazado', justificacion_rechazo = $1
         WHERE id = $2 RETURNING *`,
        [justificacion_rechazo || null, id]
      );
    } else {
      resultado = await pool.query(
        `UPDATE reportes_ciudadanos SET estado = $1 WHERE id = $2 RETURNING *`,
        [estado, id]
      );
    }

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Reporte no encontrado.' });
    }

    // Emitir por Socket.io en tiempo real
    const io = getIo();
    if (io) {
      io.emit('reporte_actualizado', resultado.rows[0]);
    }

    res.status(200).json({ mensaje: 'Estado de reporte actualizado.', reporte: resultado.rows[0] });
  } catch (error) {
    console.error('Error al actualizar estado del reporte:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const obtenerMisReportes = async (req, res) => {
  const ciudadanoId = req.usuario.id;
  try {
    const resultado = await pool.query(
      `SELECT * FROM reportes_ciudadanos WHERE ciudadano_id = $1 ORDER BY created_at DESC`,
      [ciudadanoId]
    );
    res.status(200).json({ reportes: resultado.rows });
  } catch (error) {
    console.error('Error al obtener mis reportes:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

module.exports = { crearReporte, obtenerReportes, atenderReporte, rechazarReporte, obtenerMisReportes, actualizarEstado };