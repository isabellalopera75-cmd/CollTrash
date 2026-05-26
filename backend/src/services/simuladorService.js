const pool = require('../config/database');
const { getIo } = require('../config/socket');

const activeSimulations = new Map();

const startSimulation = async (asignacionId) => {
  if (activeSimulations.has(asignacionId)) return;

  try {
    const result = await pool.query(
      `SELECT a.*, v.placa, u.nombre as conductor_nombre, rf.nombre as ruta_nombre, rf.vehiculo_id
       FROM asignaciones_semanales a
       JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id
       JOIN vehiculos v ON v.id = rf.vehiculo_id
       JOIN usuarios u ON u.id = rf.conductor_default_id
       WHERE a.id = $1`, [asignacionId]
    );

    if (result.rows.length === 0) return;
    const asig = result.rows[0];

    const sectores = await pool.query(
      `SELECT sa.id as sa_id, sa.porcentaje_recorrido, sr.trazado_geom, sr.orden 
       FROM sectores_asignacion sa
       JOIN sectores_ruta sr ON sr.id = sa.sector_id
       WHERE sa.asignacion_id = $1
       ORDER BY sr.orden ASC`, [asignacionId]
    );

    let existingProgress = 0;
    if (sectores.rows.length > 0) {
      const sum = sectores.rows.reduce((acc, s) => acc + parseFloat(s.porcentaje_recorrido || 0), 0);
      existingProgress = sum / (sectores.rows.length * 100);
    }

    let pts = [];
    sectores.rows.forEach(s => {
      if (s.trazado_geom) {
        try { pts.push(...JSON.parse(s.trazado_geom)); } catch (e) { /* ignore */ }
      }
    });

    if (pts.length === 0) {
      pts = [[2.927,-75.282],[2.929,-75.283],[2.931,-75.284],[2.933,-75.285],[2.935,-75.284]];
    }

    const msTotal = 180 * 1000; // 3 minutos para completar toda la ruta (Modo Demo)
    let startTime = Date.now() - (existingProgress * msTotal);
    let totalDistancia = parseFloat(asig.km_recorridos) || 0;
    
    let startIdx = Math.floor(existingProgress * (pts.length - 1));
    if (startIdx < 0) startIdx = 0;
    if (startIdx >= pts.length) startIdx = pts.length - 1;
    let ultimaPos = pts[startIdx];

    // Función Haversine para calcular distancia entre coordenadas (KM)
    const calcularDistancia = (p1, p2) => {
      const R = 6371; // Radio de la Tierra en KM
      const dLat = (p2[0] - p1[0]) * Math.PI / 180;
      const dLon = (p2[1] - p1[1]) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(p1[0] * Math.PI / 180) * Math.cos(p2[0] * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };
    
    const interval = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      let progress = elapsed / msTotal;
      if (progress >= 1) progress = 1;
      
      let idx = Math.floor(progress * (pts.length - 1));
      if (idx < 0) idx = 0;
      if (idx >= pts.length) idx = pts.length - 1;
      
      const currentPos = pts[idx];

      // Acumular KM
      totalDistancia += calcularDistancia(ultimaPos, currentPos);
      ultimaPos = currentPos;

      const io = getIo();
      if (io) {
        io.emit('ubicacion_vehiculo', {
          id: asig.vehiculo_id,
          cod: asig.placa || 'VEH',
          conductor: asig.conductor_nombre,
          lat: currentPos[0],
          lng: currentPos[1],
          ruta: asig.ruta_nombre,
          progreso: Math.round(progress * 100),
          sector: 'Operación',
          estado: 'en_ruta',
          last: '0s',
          asignacion_id: asig.id,
          km_recorridos: totalDistancia.toFixed(2) // Enviamos KM en tiempo real
        });
        
        io.emit(`posicion_conductor_${asig.id}`, { 
          lat: currentPos[0], 
          lng: currentPos[1], 
          progreso: Math.round(progress * 100),
          km: totalDistancia.toFixed(2)
        });
      }

      if (progress >= 1) {
        clearInterval(activeSimulations.get(asignacionId));
        activeSimulations.delete(asignacionId);

        // Actualizar la asignación con los KM finales
        await pool.query(
          `UPDATE asignaciones_semanales SET km_recorridos = $1 WHERE id = $2`,
          [totalDistancia.toFixed(2), asignacionId]
        );

        // Completar todos los sectores
        await pool.query(
          `UPDATE sectores_asignacion SET estado = 'completado', completado_at = NOW(), porcentaje_recorrido = 100 
           WHERE asignacion_id = $1`, [asignacionId]
        );
        
        if (io) io.emit(`simulacion_completada_${asig.id}`, { km_finales: totalDistancia.toFixed(2) });
      }
    }, 5000); 

    activeSimulations.set(asignacionId, interval);
    console.log(`✅ Simulación iniciada para asignación ${asignacionId} con ${pts.length} puntos.`);

  } catch (error) {
    console.error('❌ Error crítico en startSimulation:', error);
  }
};

const resumeActiveSimulations = async () => {
  try {
    const activas = await pool.query("SELECT id FROM asignaciones_semanales WHERE estado = 'activa'");
    console.log(`📡 Reanudando ${activas.rows.length} simulaciones activas...`);
    for (const a of activas.rows) {
      startSimulation(a.id);
    }
  } catch (error) {
    console.error('❌ Error al reanudar simulaciones:', error);
  }
};

module.exports = { startSimulation, resumeActiveSimulations };
