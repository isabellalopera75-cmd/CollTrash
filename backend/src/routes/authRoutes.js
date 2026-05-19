const express = require('express');
const router = express.Router();
const { login, registrarConductor, editarConductor, obtenerPerfil } = require('../controllers/authController');
const { verificarToken, soloAdmin } = require('../middlewares/authMiddleware');
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// GET /api/auth/verificar-correo
router.get('/verificar-correo', async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ mensaje: 'Email es requerido.' });
  }
  try {
    const pool = require('../config/database');
    const resultado = await pool.query(
      'SELECT id, rol FROM usuarios WHERE email = $1',
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
router.post('/login', login);

// POST /api/auth/registrar-conductor (solo admin)
router.post('/registrar-conductor', verificarToken, soloAdmin, registrarConductor);

// PUT /api/auth/conductor/:id (solo admin)
router.put('/conductor/:id', verificarToken, soloAdmin, editarConductor);

// GET /api/auth/perfil
router.get('/perfil', verificarToken, obtenerPerfil);

// GET /api/auth/google
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// GET /api/auth/google/callback
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login-failed', session: false }),
  (req, res) => {
    const token = jwt.sign(
      { id: req.user.id, email: req.user.email, nombre: req.user.nombre, rol: 'ciudadano' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    
    // Redirigimos al frontend con el token
    // Si tienes un nuevo link de localhost.run, ponlo aquí abajo:
    const frontendURL = 'http://localhost:3001/portal'; 
      
    res.redirect(`${frontendURL}?token=${token}`);
  }
);

// GET /api/auth/conductores (solo admin)
router.get('/conductores', verificarToken, soloAdmin, async (req, res) => {
  const pool = require('../config/database');
  const resultado = await pool.query(
    "SELECT id, nombre, email, cedula, telefono, activo FROM usuarios WHERE rol = 'conductor' ORDER BY nombre ASC"
  );
  res.json({ conductores: resultado.rows });
});

module.exports = router;