const express = require('express');
const router = express.Router();
const { getConfig, updateConfig } = require('../controllers/configController');
const { verificarToken, soloAdmin } = require('../middlewares/authMiddleware');

router.get('/', verificarToken, soloAdmin, getConfig);
router.post('/', verificarToken, soloAdmin, updateConfig);

module.exports = router;
