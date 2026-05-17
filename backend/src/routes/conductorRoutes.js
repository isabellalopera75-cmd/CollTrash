const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const {
  misRutas, iniciarRuta, actualizarSector,
  registrarDescarga, completarDescarga,
  registrarGPS, reportarIncidencia, finalizarRuta
} = require('../controllers/conductorController');
const { verificarToken, soloConductor } = require('../middlewares/authMiddleware');

// ── Perfil de Asignación ─────────────────────────────────────
// Obtiene la asignación del día para el conductor (Usada por ConductorPanel.jsx)
router.get('/mi-asignacion', verificarToken, async (req, res) => {
  const conductorId = req.usuario.id;
  const fecha = req.query.fecha || new Date().toISOString().split('T')[0];
  try {
    const r = await pool.query(
      `SELECT a.id,
              rf.nombre        AS ruta_nombre,
              v.placa          AS vehiculo_placa,
              v.modelo         AS vehiculo_modelo,
              j.nombre         AS jornada_nombre,
              j.hora_inicio,
              j.hora_limite_fin,
              a.estado,
              a.hora_inicio_real
       FROM asignaciones_semanales a
       JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id
       JOIN vehiculos    v  ON v.id  = a.vehiculo_id
       JOIN jornadas     j  ON j.id  = rf.jornada_id
        WHERE a.conductor_id = $1 AND a.fecha = $2
        ORDER BY 
          CASE 
            WHEN a.estado = 'activa' THEN 0
            WHEN a.estado = 'pendiente' AND j.hora_limite_fin >= CURRENT_TIME THEN 1
            ELSE 2
          END,
          j.hora_inicio ASC
        LIMIT 1`,
      [conductorId, fecha]
    );
    res.json({ asignacion: r.rows[0] || null });
  } catch (e) {
    console.error('Error en mi-asignacion:', e.message);
    res.status(500).json({ mensaje: 'Error al obtener asignación.' });
  }
});

// Obtiene paradas/sectores (Usada por ConductorPanel.jsx)
router.get('/mis-paradas/:asignacionId', verificarToken, async (req, res) => {
  const { asignacionId } = req.params;
  try {
    const r = await pool.query(
      `SELECT sa.id,
              sa.sector_id,
              sr.nombre,
              sr.orden,
              sr.trazado_geom,
              sr.porcentaje_requerido,
              sa.estado,
              sa.porcentaje_recorrido,
              sa.completado_at
       FROM sectores_asignacion sa
       JOIN sectores_ruta sr ON sr.id = sa.sector_id
       WHERE sa.asignacion_id = $1
       ORDER BY sr.orden ASC`,
      [asignacionId]
    );
    res.json({ paradas: r.rows });
  } catch (e) {
    console.error('Error en mis-paradas:', e.message);
    res.status(500).json({ mensaje: 'Error al obtener paradas.' });
  }
});

// ── Control de Jornada ───────────────────────────────────────
// Iniciar recorrido (Llama al controlador con lógica de simulador y justificación)
router.put('/asignacion/:id/iniciar', verificarToken, iniciarRuta);

// Finalizar recorrido (Llama al controlador con lógica de cierre y toneladas)
router.put('/asignacion/:id/finalizar', verificarToken, finalizarRuta);

// ── Operación de Sectores ────────────────────────────────────
// Actualizar progreso (Llama al controlador)
router.put('/asignacion/:id/sector/:sectorId/progreso', verificarToken, actualizarSector);

// ── Descargas e Incidencias ──────────────────────────────────
router.post('/asignacion/:id/descargas', verificarToken, registrarDescarga);
router.put('/asignacion/:id/descargas/:descargaId/completar', verificarToken, completarDescarga);
router.post('/asignacion/:id/incidencias', verificarToken, reportarIncidencia);

// ── Telemetría ───────────────────────────────────────────────
router.post('/asignacion/:id/gps', verificarToken, registrarGPS);

// ── Rutas Legacy / Compatibilidad (Si se usan en algún lugar) ──
router.get('/mis-rutas', verificarToken, soloConductor, misRutas);
router.put('/:id/iniciar', verificarToken, soloConductor, iniciarRuta);
router.put('/:id/finalizar', verificarToken, soloConductor, finalizarRuta);

module.exports = router;