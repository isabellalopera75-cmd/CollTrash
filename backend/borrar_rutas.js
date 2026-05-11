const pool = require('./src/config/database');

async function borrarRutasInactivas() {
  try {
    // Primero, eliminamos los sectores asociados a las rutas inactivas por las llaves foráneas
    await pool.query(`
      DELETE FROM sectores_ruta 
      WHERE ruta_fija_id IN (SELECT id FROM rutas_fijas WHERE activo = FALSE)
    `);

    // Luego, eliminamos las asignaciones semanales de esas rutas
    await pool.query(`
      DELETE FROM asignaciones_semanales 
      WHERE ruta_fija_id IN (SELECT id FROM rutas_fijas WHERE activo = FALSE)
    `);

    // Finalmente, eliminamos las rutas inactivas
    const res = await pool.query("DELETE FROM rutas_fijas WHERE activo = FALSE RETURNING id");
    
    console.log(`✅ Se eliminaron permanentemente ${res.rowCount} rutas inactivas de la base de datos.`);
  } catch (e) {
    console.error('❌ Error:', e.message);
  } finally {
    process.exit();
  }
}

borrarRutasInactivas();
