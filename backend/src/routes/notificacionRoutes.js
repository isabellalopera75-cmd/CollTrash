const express = require('express');
const router = express.Router();
const { obtenerNotificaciones, obtenerTodasNotificaciones, marcarLeida, marcarTodasLeidas } = require('../controllers/notificacionController');
const { verificarToken } = require('../middlewares/authMiddleware');

router.get('/todas', verificarToken, obtenerTodasNotificaciones);
router.get('/', verificarToken, obtenerNotificaciones);
router.put('/:id/leer', verificarToken, marcarLeida);
router.put('/leer-todo', verificarToken, marcarTodasLeidas);

module.exports = router;
