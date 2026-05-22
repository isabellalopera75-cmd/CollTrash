const express = require('express');
const router = express.Router();
const { obtenerAsignacionesPorFecha, reasignarAsignacion, habilitarInicioTardio, obtenerAsignacionesDisponibles } = require('../controllers/asignacionesController');
const { verificarToken, soloAdmin } = require('../middlewares/authMiddleware');

router.get('/disponibles', verificarToken, soloAdmin, obtenerAsignacionesDisponibles);
router.get('/', verificarToken, soloAdmin, obtenerAsignacionesPorFecha);
router.put('/:id/reasignar', verificarToken, soloAdmin, reasignarAsignacion);
router.put('/:id/reactivar', verificarToken, soloAdmin, habilitarInicioTardio);

module.exports = router;
