const pool = require('./src/config/database');
(async () => {
  await pool.query("UPDATE jornadas SET hora_limite_fin = '15:00:00' WHERE nombre = 'Mañana'");
  await pool.query("UPDATE jornadas SET hora_limite_fin = '23:00:00' WHERE nombre = 'Tarde'");
  const r = await pool.query("SELECT * FROM jornadas");
  console.log(r.rows);
  process.exit();
})();
