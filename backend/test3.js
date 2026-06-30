const pool = require('./src/config/database');
(async () => {
  const res = await pool.query("SELECT CURRENT_DATE as cd, CURRENT_TIMESTAMP as ct");
  console.log(res.rows);
  const asig = await pool.query("SELECT id, ruta_fija_id, fecha FROM asignaciones_semanales WHERE ruta_fija_id = 13");
  console.log(asig.rows);
  process.exit();
})();
