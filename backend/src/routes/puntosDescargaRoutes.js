const express = require('express');
const router = express.Router();
const { obtenerPuntosDescarga, crearPuntoDescarga, eliminarPuntoDescarga } = require('../controllers/puntosDescargaController');
const { verificarToken, soloAdmin } = require('../middlewares/authMiddleware');

router.get('/', verificarToken, obtenerPuntosDescarga);
router.post('/', verificarToken, soloAdmin, crearPuntoDescarga);
router.delete('/:id', verificarToken, soloAdmin, eliminarPuntoDescarga);

module.exports = router;
