const express = require('express');
const router = express.Router();
const barriosController = require('../controllers/barriosController');

router.get('/', barriosController.obtenerBarrios);
router.get('/detectar', barriosController.detectarBarrio);

module.exports = router;
