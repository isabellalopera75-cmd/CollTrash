const pool = require('../config/database');
const { getFechaColombia } = require('../utils/dateUtils');

const dashboardDiario = async (req, res) => {
  try {
    // getFechaColombia y no aritmetica sobre getTimezoneOffset: lo anterior
    // devolvia la fecha local del servidor, que solo coincide con la de
    // Colombia mientras el servidor este en Colombia. El helper ya estaba
    // importado en este archivo pero no se usaba.
    const hoy = getFechaColombia();

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
       FROM mv_eficiencia_rutas e
       JOIN asignaciones_semanales a ON a.id = e.asignacion_id
       WHERE a.fecha = $1`,
      [hoy]
    );

    const reportesPendientes = await pool.query(
      `SELECT COUNT(*) AS pendientes
       FROM reportes_ciudadanos
       WHERE estado = 'pendiente'
         AND created_at >= ($1::date - INTERVAL '1 day')`,
      [hoy]
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
    // Misma referencia horaria que dashboardDiario (America/Bogota).
    const hoy = getFechaColombia();

    const resultado = await pool.query(
      `SELECT 
         d::date AS fecha,
         COALESCE(SUM(a.toneladas), 0) AS toneladas
       FROM generate_series(
         date_trunc('week', $1::date)::date,
         date_trunc('week', $1::date)::date + 6,
         '1 day'
       ) AS d
       LEFT JOIN asignaciones_semanales a ON a.fecha = d::date
       GROUP BY d
       ORDER BY d ASC`,
      [hoy]
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
       LEFT JOIN mv_eficiencia_rutas e ON e.asignacion_id = a.id
       WHERE a.fecha BETWEEN $1 AND $2
       GROUP BY DATE_TRUNC('week', a.fecha)
       ORDER BY semana ASC`,
      [primerDia.toISOString().split('T')[0], ultimoDia.toISOString().split('T')[0]]
    );

    const porConductor = await pool.query(
      `SELECT u.nombre,
        ROUND(AVG(e.porcentaje_cumplimiento), 2) AS porcentaje_promedio
       FROM mv_eficiencia_rutas e
       JOIN asignaciones_semanales a ON a.id = e.asignacion_id
       JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id
       -- Mismo criterio que el informe de eficiencia: el promedio de
       -- cumplimiento se acredita a quien condujo la jornada.
       JOIN usuarios u ON u.id = COALESCE(a.conductor_id, rf.conductor_default_id)
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

const reporteEficiencia = async (req, res) => {
  try {
    const { inicio, fin } = req.query;
    
    const query = `
      SELECT 
        a.id,
        a.fecha,
        rf.nombre AS ruta_nombre,
        u.nombre AS conductor_nombre,
        v.placa AS vehiculo_placa,
        e.toneladas,
        e.km_recorridos,
        e.tiempo_minutos,
        e.porcentaje_cumplimiento,
        e.num_descargas
      FROM mv_eficiencia_rutas e
      JOIN asignaciones_semanales a ON a.id = e.asignacion_id
      JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id
      -- Tripulación efectiva de la jornada, no la configuración base de la ruta
      -- (RNF-12). Leyendo rutas_fijas, toda jornada cubierta por un relevo o
      -- por una reasignación quedaba acreditada al conductor titular: el
      -- reemplazo no aparecía en el informe y el titular figuraba con
      -- toneladas y kilómetros que no hizo.
      JOIN usuarios  u ON u.id = COALESCE(a.conductor_id, rf.conductor_default_id)
      JOIN vehiculos v ON v.id = COALESCE(a.vehiculo_id, rf.vehiculo_id)
      WHERE a.fecha BETWEEN $1 AND $2
      ORDER BY a.fecha DESC
    `;
    
    const resultado = await pool.query(query, [
      inicio || getFechaColombia(-30),
      fin || getFechaColombia()
    ]);

    res.status(200).json({ reportes: resultado.rows });
  } catch (error) {
    console.error('Error en reporteEficiencia:', error.message);
    res.status(500).json({ mensaje: 'Error al generar reporte.' });
  }
};

const obtenerNovedadesOperativas = async (req, res) => {
  try {
    // LEFT JOIN sobre usuarios y no JOIN interno.
    //
    // Las novedades tienen dos orígenes: las que registra el administrador
    // (REACTIVACION_MANUAL, con su admin_id) y las que registra el propio
    // conductor al justificar un inicio tardío (RF-26), que se guardan con
    // admin_id NULL porque ningún administrador interviene.
    //
    // Con el JOIN interno esas últimas se descartaban en silencio: la
    // justificación se pedía al conductor, se guardaba en la base y no llegaba
    // nunca al panel. La tabla del historial ya estaba preparada para
    // mostrarlas y ese código no se había ejecutado jamás.
    //
    // Se trae además el conductor de la asignación, para que el administrador
    // vea quién llegó tarde y no un genérico.
    const resultado = await pool.query(
      `SELECT n.*,
              u.nombre  AS admin_nombre,
              uc.nombre AS conductor_nombre,
              rf.nombre AS ruta_nombre,
              a.fecha   AS fecha_asignacion
       FROM novedades_operativas n
       JOIN asignaciones_semanales a ON a.id = n.asignacion_id
       JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id
       LEFT JOIN usuarios u  ON u.id  = n.admin_id
       LEFT JOIN usuarios uc ON uc.id = COALESCE(a.conductor_id, rf.conductor_default_id)
       ORDER BY n.fecha DESC LIMIT 100`
    );
    res.json({ novedades: resultado.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener novedades' });
  }
};

module.exports = { 
  dashboardDiario, 
  dashboardSemanal, 
  dashboardMensual, 
  reporteEficiencia,
  obtenerNovedadesOperativas
};
