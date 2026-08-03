const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:Lai+0807@localhost:5432/colltrash' });

async function run() {
  try {
    const res2 = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'puntos_descarga'");
    console.log("=== Columnas puntos_descarga ===");
    console.table(res2.rows);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
