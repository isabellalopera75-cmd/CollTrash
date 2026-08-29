const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { enviarCorreo, plantillaRecuperacion } = require('../services/emailService');
const { registrarActividad } = require('../services/auditoriaService');
const { esOrigenPermitido } = require('../config/socket');
require('dotenv').config();

// Vigencia del enlace. Suficiente para abrir el correo con calma, corto para
// que un enlace olvidado en la bandeja no siga siendo una llave.
const MINUTOS_VIGENCIA = 30;

// Longitud mínima de la contraseña nueva. La misma que ya exige el registro.
const LARGO_MINIMO = 6;

/** SHA-256 en hexadecimal. En la base sólo se guarda esto, nunca el token. */
const hashDeToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Base del enlace que se envía por correo.
 *
 * Se prefiere el origen desde el que se pidió: así el enlace funciona tanto en
 * local como a través de un túnel, cuya dirección cambia en cada arranque y no
 * puede estar fija en el .env. Sólo se acepta si pasa la misma comprobación que
 * usa CORS, para que nadie pueda inyectar un dominio ajeno con una cabecera
 * Origin falsa y recibir el enlace apuntando a su propio servidor.
 */
const baseDelEnlace = (req) => {
  const origen = req.headers.origin;
  if (origen && esOrigenPermitido(origen, req.headers.host)) return origen;

  const declarados = (process.env.FRONTEND_URL || '').split(',').map(o => o.trim()).filter(Boolean);
  return declarados[0] || `http://localhost:${process.env.PORT || 3000}`;
};

/**
 * Paso 1: el usuario pide el enlace.
 *
 * Responde siempre lo mismo, exista o no la cuenta. Distinguir ambos casos
 * convertiría este endpoint en un detector de correos registrados.
 */
const solicitarRecuperacion = async (req, res) => {
  const { email } = req.body;

  const respuestaNeutra = {
    mensaje: 'Si el correo corresponde a una cuenta registrada, recibirás un enlace para restablecer tu contraseña.'
  };

  try {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ mensaje: 'Indica un correo electrónico válido.' });
    }

    const usuarios = await pool.query(
      'SELECT id, nombre, email FROM usuarios WHERE lower(email) = lower($1) AND activo = TRUE',
      [email.trim()]
    );
    const usuario = usuarios.rows[0];

    // Sin cuenta no hay nada que hacer, pero la respuesta es la misma.
    if (!usuario) return res.status(200).json(respuestaNeutra);

    const token = crypto.randomBytes(32).toString('hex');
    const base = baseDelEnlace(req);

    await pool.query(
      `INSERT INTO recuperaciones_password (usuario_id, token_hash, expira_en, solicitado_desde)
       VALUES ($1, $2, NOW() + make_interval(mins => $3), $4)`,
      [usuario.id, hashDeToken(token), MINUTOS_VIGENCIA, base.slice(0, 120)]
    );

    const enlace = `${base}/restablecer?token=${token}`;
    const { html, texto } = plantillaRecuperacion({
      nombre: usuario.nombre,
      enlace,
      minutos: MINUTOS_VIGENCIA
    });

    // El resultado del envío no cambia la respuesta: si el correo falla, el
    // visitante no debe deducir de ello que la cuenta existe. Queda en el log.
    const envio = await enviarCorreo({
      para: usuario.email,
      asunto: 'Restablece tu contraseña de CollTrash',
      html,
      texto
    });

    if (!envio.enviado) {
      console.error(`[recuperación] No se pudo enviar el enlace a la cuenta ${usuario.id}:`, envio.motivo);
    }

    res.status(200).json(respuestaNeutra);
  } catch (error) {
    console.error('Error al solicitar recuperación:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

/**
 * Paso 2: la pantalla de restablecimiento comprueba el enlace antes de pedir
 * nada. Sin esto, el usuario escribiría una contraseña nueva para descubrir al
 * enviarla que el enlace ya había caducado.
 */
const verificarTokenRecuperacion = async (req, res) => {
  const { token } = req.query;

  try {
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ valido: false, mensaje: 'Enlace incompleto.' });
    }

    const r = await pool.query(
      `SELECT rp.id, rp.usado_en, rp.expira_en, u.nombre
         FROM recuperaciones_password rp
         JOIN usuarios u ON u.id = rp.usuario_id
        WHERE rp.token_hash = $1`,
      [hashDeToken(token)]
    );

    const fila = r.rows[0];
    if (!fila) {
      return res.status(400).json({ valido: false, mensaje: 'Este enlace no es válido.' });
    }
    if (fila.usado_en) {
      return res.status(400).json({ valido: false, mensaje: 'Este enlace ya fue utilizado. Solicita uno nuevo.' });
    }
    if (new Date(fila.expira_en) <= new Date()) {
      return res.status(400).json({ valido: false, mensaje: 'Este enlace caducó. Solicita uno nuevo.' });
    }

    res.status(200).json({ valido: true, nombre: fila.nombre });
  } catch (error) {
    console.error('Error al verificar token de recuperación:', error.message);
    res.status(500).json({ valido: false, mensaje: 'Error interno del servidor.' });
  }
};

/** Paso 3: se guarda la contraseña nueva. */
const restablecerPassword = async (req, res) => {
  const { token, password } = req.body;

  const client = await pool.connect();
  try {
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ mensaje: 'Enlace incompleto.' });
    }
    if (!password || typeof password !== 'string' || password.trim().length < LARGO_MINIMO) {
      return res.status(400).json({ mensaje: `La contraseña debe tener al menos ${LARGO_MINIMO} caracteres.` });
    }

    await client.query('BEGIN');

    // FOR UPDATE: dos envíos simultáneos del mismo enlace se serializan y sólo
    // el primero lo encuentra sin usar.
    const r = await client.query(
      `SELECT id, usuario_id, usado_en, expira_en
         FROM recuperaciones_password
        WHERE token_hash = $1
        FOR UPDATE`,
      [hashDeToken(token)]
    );

    const fila = r.rows[0];
    if (!fila || fila.usado_en || new Date(fila.expira_en) <= new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ mensaje: 'Este enlace no es válido o ya caducó. Solicita uno nuevo.' });
    }

    const hash = await bcrypt.hash(password.trim(), 10);

    // La contraseña nueva levanta también el bloqueo por intentos fallidos: sin
    // esto, quien la recupera precisamente porque no acertaba seguiría sin poder
    // entrar hasta que venciera el castigo.
    await client.query(
      `UPDATE usuarios
          SET password_hash = $1, intentos_fallidos = 0, bloqueado_hasta = NULL
        WHERE id = $2`,
      [hash, fila.usuario_id]
    );

    await client.query(
      'UPDATE recuperaciones_password SET usado_en = NOW() WHERE id = $1',
      [fila.id]
    );

    // El resto de enlaces vivos de esa cuenta dejan de servir: cambiar la
    // contraseña invalida cualquier petición anterior.
    await client.query(
      `UPDATE recuperaciones_password
          SET usado_en = NOW()
        WHERE usuario_id = $1 AND usado_en IS NULL`,
      [fila.usuario_id]
    );

    await client.query('COMMIT');

    await registrarActividad(
      fila.usuario_id,
      'Restablecimiento de Contraseña',
      'usuarios',
      fila.usuario_id,
      'El usuario restableció su contraseña mediante un enlace de recuperación.'
    );

    res.status(200).json({ mensaje: 'Tu contraseña fue actualizada. Ya puedes iniciar sesión.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al restablecer contraseña:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  } finally {
    client.release();
  }
};

module.exports = { solicitarRecuperacion, verificarTokenRecuperacion, restablecerPassword };
