const pool = require('./src/config/database');
(async () => {
  const asig = await pool.query("SELECT id, ruta_fija_id, conductor_id, fecha, estado FROM asignaciones_semanales WHERE ruta_fija_id IN (13,14,9,4)");
  console.log(asig.rows);
  process.exit();
})();
