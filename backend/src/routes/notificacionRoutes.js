const express = require('express');
const router = express.Router();
const { obtenerNotificaciones, marcarLeida, marcarTodasLeidas } = require('../controllers/notificacionController');
const { verificarToken } = require('../middlewares/authMiddleware');

router.get('/', verificarToken, obtenerNotificaciones);
router.put('/:id/leer', verificarToken, marcarLeida);
router.put('/leer-todo', verificarToken, marcarTodasLeidas);

module.exports = router;
