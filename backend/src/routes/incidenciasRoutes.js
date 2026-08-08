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
  const { resolucion, nuevo_conductor_id, nuevo_vehiculo_id, eta_minutos } = req.body;
  const incidencia_id = req.params.id;

  try {
    const incRes = await pool.query('SELECT * FROM incidencias_conductor WHERE id = $1', [incidencia_id]);
    if (incRes.rows.length === 0) return res.status(404).json({ mensaje: 'Incidencia no encontrada' });
    
    const incidencia = incRes.rows[0];
    const { getIo } = require('../config/socket');
    const io = getIo();

    // ==========================================
    // CASO 1: operario_lesionado (Manual)
    // ==========================================
    if (incidencia.tipo === 'operario_lesionado' && (!nuevo_conductor_id || !nuevo_vehiculo_id)) {
      const r = await pool.query(
        'UPDATE incidencias_conductor SET resuelto = TRUE, resolucion = $1 WHERE id = $2 RETURNING *',
        [resolucion || 'Ambulancia y protocolo gestionado por el administrador', incidencia_id]
      );
      if (io) io.emit('incidencia_resuelta', incidencia_id);
      
      if (io) io.to('usuario:' + incidencia.conductor_id).emit('novedad_atendida', { 
        incidencia_id: incidencia_id, mensaje: 'La ambulancia va en camino, ayuda médica notificada.' 
      });

      return res.json({ mensaje: 'Incidencia de lesión gestionada.', incidencia: r.rows[0] });
    }

    // ==========================================
    // CASO 2: falla_motor o accidente (REASIGNACIÓN)
    // ==========================================
    if (incidencia.tipo === 'falla_motor' || incidencia.tipo === 'accidente' || incidencia.tipo === 'operario_lesionado') {
      if (!nuevo_conductor_id || !nuevo_vehiculo_id) {
        return res.status(400).json({ mensaje: 'Se requiere conductor y vehículo de reemplazo para este tipo de incidencia.' });
      }

      const asigRes = await pool.query('SELECT ruta_fija_id, fecha, km_recorridos, toneladas FROM asignaciones_semanales WHERE id = $1', [incidencia.asignacion_id]);
      const oldAsig = asigRes.rows[0];
      const ruta_fija_id = oldAsig.ruta_fija_id;

      // 1. Actualizar asignación original con el nuevo conductor y vehículo
      await pool.query(
        `UPDATE asignaciones_semanales 
         SET conductor_id = $1, vehiculo_id = $2, estado = 'pendiente' 
         WHERE id = $3`,
        [nuevo_conductor_id, nuevo_vehiculo_id, incidencia.asignacion_id]
      );

      const nueva_asignacion_id = incidencia.asignacion_id;

      await pool.query(
        `INSERT INTO cambios_conductor 
         (ruta_fija_id, conductor_original_id, conductor_reemplazante_id, motivo, fecha_inicio, es_permanente)
         VALUES ($1, $2, $3, $4, CURRENT_DATE, false)`,
        [
          ruta_fija_id, 
          incidencia.conductor_id, 
          nuevo_conductor_id, 
          `Relevo por ${incidencia.tipo}: ${incidencia.descripcion || 'Siniestro en ruta'}`
        ]
      );

      const finalRes = await pool.query(
        'UPDATE incidencias_conductor SET resuelto = TRUE, resolucion = $1 WHERE id = $2 RETURNING *',
        [resolucion || `Relevo asignado. Conductor de refuerzo en camino. ETA: ${eta_minutos || 'N/A'} min.`, incidencia_id]
      );

      if (io) {
        io.emit('incidencia_resuelta', incidencia_id); 
        
        io.to('usuario:' + incidencia.conductor_id).emit('novedad_atendida', { 
          incidencia_id: incidencia_id, 
          mensaje: `La grúa y tu relevo van en camino. ETA estimado: ${eta_minutos || 'N/A'} minutos.` 
        });
      }

      const { crearNotificacion } = require('../services/notificacionService');
      await crearNotificacion({
        usuario_id: nuevo_conductor_id,
        titulo: '🚨 Relevo de Emergencia',
        mensaje: 'Tienes un relevo de emergencia asignado. Revisa tu panel para la ubicación exacta.',
        tipo: 'urgente',
        metadata: { tipo: 'RELEVO_EMERGENCIA', asignacion_id: nueva_asignacion_id, lat: incidencia.lat, lng: incidencia.lng }
      });

      return res.json({ mensaje: 'Refuerzo asignado e incidencia resuelta.', incidencia: finalRes.rows[0] });
    }

    // ==========================================
    // CASO 3: via_obstruida u otro (RESOLUCIÓN SIMPLE)
    // ==========================================
    const r = await pool.query(
      'UPDATE incidencias_conductor SET resuelto = TRUE, resolucion = $1 WHERE id = $2 RETURNING *',
      [resolucion || 'Resolución simple por el administrador', incidencia_id]
    );
    
    if (io) {
      io.emit('incidencia_resuelta', incidencia_id); 
      io.to('usuario:' + incidencia.conductor_id).emit('novedad_atendida', { 
        incidencia_id: incidencia_id, 
        mensaje: 'Tu reporte ha sido leído y gestionado por el admin.' 
      });
    }

    res.json({ mensaje: 'Incidencia marcada como resuelta.', incidencia: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ mensaje: 'Error al resolver incidencia.' });
  }
});

module.exports = router;
