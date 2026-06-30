const pool = require('./src/config/database');
(async () => {
  const asig = await pool.query("SELECT id, nombre, dias_semana_arr FROM rutas_fijas WHERE id = 13");
  console.log(asig.rows);
  process.exit();
})();
