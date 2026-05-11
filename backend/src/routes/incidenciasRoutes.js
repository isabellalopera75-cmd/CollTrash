const express = require('express');
const router = express.Router();
const { obtenerIncidenciasActivas, alargarJornada, crearIncidencia } = require('../controllers/incidenciasController');
const { verificarToken, soloAdmin } = require('../middlewares/authMiddleware');

// Conductor crea una incidencia
router.post('/', verificarToken, crearIncidencia);

// Admin consulta incidencias activas
router.get('/', verificarToken, soloAdmin, obtenerIncidenciasActivas);

// Admin alarga jornada por incidencia
router.post('/:id/alargar', verificarToken, soloAdmin, alargarJornada);

// Admin marca incidencia como resuelta
router.put('/:id/resolver', verificarToken, soloAdmin, async (req, res) => {
  const pool = require('../config/database');
  try {
    await pool.query(
      'UPDATE incidencias_conductor SET resuelto = TRUE, resolucion = $1 WHERE id = $2',
      [req.body.resolucion || 'Resuelta por el administrador', req.params.id]
    );
    res.json({ mensaje: 'Incidencia marcada como resuelta.' });
  } catch (e) {
    res.status(500).json({ mensaje: 'Error al resolver incidencia.' });
  }
});

module.exports = router;
