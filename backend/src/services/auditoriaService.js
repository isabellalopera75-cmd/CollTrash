const pool = require('../config/database');

/**
 * Registra una acción en el historial de auditoría
 * @param {number} usuario_id - ID del usuario que realiza la acción
 * @param {string} accion - Descripción breve (Ej: 'Creación de Ruta', 'Cambio de Conductor')
 * @param {string} entidad - Nombre de la tabla afectada (Ej: 'rutas_fijas')
 * @param {number} entidad_id - ID del registro afectado
 * @param {object|string} detalles - Información adicional (Ej: { antes: 'Juan', después: 'Pedro' })
 */
const registrarActividad = async (usuario_id, accion, entidad, entidad_id, detalles) => {
  try {
    const detallesJSON = typeof detalles === 'object' ? JSON.stringify(detalles) : detalles;
    
    await pool.query(
      `INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalles)
       VALUES ($1, $2, $3, $4, $5)`,
      [usuario_id, accion, entidad, entidad_id, detallesJSON]
    );
  } catch (error) {
    console.error('⚠️ Error al registrar auditoría:', error.message);
  }
};

module.exports = { registrarActividad };
