const express = require('express');
const router = express.Router();
const { 
  dashboardDiario, 
  dashboardSemanal, 
  dashboardMensual,
  reporteEficiencia,
  obtenerNovedadesOperativas 
} = require('../controllers/dashboardController');
const { verificarToken, soloAdmin } = require('../middlewares/authMiddleware');

router.get('/diario', verificarToken, soloAdmin, dashboardDiario);
router.get('/semanal', verificarToken, soloAdmin, dashboardSemanal);
router.get('/mensual', verificarToken, soloAdmin, dashboardMensual);
router.get('/eficiencia', verificarToken, soloAdmin, reporteEficiencia);
router.get('/novedades', verificarToken, soloAdmin, obtenerNovedadesOperativas);

module.exports = router;