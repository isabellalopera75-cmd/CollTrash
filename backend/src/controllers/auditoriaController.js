const pool = require('../config/database');

const obtenerHistorial = async (req, res) => {
  try {
    const limite = parseInt(req.query.limite) || 20;
    const pagina = parseInt(req.query.pagina) || 1;
    const offset = (pagina - 1) * limite;

    // Obtener el total de registros para metadatos
    const totalRes = await pool.query('SELECT COUNT(*) FROM auditoria');
    const totalRegistros = parseInt(totalRes.rows[0].count);
    const totalPaginas = Math.ceil(totalRegistros / limite);

    const resultado = await pool.query(`
      SELECT a.*, u.nombre as usuario_nombre, u.email as usuario_email
      FROM auditoria a
      LEFT JOIN usuarios u ON u.id = a.usuario_id
      ORDER BY a.fecha DESC
      LIMIT $1 OFFSET $2
    `, [limite, offset]);

    res.status(200).json({
      historial: resultado.rows,
      paginacion: {
        totalRegistros,
        totalPaginas,
        paginaActual: pagina,
        limite
      }
    });
  } catch (error) {
    console.error('Error al obtener historial:', error.message);
    res.status(500).json({ mensaje: 'Error al obtener el historial de actividad.' });
  }
};

module.exports = { obtenerHistorial };

