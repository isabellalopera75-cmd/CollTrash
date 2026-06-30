const pool = require('./src/config/database');
(async () => {
  const r = await pool.query("SELECT * FROM jornadas");
  console.log(r.rows);
  process.exit();
})();
