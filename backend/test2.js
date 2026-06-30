const pool = require('./src/config/database');
(async () => {
  await pool.query(`
    UPDATE asignaciones_semanales a
    SET conductor_id = rf.conductor_default_id,
        vehiculo_id = rf.vehiculo_id
    FROM rutas_fijas rf
    WHERE a.ruta_fija_id = rf.id 
      AND a.estado = 'pendiente'
      AND a.fecha >= CURRENT_DATE
  `);
  console.log("Sincronización manual completada.");
  process.exit();
})();
