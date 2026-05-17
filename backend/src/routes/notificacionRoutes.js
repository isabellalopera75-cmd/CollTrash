const express = require('express');
const router = express.Router();
const { obtenerNotificaciones, marcarLeida, marcarTodasLeidas } = require('../controllers/notificacionController');
const { verificarToken, soloAdmin } = require('../middlewares/authMiddleware');

router.get('/', verificarToken, soloAdmin, obtenerNotificaciones);
router.put('/:id/leer', verificarToken, soloAdmin, marcarLeida);
router.put('/leer-todo', verificarToken, soloAdmin, marcarTodasLeidas);

module.exports = router;
