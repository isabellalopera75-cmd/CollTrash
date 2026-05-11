const pool = require('./src/config/database');
async function check() {
  // Test insert with null asignacion_id
  try {
    const r = await pool.query(
      `INSERT INTO incidencias_conductor (asignacion_id, conductor_id, tipo, descripcion, resuelto)
       VALUES ($1, $2, $3, $4, FALSE) RETURNING *`,
      [null, 1, 'via_bloqueada', 'Test desde script']
    );
    console.log('INSERT OK:', r.rows[0]);
  } catch(e) {
    console.error('INSERT ERROR:', e.message);
  }
  process.exit();
}
check().catch(e => { console.error(e.message); process.exit(1); });
