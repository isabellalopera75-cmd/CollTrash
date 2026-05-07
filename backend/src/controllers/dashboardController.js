const pool = require('../config/database');

const dashboardDiario = async (req, res) => {
  try {
    const hoy = new Date().toISOString().split('T')[0];

    const rutas = await pool.query(
      `SELECT 
        COUNT(*) AS total_programadas,
        COUNT(*) FILTER (WHERE estado = 'completada') AS completadas,
        COUNT(*) FILTER (WHERE estado = 'activa') AS activas,
        COUNT(*) FILTER (WHERE estado = 'incompleta') AS incompletas,
        COUNT(*) FILTER (WHERE estado = 'no_asistido') AS no_asistidos,
        COUNT(*) FILTER (WHERE inicio_tardio = TRUE) AS inicio_tardio
       FROM asignaciones_semanales WHERE fecha = $1`,
      [hoy]
    );

    const eficiencia = await pool.query(
      `SELECT 
        COALESCE(SUM(e.km_recorridos), 0) AS km_totales,
        COALESCE(SUM(e.toneladas), 0) AS toneladas_totales
       FROM eficiencia_rutas e
       JOIN asignaciones_semanales a ON a.id = e.asignacion_id
       WHERE a.fecha = $1`,
      [hoy]
    );

    const reportesPendientes = await pool.query(
      "SELECT COUNT(*) AS pendientes FROM reportes_ciudadanos WHERE estado = 'pendiente'"
    );

    res.status(200).json({
      fecha: hoy,
      rutas: rutas.rows[0],
      eficiencia: eficiencia.rows[0],
      reportes_pendientes: reportesPendientes.rows[0].pendientes
    });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const dashboardSemanal = async (req, res) => {
  try {
    const hoy = new Date();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - hoy.getDay() + 1);
    const sabado = new Date(lunes);
    sabado.setDate(lunes.getDate() + 5);

    const resultado = await pool.query(
      `SELECT a.fecha,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE a.estado = 'completada') AS completadas
       FROM asignaciones_semanales a
       WHERE a.fecha BETWEEN $1 AND $2
       GROUP BY a.fecha ORDER BY a.fecha ASC`,
      [lunes.toISOString().split('T')[0], sabado.toISOString().split('T')[0]]
    );

    res.status(200).json({ semana: resultado.rows });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const dashboardMensual = async (req, res) => {
  try {
    const ahora = new Date();
    const primerDia = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const ultimoDia = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0);

    const tendencia = await pool.query(
      `SELECT DATE_TRUNC('week', a.fecha) AS semana,
        COALESCE(SUM(e.toneladas), 0) AS toneladas
       FROM asignaciones_semanales a
       LEFT JOIN eficiencia_rutas e ON e.asignacion_id = a.id
       WHERE a.fecha BETWEEN $1 AND $2
       GROUP BY DATE_TRUNC('week', a.fecha)
       ORDER BY semana ASC`,
      [primerDia.toISOString().split('T')[0], ultimoDia.toISOString().split('T')[0]]
    );

    const porConductor = await pool.query(
      `SELECT u.nombre,
        ROUND(AVG(e.porcentaje_cumplimiento), 2) AS porcentaje_promedio
       FROM eficiencia_rutas e
       JOIN asignaciones_semanales a ON a.id = e.asignacion_id
       JOIN usuarios u ON u.id = a.conductor_id
       WHERE a.fecha BETWEEN $1 AND $2
       GROUP BY u.nombre`,
      [primerDia.toISOString().split('T')[0], ultimoDia.toISOString().split('T')[0]]
    );

    res.status(200).json({ tendencia: tendencia.rows, por_conductor: porConductor.rows });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

module.exports = { dashboardDiario, dashboardSemanal, dashboardMensual };