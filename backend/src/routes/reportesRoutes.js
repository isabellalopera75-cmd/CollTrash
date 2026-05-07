const express = require('express');
const router = express.Router();
const { crearReporte, obtenerReportes, atenderReporte, rechazarReporte } = require('../controllers/reportesController');
const { verificarToken, soloAdmin } = require('../middlewares/authMiddleware');

router.post('/', verificarToken, crearReporte);
router.get('/', verificarToken, soloAdmin, obtenerReportes);
router.put('/:id/atender', verificarToken, soloAdmin, atenderReporte);
router.put('/:id/rechazar', verificarToken, soloAdmin, rechazarReporte);

module.exports = router;