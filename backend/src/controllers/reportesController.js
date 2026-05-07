const pool = require('../config/database');
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
});

const crearReporte = async (req, res) => {
  const { latitud, longitud, descripcion, foto_url } = req.body;
  const ciudadanoId = req.usuario.id;

  try {
    if (!latitud || !longitud || !descripcion || !foto_url) {
      return res.status(400).json({ mensaje: 'Ubicación, foto y descripción son obligatorios.' });
    }

    const resultado = await pool.query(
      `INSERT INTO reportes_ciudadanos (ciudadano_id, latitud, longitud, descripcion, foto_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [ciudadanoId, latitud, longitud, descripcion, foto_url]
    );

    res.status(201).json({ mensaje: 'Reporte enviado exitosamente.', reporte: resultado.rows[0] });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const obtenerReportes = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT r.*, c.nombre AS ciudadano_nombre, c.email AS ciudadano_email
       FROM reportes_ciudadanos r
       JOIN ciudadanos c ON c.id = r.ciudadano_id
       ORDER BY r.created_at DESC`
    );
    res.status(200).json({ reportes: resultado.rows });
  } catch (error) {
    console.error('Error:', error.message);
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

    const ciudadano = await pool.query(
      'SELECT email, nombre FROM ciudadanos WHERE id = $1',
      [reporte.rows[0].ciudadano_id]
    );

    if (ciudadano.rows[0].email && process.env.GMAIL_USER) {
      await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: ciudadano.rows[0].email,
        subject: 'CollTrash — Tu reporte fue atendido',
        html: `<h2>Hola ${ciudadano.rows[0].nombre}</h2>
               <p>Tu reporte de punto crítico de basura ha sido recibido y está en proceso de solución.</p>
               <p>Gracias por ayudarnos a mantener limpia nuestra ciudad.</p>`
      });
    }

    res.status(200).json({ mensaje: 'Reporte atendido y ciudadano notificado.' });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const rechazarReporte = async (req, res) => {
  const { id } = req.params;
  const { motivo } = req.body;

  try {
    const reporte = await pool.query(
      `UPDATE reportes_ciudadanos SET estado = 'rechazado'
       WHERE id = $1 RETURNING *`,
      [id]
    );

    if (reporte.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Reporte no encontrado.' });
    }

    const ciudadano = await pool.query(
      'SELECT email, nombre FROM ciudadanos WHERE id = $1',
      [reporte.rows[0].ciudadano_id]
    );

    if (ciudadano.rows[0].email && process.env.GMAIL_USER) {
      await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: ciudadano.rows[0].email,
        subject: 'CollTrash — Actualización de tu reporte',
        html: `<h2>Hola ${ciudadano.rows[0].nombre}</h2>
               <p>Hemos revisado tu reporte y en esta ocasión no es necesario realizar una recolección adicional.</p>
               <p><strong>Motivo:</strong> ${motivo || 'El punto ya está incluido en las rutas programadas.'}</p>`
      });
    }

    res.status(200).json({ mensaje: 'Reporte rechazado y ciudadano notificado.' });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

module.exports = { crearReporte, obtenerReportes, atenderReporte, rechazarReporte };