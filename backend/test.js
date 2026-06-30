const pool = require('./src/config/database');
(async () => {
  const asig = await pool.query("SELECT id, ruta_fija_id, conductor_id, fecha, estado FROM asignaciones_semanales WHERE fecha = CURRENT_DATE");
  console.log("ASIGNACIONES DE HOY:", asig.rows);
  const u = await pool.query("SELECT id, nombre, rol, activo FROM usuarios");
  console.log("USUARIOS:", u.rows);
  const r = await pool.query("SELECT id, nombre, conductor_default_id, activo FROM rutas_fijas");
  console.log("RUTAS:", r.rows);
  process.exit();
})();
