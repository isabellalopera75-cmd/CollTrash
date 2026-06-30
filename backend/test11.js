const pool = require('./src/config/database');
(async () => {
  const r = await pool.query("SELECT * FROM configuracion");
  console.log(r.rows);
  process.exit();
})();
