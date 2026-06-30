const pool = require('./src/config/database');
async function run() {
  try {
    await pool.query('ALTER TABLE asignaciones_semanales ADD COLUMN conductor_id INT REFERENCES usuarios(id) ON DELETE SET NULL;');
    console.log('ALTER TABLE completado.');
    const updateRes = await pool.query('UPDATE asignaciones_semanales a SET conductor_id = rf.conductor_default_id FROM rutas_fijas rf WHERE a.ruta_fija_id = rf.id;');
    console.log(`UPDATE completado. Filas afectadas: ${updateRes.rowCount}`);
    const selectRes = await pool.query('SELECT id, ruta_fija_id, conductor_id, fecha FROM asignaciones_semanales ORDER BY id DESC LIMIT 10;');
    console.table(selectRes.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
