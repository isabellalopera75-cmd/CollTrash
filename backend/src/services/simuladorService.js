const pool = require('../config/database');
const { getIo } = require('../config/socket');

const activeSimulations = new Map();

// Helper to batch insert GPS tracking coordinates
const flushGPSQueue = async (asignacionId, queue) => {
  if (!queue || queue.length === 0) return;

  const valueClauses = [];
  const params = [asignacionId];
  let paramIndex = 2;

  for (const p of queue) {
    valueClauses.push(`($1, $${paramIndex}, $${paramIndex+1})`);
    params.push(p.lat, p.lng);
    paramIndex += 2;
  }

  const query = `
    INSERT INTO rastreo_gps (asignacion_id, latitud, longitud)
    VALUES ${valueClauses.join(', ')}
  `;

  try {
    await pool.query(query, params);
  } catch (err) {
    console.error(`❌ Error in batch insert GPS for assignment ${asignacionId}:`, err.message);
  }
};

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
    
    let ticksCount = 0;
    const pointsQueue = [];

    const interval = setInterval(async () => {
      try {
        // ── Lógica de Descarga y Trayecto a Botadero ────────────────────
        const activeDischarge = await pool.query(
          `SELECT d.*, pd.nombre as punto_descarga_nombre, pd.latitud_centro, pd.longitud_centro 
           FROM descargas d
           JOIN puntos_descarga pd ON pd.id = d.punto_descarga_id
           WHERE d.asignacion_id = $1 
           ORDER BY d.id DESC LIMIT 1`,
          [asignacionId]
        );

        let currentPos = null;
        let sectorName = 'Operación';
        let currentState = 'en_ruta';

        if (activeDischarge.rows.length > 0) {
          const d = activeDischarge.rows[0];
          const pLat = parseFloat(d.punto_pausa_lat);
          const pLng = parseFloat(d.punto_pausa_lng);
          const dLat = parseFloat(d.latitud_centro);
          const dLng = parseFloat(d.longitud_centro);
          const landfillName = d.punto_descarga_nombre || 'Botadero';

          const simObj = activeSimulations.get(asignacionId);

          if (!d.hora_regreso) {
            // A. PAUSA ACTIVA (VIAJE E INSTALACIÓN EN BOTADERO)
            startTime += 5000; // Detiene el avance de la ruta principal en el tiempo
            
            if (simObj) {
              simObj.pauseTicks = (simObj.pauseTicks || 0) + 1;
              simObj.returningTicks = undefined; // Resetear regreso si estuviese activo
              simObj.lastDischargeId = d.id;

              // Interpolación hacia el botadero (toma 6 ticks = 30 segundos)
              const ratio = Math.min(simObj.pauseTicks / 6, 1);
              const lat = pLat + (dLat - pLat) * ratio;
              const lng = pLng + (dLng - pLng) * ratio;
              currentPos = [lat, lng];
              
              sectorName = ratio < 1 ? `Viaje a botadero (${landfillName})` : `Descargando en ${landfillName}`;
              currentState = 'en_descarga';
            }
          } else {
            // B. PAUSA COMPLETADA (VIAJE DE REGRESO DE BOTADERO A LA RUTA)
            if (simObj && simObj.lastDischargeId === d.id) {
              if (simObj.returningTicks === undefined) {
                simObj.returningTicks = 0;
              }

              if (simObj.returningTicks < 6) {
                startTime += 5000; // Sigue reteniendo el avance de la ruta principal
                simObj.returningTicks++;
                
                // Interpolación de regreso del botadero a la ruta (toma 6 ticks = 30 segundos)
                const ratio = Math.min(simObj.returningTicks / 6, 1);
                const lat = dLat + (pLat - dLat) * ratio;
                const lng = dLng + (pLng - dLng) * ratio;
                currentPos = [lat, lng];
                
                sectorName = `Regreso de botadero...`;
                currentState = 'regresando_a_ruta';
              } else {
                // Regreso completado, limpiar variables para que el siguiente tick continúe con la ruta normal
                simObj.returningTicks = undefined;
                simObj.pauseTicks = undefined;
                simObj.lastDischargeId = null;
              }
            }
          }
        }

        // ── LÓGICA NUEVA: Pausa por Incidencias Críticas ───────────────────
        const activeIncident = await pool.query(
          `SELECT id, tipo, latitud as lat, longitud as lng FROM incidencias_conductor
           WHERE asignacion_id = $1 AND resuelto = false 
           AND tipo IN ('accidente', 'falla_motor')
           LIMIT 1`,
          [asignacionId]
        );

        if (activeIncident.rows.length > 0) {
          startTime += 5000; // Congelar progreso de ruta
          const inc = activeIncident.rows[0];
          // Fijar posición en las coordenadas del incidente si existen
          if (inc.lat && inc.lng) {
            currentPos = [parseFloat(inc.lat), parseFloat(inc.lng)];
          }
          currentState = 'en_incidencia'; // Nuevo estado
          sectorName = `Incidencia: ${inc.tipo.replace('_', ' ').toUpperCase()}`;
        }
        // ───────────────────────────────────────────────────────────────────

        const elapsed = Date.now() - startTime;
        let progress = elapsed / msTotal;
        if (progress >= 1) progress = 1;

        let idx = null;
        if (!currentPos) {
          idx = Math.floor(progress * (pts.length - 1));
          if (idx < 0) idx = 0;
          if (idx >= pts.length) idx = pts.length - 1;
          
          currentPos = pts[idx];
        }

        if (!currentPos || !ultimaPos) {
           throw new Error(`Posición inválida en simulación. idx=${idx}, pts.length=${pts.length}`);
        }

        // Acumular KM
        totalDistancia += calcularDistancia(ultimaPos, currentPos);
        ultimaPos = currentPos;

        // Acumular coordenadas en memoria para telemetría
        pointsQueue.push({ lat: currentPos[0], lng: currentPos[1] });
        ticksCount++;

        // Batch insert cada 12 ticks (12 * 5s = 60s)
        if (ticksCount >= 12) {
          ticksCount = 0;
          const toFlush = [...pointsQueue];
          pointsQueue.length = 0;
          flushGPSQueue(asignacionId, toFlush);
        }

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
            sector: sectorName,
            estado: currentState,
            last: '0s',
            asignacion_id: asig.id,
            km_recorridos: totalDistancia.toFixed(2)
          });
          
          io.emit(`posicion_conductor_${asig.id}`, { 
            lat: currentPos[0], 
            lng: currentPos[1], 
            progreso: Math.round(progress * 100),
            km: totalDistancia.toFixed(2)
          });
        }

        if (progress >= 1) {
          const simObj = activeSimulations.get(asignacionId);
          if (simObj) {
            clearInterval(simObj.interval);
          }
          activeSimulations.delete(asignacionId);

          await pool.query(
            `UPDATE asignaciones_semanales SET km_recorridos = $1 WHERE id = $2`,
            [totalDistancia.toFixed(2), asignacionId]
          );

          await pool.query(
            `UPDATE sectores_asignacion SET estado = 'completado', completado_at = NOW(), porcentaje_recorrido = 100 
             WHERE asignacion_id = $1`, [asignacionId]
          );

          // Flush de coordenadas restantes al finalizar
          if (pointsQueue.length > 0) {
            await flushGPSQueue(asignacionId, pointsQueue);
          }
          
          if (io) io.emit(`simulacion_completada_${asig.id}`, { km_finales: totalDistancia.toFixed(2) });
        }
      } catch (err) {
        console.error('❌ Error en tick de simulación (continuando):', err.message);
      }
    }, 5000); 

    activeSimulations.set(asignacionId, { interval, pointsQueue });
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

const stopSimulation = (asignacionId) => {
  const simObj = activeSimulations.get(asignacionId);
  if (simObj) {
    clearInterval(simObj.interval);
    activeSimulations.delete(asignacionId);
    console.log(`⏹️ Simulación detenida manualmente para asignación ${asignacionId}.`);
    return true;
  }
  return false;
};

module.exports = { startSimulation, stopSimulation, resumeActiveSimulations };
