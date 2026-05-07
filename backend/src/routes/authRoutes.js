const express = require('express');
const router = express.Router();
const { login, registrarConductor, obtenerPerfil } = require('../controllers/authController');
const { verificarToken, soloAdmin } = require('../middlewares/authMiddleware');
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/registrar-conductor (solo admin)
router.post('/registrar-conductor', verificarToken, soloAdmin, registrarConductor);

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
    res.json({ mensaje: 'Login con Google exitoso.', token, ciudadano: req.user });
  }
);

// GET /api/auth/conductores (solo admin)
router.get('/conductores', verificarToken, soloAdmin, async (req, res) => {
  const pool = require('../config/database');
  const resultado = await pool.query(
    "SELECT id, nombre, email, activo FROM usuarios WHERE rol = 'conductor' ORDER BY nombre ASC"
  );
  res.json({ conductores: resultado.rows });
});

module.exports = router;