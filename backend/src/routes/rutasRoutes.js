const express = require('express');
const router = express.Router();
const { crearRutaFija, obtenerRutasFijas, obtenerRutaFijaPorId, editarRutaFija, eliminarRutaFija, obtenerVehiculos, obtenerJornadas, crearVehiculo, editarVehiculo, crearJornada, editarJornada } = require('../controllers/rutasController');
const { verificarToken, soloAdmin } = require('../middlewares/authMiddleware');

router.get('/', verificarToken, soloAdmin, obtenerRutasFijas);
router.post('/', verificarToken, soloAdmin, crearRutaFija);
router.get('/vehiculos', verificarToken, soloAdmin, obtenerVehiculos);
router.post('/vehiculos', verificarToken, soloAdmin, crearVehiculo);
router.put('/vehiculos/:id', verificarToken, soloAdmin, editarVehiculo);
router.get('/jornadas', verificarToken, soloAdmin, obtenerJornadas);
router.post('/jornadas', verificarToken, soloAdmin, crearJornada);
router.put('/jornadas/:id', verificarToken, soloAdmin, editarJornada);
router.get('/:id', verificarToken, soloAdmin, obtenerRutaFijaPorId);
router.put('/:id', verificarToken, soloAdmin, editarRutaFija);
router.delete('/:id', verificarToken, soloAdmin, eliminarRutaFija);

module.exports = router;