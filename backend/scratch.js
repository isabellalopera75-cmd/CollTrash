const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:Lai+0807@localhost:5432/colltrash' });

async function run() {
  const res = await pool.query(`SELECT id, estado, ruta_fija_id FROM asignaciones_semanales WHERE fecha = CURRENT_DATE`);
  console.table(res.rows);
  
  const res2 = await pool.query(`
    SELECT asignacion_id, COUNT(*) as total, 
           SUM(CASE WHEN estado != 'completado' THEN 1 ELSE 0 END) as pendientes 
    FROM sectores_asignacion 
    GROUP BY asignacion_id
  `);
  console.table(res2.rows);

  const res3 = await pool.query(`
    SELECT a.id, COUNT(sr.id) as total_sectores_ruta
    FROM asignaciones_semanales a
    JOIN rutas_fijas rf ON a.ruta_fija_id = rf.id
    JOIN sectores_ruta sr ON sr.ruta_id = rf.id
    WHERE a.fecha = CURRENT_DATE
    GROUP BY a.id
  `);
  console.table(res3.rows);

  process.exit(0);
}
run();
