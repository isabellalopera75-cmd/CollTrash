const pool = require('../config/database');

const obtenerNotificaciones = async (req, res) => {
  try {
    const { id, rol } = req.usuario;
    const filtro = rol === 'administrador'
      ? 'WHERE usuario_id IS NULL OR usuario_id = $1'
      : 'WHERE usuario_id = $1';

    // El desempate por id es necesario: `fecha` tiene por omision now(), que
    // dentro de una misma transaccion devuelve el mismo instante para todas las
    // filas. Con solo ORDER BY fecha, las notificaciones creadas a la vez
    // (inicio de descarga, fin de ruta, reporte asignado) salian en orden
    // arbitrario y cambiaban de sitio entre una recarga y otra. El id es
    // estrictamente creciente, asi que fija el orden de llegada.
    const resultado = await pool.query(
      `SELECT * FROM notificaciones ${filtro} ORDER BY fecha DESC, id DESC LIMIT 20`,
      [id]
    );
    res.json({ notificaciones: resultado.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener notificaciones' });
  }
};

// Ventana por omisión de la bitácora: dos días. Es lo que un administrador
// necesita ver de un vistazo; para algo más antiguo se indica la fecha.
const DIAS_POR_OMISION = 2;

// Tope duro de filas por consulta, para que un rango amplio no traiga la tabla
// entera al navegador.
const LIMITE_FILAS = 500;

const esFechaValida = (valor) => typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);

/**
 * Bitácora de notificaciones.
 *
 * Sin rango indicado devuelve los últimos dos días. Con `desde` y/o `hasta`
 * (YYYY-MM-DD) devuelve ese intervalo, para consultar un episodio concreto sin
 * arrastrar todo el histórico.
 *
 * Antes traía siempre las últimas 500 sin filtro de fecha: la lista mezclaba lo
 * de hoy con lo del mes pasado y crecía sin control.
 */
const obtenerTodasNotificaciones = async (req, res) => {
  try {
    const { id, rol } = req.usuario;
    const { desde, hasta } = req.query;

    if ((desde && !esFechaValida(desde)) || (hasta && !esFechaValida(hasta))) {
      return res.status(400).json({ mensaje: 'Las fechas deben tener el formato AAAA-MM-DD.' });
    }
    if (desde && hasta && desde > hasta) {
      return res.status(400).json({ mensaje: 'La fecha inicial no puede ser posterior a la final.' });
    }

    const condiciones = [rol === 'administrador'
      ? '(usuario_id IS NULL OR usuario_id = $1)'
      : 'usuario_id = $1'];
    const params = [id];

    if (desde || hasta) {
      if (desde) {
        params.push(desde);
        condiciones.push(`fecha >= $${params.length}::date`);
      }
      if (hasta) {
        // El día indicado se incluye completo: se compara contra su medianoche
        // siguiente, no contra las 00:00 de esa misma fecha.
        params.push(hasta);
        condiciones.push(`fecha < ($${params.length}::date + INTERVAL '1 day')`);
      }
    } else {
      condiciones.push(`fecha >= (NOW() - INTERVAL '${DIAS_POR_OMISION} days')`);
    }

    const resultado = await pool.query(
      `SELECT * FROM notificaciones
        WHERE ${condiciones.join(' AND ')}
        ORDER BY fecha DESC, id DESC
        LIMIT ${LIMITE_FILAS}`,
      params
    );

    res.json({
      notificaciones: resultado.rows,
      rango: {
        desde: desde || null,
        hasta: hasta || null,
        dias_por_omision: (desde || hasta) ? null : DIAS_POR_OMISION,
        limite: LIMITE_FILAS,
        truncado: resultado.rows.length === LIMITE_FILAS
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener el historial de notificaciones' });
  }
};

const marcarLeida = async (req, res) => {
  const { id } = req.params;
  try {
    const usuarioId = req.usuario.id;
    const filtro = req.usuario.rol === 'administrador'
      ? '(usuario_id IS NULL OR usuario_id = $2)'
      : 'usuario_id = $2';

    await pool.query(`UPDATE notificaciones SET leida = TRUE WHERE id = $1 AND ${filtro}`, [id, usuarioId]);
    res.json({ mensaje: 'Notificación marcada como leída' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al actualizar notificación' });
  }
};

const marcarTodasLeidas = async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const filtro = req.usuario.rol === 'administrador'
      ? 'usuario_id IS NULL OR usuario_id = $1'
      : 'usuario_id = $1';

    await pool.query(`UPDATE notificaciones SET leida = TRUE WHERE ${filtro}`, [usuarioId]);
    res.json({ mensaje: 'Todas las notificaciones marcadas como leídas' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al actualizar notificaciones' });
  }
};

module.exports = {
  obtenerNotificaciones,
  obtenerTodasNotificaciones,
  marcarLeida,
  marcarTodasLeidas
};
