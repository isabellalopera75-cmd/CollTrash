const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const {
  misRutas, iniciarRuta, actualizarSector,
  registrarDescarga, completarDescarga,
  registrarGPS, reportarIncidencia, finalizarRuta
} = require('../controllers/conductorController');
const { verificarToken, soloConductor } = require('../middlewares/authMiddleware');

// ── GET /api/conductor/mi-asignacion?fecha=YYYY-MM-DD ─────────
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
       LIMIT 1`,
      [conductorId, fecha]
    );
    res.json({ asignacion: r.rows[0] || null });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ mensaje: 'Error al obtener asignación.' });
  }
});

// ── GET /api/conductor/mis-paradas/:asignacionId ──────────────
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
    console.error(e.message);
    res.status(500).json({ mensaje: 'Error al obtener paradas.' });
  }
});

// ── PUT /api/conductor/parada/:id/completar ───────────────────
// Compatible con botón manual Y con trigger automático al 90%
router.put('/parada/:id/completar', verificarToken, async (req, res) => {
  const { id } = req.params;
  const { porcentaje_recorrido = 100 } = req.body;
  try {
    const r = await pool.query(
      `UPDATE sectores_asignacion
       SET estado = 'completado',
           completado_at = NOW(),
           porcentaje_recorrido = $1
       WHERE id = $2
       RETURNING *`,
      [porcentaje_recorrido, id]
    );
    if (!r.rows.length) return res.status(404).json({ mensaje: 'Parada no encontrada.' });
    res.json({ parada: r.rows[0] });
  } catch (e) {
    res.status(500).json({ mensaje: 'Error al completar parada.' });
  }
});

// ── PUT /api/conductor/asignacion/:id/iniciar ─────────────────
router.put('/asignacion/:id/iniciar', verificarToken, async (req, res) => {
  const { id } = req.params;
  const conductorId = req.usuario.id;
  try {
    await pool.query(
      `UPDATE asignaciones_semanales
       SET estado = 'en_ruta', hora_inicio_real = NOW()
       WHERE id = $1 AND conductor_id = $2`,
      [id, conductorId]
    );
    res.json({ mensaje: 'Recorrido iniciado.' });
  } catch (e) {
    res.status(500).json({ mensaje: 'Error al iniciar recorrido.' });
  }
});

// ── PUT /api/conductor/asignacion/:id/finalizar ───────────────
router.put('/asignacion/:id/finalizar', verificarToken, async (req, res) => {
  const { id } = req.params;
  const conductorId = req.usuario.id;
  try {
    await pool.query(
      `UPDATE asignaciones_semanales
       SET estado = 'completada', hora_fin_real = NOW()
       WHERE id = $1 AND conductor_id = $2`,
      [id, conductorId]
    );
    res.json({ mensaje: 'Recorrido finalizado.' });
  } catch (e) {
    res.status(500).json({ mensaje: 'Error al finalizar recorrido.' });
  }
});

// ── POST /api/conductor/gps ───────────────────────────────────
router.post('/gps', verificarToken, async (req, res) => {
  const { asignacion_id, latitud, longitud } = req.body;
  try {
    await pool.query(
      `INSERT INTO rastreo_gps (asignacion_id, latitud, longitud, sincronizado)
       VALUES ($1, $2, $3, true)`,
      [asignacion_id, latitud, longitud]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ mensaje: 'Error al guardar GPS.' });
  }
});

// ── Rutas originales ──────────────────────────────────────────
router.get('/mis-rutas', verificarToken, soloConductor, misRutas);
router.put('/:id/iniciar', verificarToken, soloConductor, iniciarRuta);
router.put('/:id/sector/:sectorId/progreso', verificarToken, soloConductor, actualizarSector);
router.post('/:id/descargas', verificarToken, soloConductor, registrarDescarga);
router.put('/:id/descargas/:descargaId/completar', verificarToken, soloConductor, completarDescarga);
router.post('/:id/gps-legacy', verificarToken, soloConductor, registrarGPS);
router.post('/:id/incidencias', verificarToken, soloConductor, reportarIncidencia);
router.put('/:id/finalizar', verificarToken, soloConductor, finalizarRuta);

module.exports = router;