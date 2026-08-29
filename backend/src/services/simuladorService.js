const pool = require('../config/database');
const { getIo, emitirAdmins, emitirUsuario } = require('../config/socket');

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

  // Se reserva la plaza antes del primer await. La comprobacion de arriba y el
  // registro real del intervalo estaban separados por varias consultas, asi que
  // dos arranques casi simultaneos de la misma asignacion (un reintento del
  // movil, o resumeActiveSimulations coincidiendo con un inicio manual) creaban
  // dos intervalos: la ruta avanzaba al doble y se insertaba el GPS por
  // duplicado. El intervalo real sustituye a esta reserva al final.
  activeSimulations.set(asignacionId, { interval: null, pointsQueue: [] });

  try {
    // La tripulación se toma de la asignación del día y sólo se recurre a la
    // ruta fija como respaldo (RNF-12). Leyendo rutas_fijas directamente, tras
    // un relevo el monitoreo seguía mostrando al conductor y la placa del
    // vehículo siniestrado en lugar de los del reemplazo.
    const result = await pool.query(
      `SELECT a.*,
              v.placa,
              v.id  AS vehiculo_efectivo_id,
              u.id  AS conductor_efectivo_id,
              u.nombre AS conductor_nombre,
              rf.nombre AS ruta_nombre
       FROM asignaciones_semanales a
       JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id
       JOIN vehiculos v ON v.id = COALESCE(a.vehiculo_id, rf.vehiculo_id)
       JOIN usuarios u ON u.id = COALESCE(a.conductor_id, rf.conductor_default_id)
       WHERE a.id = $1`, [asignacionId]
    );

    if (result.rows.length === 0) {
      activeSimulations.delete(asignacionId);   // liberar la reserva
      return;
    }
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
        // Estado de la asignación, última descarga e incidencia crítica en una
        // sola consulta. Antes eran dos consultas independientes por tick, es
        // decir 24 por minuto y ruta activa contra un pool de 20 conexiones.
        const estadoTick = await pool.query(
          `SELECT a.estado,
                  d.id AS d_id, d.hora_regreso AS d_hora_regreso,
                  d.punto_pausa_lat AS d_pausa_lat, d.punto_pausa_lng AS d_pausa_lng,
                  d.punto_descarga_nombre AS d_nombre,
                  d.latitud_centro AS d_lat_centro, d.longitud_centro AS d_lng_centro,
                  i.tipo AS i_tipo, i.lat AS i_lat, i.lng AS i_lng
             FROM asignaciones_semanales a
             LEFT JOIN LATERAL (
                  SELECT dd.id, dd.hora_regreso, dd.punto_pausa_lat, dd.punto_pausa_lng,
                         pd.nombre AS punto_descarga_nombre, pd.latitud_centro, pd.longitud_centro
                    FROM descargas dd
                    JOIN puntos_descarga pd ON pd.id = dd.punto_descarga_id
                   WHERE dd.asignacion_id = a.id
                   ORDER BY dd.id DESC LIMIT 1
             ) d ON TRUE
             LEFT JOIN LATERAL (
                  SELECT ic.tipo, ic.lat, ic.lng
                    FROM incidencias_conductor ic
                   WHERE ic.asignacion_id = a.id
                     AND ic.resuelto = false
                     AND ic.tipo IN ('accidente', 'falla_motor')
                   ORDER BY ic.id LIMIT 1
             ) i ON TRUE
            WHERE a.id = $1`,
          [asignacionId]
        );

        // Parada limpia: la asignación se eliminó o dejó de estar activa (por
        // ejemplo tras un relevo). Esto no vive en el bloque catch, que según
        // RNF-07 debe registrar el fallo sin cancelar el intervalo para
        // sobrevivir a errores momentáneos de base de datos.
        if (estadoTick.rows.length === 0 || estadoTick.rows[0].estado !== 'activa') {
          const simObjFin = activeSimulations.get(asignacionId);
          if (simObjFin) clearInterval(simObjFin.interval);
          activeSimulations.delete(asignacionId);
          console.log(`⏹️ Simulación de la asignación ${asignacionId} detenida: ya no está activa.`);
          return;
        }

        const fila = estadoTick.rows[0];
        const activeDischarge = { rows: fila.d_id ? [{
          id: fila.d_id,
          hora_regreso: fila.d_hora_regreso,
          punto_pausa_lat: fila.d_pausa_lat,
          punto_pausa_lng: fila.d_pausa_lng,
          punto_descarga_nombre: fila.d_nombre,
          latitud_centro: fila.d_lat_centro,
          longitud_centro: fila.d_lng_centro
        }] : [] };

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

        // Pausa por incidencia crítica (RF-07.7). Los datos ya vienen en la
        // consulta unificada del inicio del tick.
        if (fila.i_tipo) {
          startTime += 5000; // Congelar progreso de ruta
          // Fijar posición en las coordenadas del incidente si existen
          if (fila.i_lat && fila.i_lng) {
            currentPos = [parseFloat(fila.i_lat), parseFloat(fila.i_lng)];
          }
          currentState = 'en_incidencia';
          sectorName = `Incidencia: ${fila.i_tipo.replace('_', ' ').toUpperCase()}`;
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

        // La telemetría de la flota va sólo al panel de monitoreo (RF-04.1) y la
        // posición individual sólo a su conductor. Antes ambas se difundían con
        // io.emit a todos los sockets, incluidos los ciudadanos del portal.
        emitirAdmins('ubicacion_vehiculo', {
          id: asig.vehiculo_efectivo_id,
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

        emitirUsuario(asig.conductor_efectivo_id, `posicion_conductor_${asig.id}`, {
          lat: currentPos[0],
          lng: currentPos[1],
          progreso: Math.min(99, Math.floor(progress * 100)),
          km: totalDistancia.toFixed(2)
        });

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

          emitirUsuario(asig.conductor_efectivo_id, `simulacion_completada_${asig.id}`, {
            km_finales: totalDistancia.toFixed(2)
          });
        }
      } catch (err) {
        console.error('❌ Error en tick de simulación (continuando):', err.message);
      }
    }, 5000); 

    activeSimulations.set(asignacionId, { interval, pointsQueue });
    console.log(`✅ Simulación iniciada para asignación ${asignacionId} con ${pts.length} puntos.`);

  } catch (error) {
    // Si la preparacion falla, la reserva no puede quedarse puesta: bloquearia
    // cualquier intento posterior de arrancar esta misma asignacion.
    const reserva = activeSimulations.get(asignacionId);
    if (reserva && !reserva.interval) activeSimulations.delete(asignacionId);
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
    // interval puede ser null si la simulacion aun se estaba preparando. El
    // tick comprueba el estado de la asignacion y se detiene solo en cuanto
    // deja de estar activa, de modo que un arranque en vuelo no sobrevive.
    if (simObj.interval) clearInterval(simObj.interval);
    activeSimulations.delete(asignacionId);
    console.log(`⏹️ Simulación detenida manualmente para asignación ${asignacionId}.`);
    return true;
  }
  return false;
};

module.exports = { startSimulation, stopSimulation, resumeActiveSimulations };
