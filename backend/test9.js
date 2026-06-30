const pool = require('./src/config/database');
(async () => {
  const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'asignaciones_semanales';");
  console.log(r.rows);
  process.exit();
})();
