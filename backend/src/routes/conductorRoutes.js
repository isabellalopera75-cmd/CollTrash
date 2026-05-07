const express = require('express');
const router = express.Router();
const {
  misRutas, iniciarRuta, actualizarSector,
  registrarDescarga, completarDescarga,
  registrarGPS, reportarIncidencia, finalizarRuta
} = require('../controllers/conductorController');
const { verificarToken, soloConductor } = require('../middlewares/authMiddleware');

router.get('/mis-rutas', verificarToken, soloConductor, misRutas);
router.put('/:id/iniciar', verificarToken, soloConductor, iniciarRuta);
router.put('/:id/sector/:sectorId/progreso', verificarToken, soloConductor, actualizarSector);
router.post('/:id/descargas', verificarToken, soloConductor, registrarDescarga);
router.put('/:id/descargas/:descargaId/completar', verificarToken, soloConductor, completarDescarga);
router.post('/:id/gps', verificarToken, soloConductor, registrarGPS);
router.post('/:id/incidencias', verificarToken, soloConductor, reportarIncidencia);
router.put('/:id/finalizar', verificarToken, soloConductor, finalizarRuta);

module.exports = router;