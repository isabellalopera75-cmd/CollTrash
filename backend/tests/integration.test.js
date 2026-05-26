const pool = require('../src/config/database');

describe('Database Triggers Integration', () => {
  // Test cleanup and setup variables
  let testRutaId;
  let testAsignacionId;
  let testConductorId;
  let testVehiculoId;

  beforeAll(async () => {
    // 1. Ensure we have a test conductor
    const conductorRes = await pool.query(`
      INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
      VALUES ('Test Conductor', 'test_conductor@colltrash.com', '12345', 'conductor', TRUE)
      RETURNING id
    `);
    testConductorId = conductorRes.rows[0].id;

    // 2. Ensure we have a test vehiculo
    const vehiculoRes = await pool.query(`
      INSERT INTO vehiculos (placa, modelo, capacidad_ton, activo)
      VALUES ('TES-123', 'Test Model', 10, TRUE)
      RETURNING id
    `);
    testVehiculoId = vehiculoRes.rows[0].id;

    // 3. Ensure we have a test jornada
    const jornadaRes = await pool.query(`
      INSERT INTO jornadas (nombre, hora_inicio, hora_limite_fin) 
      VALUES ('Test Jornada', '08:00', '16:00') 
      RETURNING id
    `);
    const jornadaId = jornadaRes.rows[0].id;

    // 4. Insert a test ruta_fija with the new array column (dias_semana_arr)
    const rutaRes = await pool.query(`
      INSERT INTO rutas_fijas (nombre, jornada_id, conductor_default_id, vehiculo_id, dias_semana_arr) 
      VALUES ('Ruta Test Trigger', $1, $2, $3, '{1,2,3,4}') 
      RETURNING id
    `, [jornadaId, testConductorId, testVehiculoId]);
    testRutaId = rutaRes.rows[0].id;

    // 3. Insert some test sectores_ruta linked to this test ruta_fija
    await pool.query(`
      INSERT INTO sectores_ruta (ruta_fija_id, nombre, orden, trazado_geom)
      VALUES 
        ($1, 'Sector Test 1', 1, '{"type": "LineString", "coordinates": []}'),
        ($1, 'Sector Test 2', 2, '{"type": "LineString", "coordinates": []}')
    `, [testRutaId]);
  });

  afterAll(async () => {
    // Cleanup the data we created.
    if (testAsignacionId) {
      await pool.query(`DELETE FROM sectores_asignacion WHERE asignacion_id = $1`, [testAsignacionId]);
      await pool.query(`DELETE FROM asignaciones_semanales WHERE id = $1`, [testAsignacionId]);
    }
    if (testRutaId) {
      await pool.query(`DELETE FROM sectores_ruta WHERE ruta_fija_id = $1`, [testRutaId]);
      await pool.query(`DELETE FROM rutas_fijas WHERE id = $1`, [testRutaId]);
    }
    await pool.query(`DELETE FROM jornadas WHERE nombre = 'Test Jornada'`);
    if (testVehiculoId) {
      await pool.query(`DELETE FROM vehiculos WHERE id = $1`, [testVehiculoId]);
    }
    if (testConductorId) {
      await pool.query(`DELETE FROM usuarios WHERE id = $1`, [testConductorId]);
    }
    
    // Close the DB connection so Jest can exit
    await pool.end();
  });

  it('should automatically populate sectores_asignacion when an asignacion is created (via trigger)', async () => {
    // This acts as an integration test for the trg_copy_sectores trigger
    
    // 1. Insert a new asignacion (this should fire the database trigger)
    const asignacionRes = await pool.query(`
      INSERT INTO asignaciones_semanales (ruta_fija_id, fecha, estado)
      VALUES ($1, CURRENT_DATE, 'pendiente')
      RETURNING id
    `, [testRutaId]);
    
    testAsignacionId = asignacionRes.rows[0].id;

    // 2. Query the sectores_asignacion table to verify the trigger worked
    const sectoresRes = await pool.query(`
      SELECT * FROM sectores_asignacion 
      WHERE asignacion_id = $1
      ORDER BY id ASC
    `, [testAsignacionId]);

    // 3. Assertions
    // We inserted 2 sectores_ruta for this testRutaId, so we expect 2 sectores_asignacion
    expect(sectoresRes.rows.length).toBe(2);
    expect(sectoresRes.rows[0].estado).toBe('pendiente');
    expect(sectoresRes.rows[0].porcentaje_recorrido).toBe('0.00'); // Assuming NUMERIC column
  });
});
