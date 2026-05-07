const express = require('express');
const router = express.Router();
const { crearRutaFija, obtenerRutasFijas, obtenerRutaFijaPorId, editarRutaFija, eliminarRutaFija } = require('../controllers/rutasController');
const { verificarToken, soloAdmin } = require('../middlewares/authMiddleware');

router.get('/', verificarToken, soloAdmin, obtenerRutasFijas);
router.post('/', verificarToken, soloAdmin, crearRutaFija);
router.get('/:id', verificarToken, soloAdmin, obtenerRutaFijaPorId);
router.put('/:id', verificarToken, soloAdmin, editarRutaFija);
router.delete('/:id', verificarToken, soloAdmin, eliminarRutaFija);

module.exports = router;