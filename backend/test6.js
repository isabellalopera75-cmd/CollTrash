const pool = require('./src/config/database');
(async () => {
  const r = await pool.query("SELECT rf.nombre, j.hora_inicio, j.hora_limite_fin FROM rutas_fijas rf JOIN jornadas j ON rf.jornada_id = j.id WHERE rf.id = 2");
  console.log(r.rows);
  process.exit();
})();
