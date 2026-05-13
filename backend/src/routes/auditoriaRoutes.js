const express = require('express');
const router = express.Router();
const { obtenerHistorial } = require('../controllers/auditoriaController');
const { verificarToken, soloAdmin } = require('../middlewares/authMiddleware');

router.get('/', verificarToken, soloAdmin, obtenerHistorial);

module.exports = router;
