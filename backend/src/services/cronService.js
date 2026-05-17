const pool = require('../config/database');
const cron = require('node-cron');

const generarAsignaciones = async (fechaInicio = null) => {
  console.log('🕒 Iniciando generación de asignaciones...');
  
  try {
    const rutasFijas = await pool.query('SELECT * FROM rutas_fijas WHERE activo = TRUE');
    
    // Si no se pasa fecha, empezamos desde HOY para cubrir lo que queda de semana
    let fechaBase = fechaInicio ? new Date(fechaInicio) : new Date();
    
    for (let i = 0; i < 7; i++) {
      const fechaAsignacion = new Date(fechaBase);
      fechaAsignacion.setDate(fechaBase.getDate() + i);
      fechaAsignacion.setHours(0,0,0,0);
      
      const normalizeString = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
      const diaSemanaNombre = normalizeString(fechaAsignacion.toLocaleDateString('es-ES', { weekday: 'long' }));
      
      for (const ruta of rutasFijas.rows) {
        const correspondeDia = normalizeString(ruta.dias_semana).includes(diaSemanaNombre);
        
        if (correspondeDia) {
          // INSERTAR SI NO EXISTE
          const existe = await pool.query(
            'SELECT id FROM asignaciones_semanales WHERE ruta_fija_id = $1 AND fecha = $2',
            [ruta.id, fechaAsignacion]
          );

          if (existe.rows.length === 0) {
            const nuevaAsig = await pool.query(
              `INSERT INTO asignaciones_semanales (ruta_fija_id, conductor_id, vehiculo_id, fecha, estado)
               VALUES ($1, $2, $3, $4, 'pendiente') RETURNING id`,
              [ruta.id, ruta.conductor_default_id, ruta.vehiculo_id, fechaAsignacion]
            );

            const asigId = nuevaAsig.rows[0].id;

            // VINCULAR LOS SECTORES DE LA RUTA A ESTA ASIGNACIÓN ESPECÍFICA
            await pool.query(
              `INSERT INTO sectores_asignacion (asignacion_id, sector_id, estado, porcentaje_recorrido)
               SELECT $1, id, 'pendiente', 0
               FROM sectores_ruta
               WHERE ruta_fija_id = $2`,
              [asigId, ruta.id]
            );
          }
        } else {
          // ELIMINAR SI EXISTE Y ESTÁ PENDIENTE (ya no corresponde a este día)
          await pool.query(
            "DELETE FROM asignaciones_semanales WHERE ruta_fija_id = $1 AND fecha = $2 AND estado = 'pendiente'",
            [ruta.id, fechaAsignacion]
          );
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