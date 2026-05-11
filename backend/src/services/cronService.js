const pool = require('../config/database');
const cron = require('node-cron');

const generarAsignaciones = async (fechaInicio = null) => {
  console.log('🕒 Iniciando generación de asignaciones...');
  
  try {
    const rutasFijas = await pool.query('SELECT * FROM rutas_fijas WHERE activo = TRUE');
    
    // Si no se pasa fecha, empezamos desde HOY para cubrir lo que queda de semana
    let fechaBase = fechaInicio ? new Date(fechaInicio) : new Date();
    
    // Generar para los próximos 7 días a partir de la fecha base
    for (let i = 0; i < 7; i++) {
      const fechaAsignacion = new Date(fechaBase);
      fechaAsignacion.setDate(fechaBase.getDate() + i);
      
      // Resetear horas para comparar solo fechas
      fechaAsignacion.setHours(0,0,0,0);
      
      const diaSemanaNombre = fechaAsignacion.toLocaleDateString('es-ES', { weekday: 'long' }).toLowerCase();
      
      for (const ruta of rutasFijas.rows) {
        if (ruta.dias_semana.toLowerCase().includes(diaSemanaNombre)) {
          
          // Verificar si ya existe para evitar duplicados
          const existe = await pool.query(
            'SELECT id FROM asignaciones_semanales WHERE ruta_fija_id = $1 AND fecha = $2',
            [ruta.id, fechaAsignacion]
          );

          if (existe.rows.length === 0) {
            await pool.query(
              `INSERT INTO asignaciones_semanales (ruta_fija_id, conductor_id, vehiculo_id, fecha, estado)
               VALUES ($1, $2, $3, $4, 'pendiente')`,
              [ruta.id, ruta.conductor_default_id, ruta.vehiculo_id, fechaAsignacion]
            );
          }
        }
      }
    }
    
    console.log('🚀 Asignaciones generadas/actualizadas con éxito.');
  } catch (error) {
    console.error('❌ Error en el generador:', error.message);
  }
};

// Domingo 11 PM: Genera la PRÓXIMA semana
cron.schedule('0 23 * * 0', () => {
  const hoy = new Date();
  const lunesProx = new Date(hoy);
  lunesProx.setDate(hoy.getDate() + ((1 + 7 - hoy.getDay()) % 7 || 7));
  generarAsignaciones(lunesProx);
});

module.exports = { generarAsignaciones };