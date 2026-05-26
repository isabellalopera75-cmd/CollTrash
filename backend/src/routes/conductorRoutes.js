const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const {
  iniciarRuta, actualizarSector,
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
              a.fecha,
              rf.nombre        AS ruta_nombre,
              v.placa          AS vehiculo_placa,
              v.modelo         AS vehiculo_modelo,
              j.nombre         AS jornada_nombre,
              j.hora_inicio,
              j.hora_limite_fin,
              a.estado,
              a.hora_inicio_real,
              a.km_recorridos,
              EXISTS (
                SELECT 1
                FROM sectores_asignacion sa
                WHERE sa.asignacion_id = a.id
              ) AND NOT EXISTS (
                SELECT 1
                FROM sectores_asignacion sa
                WHERE sa.asignacion_id = a.id
                  AND sa.estado != 'completado'
                  AND COALESCE(sa.porcentaje_recorrido, 0) < 100
              ) AS ruta_recorrida,
              (
                SELECT COALESCE(ROUND(AVG(COALESCE(sa.porcentaje_recorrido, 0))), 0)
                FROM sectores_asignacion sa
                WHERE sa.asignacion_id = a.id
              ) AS progreso_recorrido
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

    let reportesAsignados = [];
    if (r.rows[0]) {
      const repRes = await pool.query(
        `SELECT id, tipo_problema, descripcion, latitud, longitud, foto_url, estado, nombre_ciudadano
         FROM reportes_ciudadanos
         WHERE asignacion_id = $1 AND estado IN ('en_proceso', 'resuelto')`,
        [r.rows[0].id]
      );
      reportesAsignados = repRes.rows;
    }

    res.json({ 
      asignacion: r.rows[0] || null,
      reportesCiudadanos: reportesAsignados
    });
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
router.put('/asignacion/:id/iniciar', verificarToken, soloConductor, iniciarRuta);

// Finalizar recorrido (Llama al controlador con lógica de cierre y toneladas)
router.put('/asignacion/:id/finalizar', verificarToken, soloConductor, finalizarRuta);

// ── Operación de Sectores ────────────────────────────────────
// Actualizar progreso (Llama al controlador)
router.put('/asignacion/:id/sector/:sectorId/progreso', verificarToken, actualizarSector);

// ── Descargas e Incidencias ──────────────────────────────────
router.post('/asignacion/:id/descargas', verificarToken, registrarDescarga);
router.put('/asignacion/:id/descargas/:descargaId/completar', verificarToken, completarDescarga);
router.post('/asignacion/:id/incidencias', verificarToken, reportarIncidencia);

// ── Telemetría ───────────────────────────────────────────────
const rateLimit = require('express-rate-limit');
const gpsLimiter = rateLimit({
  windowMs: 10 * 1000, // 10 segundos
  max: 3, // Máximo 3 peticiones cada 10s (permite 1 cada 3.3s, el simulador envía cada 5s)
  message: { mensaje: 'Frecuencia de actualización de GPS excedida.' }
});

router.post('/asignacion/:id/gps', verificarToken, gpsLimiter, registrarGPS);

// ── Atender Reportes Ciudadanos por Conductor ───────────────
router.put('/reporte/:reporteId/resolver', verificarToken, async (req, res) => {
  const { reporteId } = req.params;
  const conductorId = req.usuario.id;
  try {
    // 1. Verificar que el reporte exista y pertenezca a una asignación activa del conductor
    const validacion = await pool.query(
      `SELECT r.id 
       FROM reportes_ciudadanos r
       JOIN asignaciones_semanales a ON a.id = r.asignacion_id
       WHERE r.id = $1 AND a.conductor_id = $2 AND a.estado = 'activa'`,
      [reporteId, conductorId]
    );

    if (validacion.rows.length === 0) {
      return res.status(403).json({ mensaje: 'No autorizado. El reporte no pertenece a su ruta activa.' });
    }

    // 2. Marcar el reporte como resuelto
    const resultado = await pool.query(
      `UPDATE reportes_ciudadanos 
       SET estado = 'resuelto', updated_at = NOW() 
       WHERE id = $1 RETURNING *`,
      [reporteId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Reporte no encontrado.' });
    }

    const reporte = resultado.rows[0];

    // 3. Notificar por Socket.io
    const { getIo } = require('../config/socket');
    const io = getIo();
    if (io) {
      io.emit('reporte_actualizado', reporte);
    }

    // 4. Crear una notificación de sistema para el Administrador
    const { crearNotificacion } = require('../services/notificacionService');
    await crearNotificacion({
      titulo: '🗑️ Reporte Ciudadano Resuelto',
      mensaje: `El conductor ha atendido y resuelto el reporte ciudadano #${reporte.id} (${reporte.tipo_problema}).`,
      tipo: 'operativo',
      metadata: { reporte_id: reporte.id, tipo: 'REPORTE_RESUELTO' }
    }).catch(notiErr => console.error('Error al crear notificación para admin:', notiErr.message));

    res.json({ mensaje: 'Reporte marcado como resuelto.', reporte });
  } catch (e) {
    console.error('Error al resolver reporte:', e.message);
    res.status(500).json({ mensaje: 'Error interno al actualizar el reporte.' });
  }
});

module.exports = router;
