const pool = require('../config/database');

const eliminarAsignacionesPorIds = async (ids) => {
  if (!ids || ids.length === 0) return;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Desvincular reportes ciudadanos
    await client.query(
      "UPDATE reportes_ciudadanos SET asignacion_id = NULL WHERE asignacion_id = ANY($1::int[])", 
      [ids]
    );
    
    // 2. Eliminar registros en tablas dependientes
    await client.query("DELETE FROM sectores_asignacion WHERE asignacion_id = ANY($1::int[])", [ids]);
    await client.query("DELETE FROM puntos_temporales WHERE asignacion_id = ANY($1::int[])", [ids]);
    await client.query("DELETE FROM rastreo_gps WHERE asignacion_id = ANY($1::int[])", [ids]);
    await client.query("DELETE FROM descargas WHERE asignacion_id = ANY($1::int[])", [ids]);
    await client.query("DELETE FROM incidencias_conductor WHERE asignacion_id = ANY($1::int[])", [ids]);
    await client.query("DELETE FROM novedades_operativas WHERE asignacion_id = ANY($1::int[])", [ids]);
    await client.query("DELETE FROM eficiencia_rutas WHERE asignacion_id = ANY($1::int[])", [ids]);
    
    // 3. Eliminar las asignaciones
    await client.query("DELETE FROM asignaciones_semanales WHERE id = ANY($1::int[])", [ids]);
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al limpiar asignaciones de la base de datos:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  eliminarAsignacionesPorIds
};
