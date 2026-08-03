const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:Lai+0807@localhost:5432/colltrash' });

async function check() {
  const id = '924';
  const sectoresPendientes = await pool.query(
    `SELECT COUNT(*) FROM sectores_asignacion 
     WHERE asignacion_id = $1 AND estado != 'completado'`,
    [id]
  );
  console.log("sectoresPendientes count:", sectoresPendientes.rows[0].count);

  const reportesPendientes = await pool.query(
    `SELECT COUNT(*) FROM reportes_ciudadanos
     WHERE asignacion_id = $1 AND estado = 'en_proceso'`,
    [id]
  );
  console.log("reportesPendientes count:", reportesPendientes.rows[0].count);
  process.exit(0);
}
check();
