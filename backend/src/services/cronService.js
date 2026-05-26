const pool = require('../config/database');
const cron = require('node-cron');
const { eliminarAsignacionesPorIds } = require('./dbCleanupService');

const generarAsignaciones = async (fechaInicio = null) => {
  console.log('🕒 Iniciando generación de asignaciones optimizada (Bulk)...');
  
  try {
    const rutasFijas = await pool.query('SELECT * FROM rutas_fijas WHERE activo = TRUE');
    if (rutasFijas.rows.length === 0) {
      console.log('ℹ️ No hay rutas fijas activas para generar asignaciones.');
      return;
    }
    
    // Si se pasa un ID de ruta (número) o fecha no válida, usar la fecha de hoy
    let fechaBase = (fechaInicio && typeof fechaInicio !== 'number' && !isNaN(Date.parse(fechaInicio)))
      ? new Date(fechaInicio)
      : new Date();
    
    const normalizeString = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
    
    const expectedAssignments = [];
    const dateRangeStrs = [];
    
    // Generar fechas para el rango de 7 días
    for (let i = 0; i < 7; i++) {
      const fechaAsignacion = new Date(fechaBase);
      fechaAsignacion.setDate(fechaBase.getDate() + i);
      fechaAsignacion.setHours(0, 0, 0, 0);
      
      const fechaStr = fechaAsignacion.toISOString().split('T')[0];
      dateRangeStrs.push(fechaStr);
      
      const diaSemanaNombre = normalizeString(fechaAsignacion.toLocaleDateString('es-ES', { weekday: 'long' }));
      
      for (const ruta of rutasFijas.rows) {
        const correspondeDia = normalizeString(ruta.dias_semana).includes(diaSemanaNombre);
        if (correspondeDia) {
          expectedAssignments.push({
            ruta_fija_id: ruta.id,
            fecha: fechaStr,
            conductor_id: ruta.conductor_default_id,
            vehiculo_id: ruta.vehiculo_id
          });
        }
      }
    }
    
    if (dateRangeStrs.length === 0) {
      console.log('ℹ️ Rango de fechas vacío.');
      return;
    }
    
    const fechaMin = dateRangeStrs[0];
    const fechaMax = dateRangeStrs[dateRangeStrs.length - 1];
    
    // 1. Obtener asignaciones pendientes existentes en el rango de fechas
    const existingPendingRes = await pool.query(
      `SELECT id, ruta_fija_id, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha 
       FROM asignaciones_semanales 
       WHERE fecha BETWEEN $1 AND $2 AND estado = 'pendiente'`,
      [fechaMin, fechaMax]
    );
    
    // 2. Encontrar asignaciones pendientes redundantes que ya no corresponden
    const expectedKeys = new Set(expectedAssignments.map(ea => `${ea.ruta_fija_id}_${ea.fecha}`));
    const redundantIds = [];
    
    for (const row of existingPendingRes.rows) {
      const key = `${row.ruta_fija_id}_${row.fecha}`;
      if (!expectedKeys.has(key)) {
        redundantIds.push(row.id);
      }
    }
    
    // 3. Eliminar asignaciones redundantes en lote
    if (redundantIds.length > 0) {
      console.log(`🗑️ Limpiando ${redundantIds.length} asignaciones pendientes redundantes en lote...`);
      await eliminarAsignacionesPorIds(redundantIds);
    }
    
    // 4. Preparar inserción de las asignaciones esperadas
    if (expectedAssignments.length === 0) {
      console.log('ℹ️ No hay asignaciones programadas para los días seleccionados.');
      return;
    }
    
    const valueClauses = [];
    const params = [];
    let paramIndex = 1;
    
    for (const ea of expectedAssignments) {
      valueClauses.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, 'pendiente')`);
      params.push(ea.ruta_fija_id, ea.conductor_id, ea.vehiculo_id, ea.fecha);
      paramIndex += 4;
    }
    
    const insertQuery = `
      INSERT INTO asignaciones_semanales (ruta_fija_id, conductor_id, vehiculo_id, fecha, estado)
      VALUES ${valueClauses.join(', ')}
      ON CONFLICT (ruta_fija_id, fecha) DO NOTHING
      RETURNING id, ruta_fija_id
    `;
    
    // Ejecutar transacción única para insertar asignaciones y sectores
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const insertRes = await client.query(insertQuery, params);
      const nuevasAsignaciones = insertRes.rows;
      
      console.log(`💾 Creadas ${nuevasAsignaciones.length} asignaciones nuevas.`);
      
      if (nuevasAsignaciones.length > 0) {
        const newIds = nuevasAsignaciones.map(a => a.id);
        const newRutaIds = nuevasAsignaciones.map(a => a.ruta_fija_id);
        
        await client.query(
          `INSERT INTO sectores_asignacion (asignacion_id, sector_id, estado, porcentaje_recorrido)
           SELECT val.asig_id, sr.id, 'pendiente', 0
           FROM sectores_ruta sr
           JOIN (
             SELECT * FROM UNNEST($1::int[], $2::int[]) AS t(asig_id, rf_id)
           ) val ON sr.ruta_fija_id = val.rf_id`,
          [newIds, newRutaIds]
        );
        
        console.log(` sectors_asignacion vinculados para ${nuevasAsignaciones.length} asignaciones.`);
      }
      
      await client.query('COMMIT');
      console.log('🚀 Asignaciones generadas/actualizadas con éxito de forma masiva (Bulk).');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('❌ Error en el generador masivo:', error.message);
  }
};

// Domingo 11 PM: Genera la PRÓXIMA semana
cron.schedule('0 23 * * 0', () => {
  const hoy = new Date();
  const lunesProx = new Date(hoy);
  lunesProx.setDate(hoy.getDate() + ((1 + 7 - hoy.getDay()) % 7 || 7));
  generarAsignaciones(lunesProx);
});

// Diariamente a las 2 AM: Limpiar registros de GPS antiguos (más de 48 horas)
cron.schedule('0 2 * * *', async () => {
  console.log('🕒 Iniciando limpieza de registros GPS antiguos (TTL > 48h)...');
  try {
    const res = await pool.query(
      "DELETE FROM rastreo_gps WHERE registrado_at < NOW() - INTERVAL '48 hours'"
    );
    console.log(`✅ Limpieza completada: ${res.rowCount} registros GPS eliminados.`);
  } catch (err) {
    console.error('❌ Error limpiando registros GPS:', err.message);
  }
});

module.exports = { generarAsignaciones };
