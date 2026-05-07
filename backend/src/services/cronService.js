const cron = require('node-cron');
const pool = require('../config/database');

// Función que genera las asignaciones de la semana siguiente
const generarAsignacionesSemanales = async () => {
  console.log('⚙️ Ejecutando cron job: generando asignaciones semanales...');

  try {
    // Obtener todas las rutas fijas activas
    const rutas = await pool.query(
      'SELECT * FROM rutas_fijas WHERE activo = TRUE'
    );

    if (rutas.rows.length === 0) {
      console.log('No hay rutas fijas activas.');
      return;
    }

    const diasSemana = {
      'lunes': 1, 'martes': 2, 'miercoles': 3,
      'jueves': 4, 'viernes': 5, 'sabado': 6
    };

    let totalGeneradas = 0;

    for (const ruta of rutas.rows) {
      const dias = ruta.dias_semana.split(',').map(d => d.trim());

      for (const dia of dias) {
        const numeroDia = diasSemana[dia];
        if (!numeroDia) continue;

        // Calcular la fecha del día de la próxima semana
        const hoy = new Date();
        const proximoLunes = new Date(hoy);
        proximoLunes.setDate(hoy.getDate() + (8 - hoy.getDay()));

        const fecha = new Date(proximoLunes);
        fecha.setDate(proximoLunes.getDate() + (numeroDia - 1));
        const fechaStr = fecha.toISOString().split('T')[0];

        // Verificar si ya existe la asignación para ese día
        const existe = await pool.query(
          'SELECT id FROM asignaciones_semanales WHERE ruta_fija_id = $1 AND fecha = $2',
          [ruta.id, fechaStr]
        );

        if (existe.rows.length > 0) continue;

        // Verificar si hay cambio de conductor para esa fecha
        const cambio = await pool.query(
          `SELECT conductor_reemplazante_id FROM cambios_conductor 
           WHERE ruta_fija_id = $1 
           AND fecha_inicio <= $2 
           AND (fecha_fin >= $2 OR es_permanente = TRUE)
           ORDER BY created_at DESC LIMIT 1`,
          [ruta.id, fechaStr]
        );

        const conductorId = cambio.rows.length > 0
          ? cambio.rows[0].conductor_reemplazante_id
          : ruta.conductor_default_id;

        // Crear la asignación
        const asignacion = await pool.query(
          `INSERT INTO asignaciones_semanales 
           (ruta_fija_id, fecha, conductor_id, vehiculo_id, estado)
           VALUES ($1, $2, $3, $4, 'pendiente') RETURNING id`,
          [ruta.id, fechaStr, conductorId, ruta.vehiculo_id]
        );

        // Crear sectores_asignacion para cada sector de la ruta
        const sectores = await pool.query(
          'SELECT id FROM sectores_ruta WHERE ruta_fija_id = $1 ORDER BY orden ASC',
          [ruta.id]
        );

        for (const sector of sectores.rows) {
          await pool.query(
            `INSERT INTO sectores_asignacion (asignacion_id, sector_id, estado)
             VALUES ($1, $2, 'pendiente')`,
            [asignacion.rows[0].id, sector.id]
          );
        }

        totalGeneradas++;
      }
    }

    console.log(`✅ Cron job completado: ${totalGeneradas} asignaciones generadas.`);

  } catch (error) {
    console.error('❌ Error en cron job:', error.message);
  }
};

// Ejecutar cada domingo a las 11pm
cron.schedule('0 23 * * 0', () => {
  generarAsignacionesSemanales();
}, {
  timezone: 'America/Bogota'
});

// Exportar la función para poder ejecutarla manualmente si se necesita
module.exports = { generarAsignacionesSemanales };