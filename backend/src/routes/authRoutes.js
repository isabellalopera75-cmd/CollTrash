const express = require('express');
const router = express.Router();
const { login, registrarConductor, editarConductor, eliminarConductor, obtenerPerfil, registrarCiudadano } = require('../controllers/authController');
const { verificarToken, soloAdmin } = require('../middlewares/authMiddleware');
const { solicitarRecuperacion, verificarTokenRecuperacion, restablecerPassword } = require('../controllers/recuperacionController');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Limitador de intentos para verificar correo (mitiga enumeración de usuarios)
const verificarCorreoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 15, // máximo 15 verificaciones por IP cada 15 min
  message: { mensaje: 'Demasiadas solicitudes de verificación de correo. Intente más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limitador de intentos para Login.
//
// La defensa real contra fuerza bruta es el bloqueo por cuenta de la migracion
// 013 (cinco fallos consecutivos, quince minutos). Este limitador es solo una
// segunda barrera por IP, y con 10 intentos cada 15 minutos rompia la
// demostracion: detras de ngrok o de un mismo wifi todos los asistentes
// comparten direccion publica, asi que entre todos agotaban la cuota y el
// sistema empezaba a rechazar a usuarios con credenciales correctas.
//
// skipSuccessfulRequests: los ingresos correctos no consumen cuota, de modo que
// solo los fallos acercan al limite.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50, // fallos de login por IP cada 15 min
  skipSuccessfulRequests: true,
  message: { mensaje: 'Demasiados intentos de inicio de sesión. Por favor, intente de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limitador de intentos para registro de ciudadano (previene spam)
const registroLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  // Mismo motivo que en el login: durante una demostracion todos los
  // ciudadanos se registran desde la misma red, y con 5 cuentas por hora el
  // sexto asistente ya no podia crear la suya.
  max: 40, // máximo 40 cuentas creadas por IP por hora
  message: { mensaje: 'Demasiadas solicitudes de registro desde esta IP. Intente de nuevo más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limitador de solicitudes de recuperacion.
//
// Es un endpoint que envia correo a terceros: sin freno, cualquiera podria
// usarlo para inundar el buzon de un usuario legitimo. Se cuenta por IP y no
// por cuenta, porque el atacante elige el destinatario y castigar a la cuenta
// seria dejar que bloquee a quien quiera.
const recuperacionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20,
  message: { mensaje: 'Demasiadas solicitudes de recuperación. Intente de nuevo más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Recuperación de contraseña (los tres pasos son públicos: quien los usa
//    no puede iniciar sesión, que es justamente el problema) ──────────────
router.post('/recuperar-password', recuperacionLimiter, solicitarRecuperacion);
router.get('/verificar-token-recuperacion', verificarTokenRecuperacion);
router.post('/restablecer-password', recuperacionLimiter, restablecerPassword);

// GET /api/auth/verificar-correo
router.get('/verificar-correo', verificarCorreoLimiter, async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ mensaje: 'Email es requerido.' });
  }
  try {
    const pool = require('../config/database');
    const resultado = await pool.query(
      'SELECT id, rol, email FROM usuarios WHERE lower(email) = $1 AND activo = TRUE',
      [email.trim().toLowerCase()]
    );
    if (resultado.rows.length > 0) {
      return res.json({ existe: true, rol: resultado.rows[0].rol });
    }
    return res.json({ existe: false });
  } catch (error) {
    console.error('Error al verificar correo:', error.message);
    return res.status(500).json({ mensaje: 'Error al verificar correo.' });
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, login);

// POST /api/auth/registrar-conductor (solo admin)
router.post('/registrar-conductor', verificarToken, soloAdmin, registrarConductor);

// PUT /api/auth/conductor/:id (solo admin)
router.put('/conductor/:id', verificarToken, soloAdmin, editarConductor);

// DELETE /api/auth/conductor/:id (solo admin)
router.delete('/conductor/:id', verificarToken, soloAdmin, eliminarConductor);

// GET /api/auth/perfil
router.get('/perfil', verificarToken, obtenerPerfil);

// POST /api/auth/registrar-ciudadano
router.post('/registrar-ciudadano', registroLimiter, registrarCiudadano);

// GET /api/auth/conductores (solo admin)
router.get('/conductores', verificarToken, soloAdmin, async (req, res) => {
  const pool = require('../config/database');
  const resultado = await pool.query(
    "SELECT id, nombre, email, cedula, telefono, activo FROM usuarios WHERE rol = 'conductor' AND activo = TRUE ORDER BY nombre ASC"
  );
  res.json({ conductores: resultado.rows });
});

module.exports = router;