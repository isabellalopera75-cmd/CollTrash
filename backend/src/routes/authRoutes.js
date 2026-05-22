const express = require('express');
const router = express.Router();
const { login, registrarConductor, editarConductor, obtenerPerfil, registrarCiudadano } = require('../controllers/authController');
const { verificarToken, soloAdmin } = require('../middlewares/authMiddleware');
const jwt = require('jsonwebtoken');
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

// Limitador de intentos para Login (previene fuerza bruta)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // máximo 10 intentos por IP cada 15 min
  message: { mensaje: 'Demasiados intentos de inicio de sesión. Por favor, intente de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limitador de intentos para registro de ciudadano (previene spam)
const registroLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5, // máximo 5 cuentas creadas por IP por hora
  message: { mensaje: 'Demasiadas solicitudes de registro desde esta IP. Intente de nuevo más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// GET /api/auth/verificar-correo
router.get('/verificar-correo', verificarCorreoLimiter, async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ mensaje: 'Email es requerido.' });
  }
  try {
    const pool = require('../config/database');
    const resultado = await pool.query(
      'SELECT id, rol, email FROM usuarios WHERE email = $1 UNION SELECT id, \'ciudadano\' as rol, email FROM ciudadanos WHERE email = $1',
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

// GET /api/auth/perfil
router.get('/perfil', verificarToken, obtenerPerfil);

// POST /api/auth/registrar-ciudadano
router.post('/registrar-ciudadano', registroLimiter, registrarCiudadano);

// GET /api/auth/conductores (solo admin)
router.get('/conductores', verificarToken, soloAdmin, async (req, res) => {
  const pool = require('../config/database');
  const resultado = await pool.query(
    "SELECT id, nombre, email, cedula, telefono, activo FROM usuarios WHERE rol = 'conductor' ORDER BY nombre ASC"
  );
  res.json({ conductores: resultado.rows });
});

module.exports = router;