const pool = require('../config/database');

/**
 * Refresco agrupado de mv_eficiencia_rutas.
 *
 * Antes cada finalización de ruta ejecutaba REFRESH MATERIALIZED VIEW
 * CONCURRENTLY de forma síncrona. Eso recalcula la vista completa y retiene una
 * conexión del pool durante todo el proceso; con varias rutas cerrando a la vez
 * los refrescos se encolaban unos sobre otros y competían por el pool.
 *
 * Aquí las solicitudes se agrupan en una ventana corta: diez cierres seguidos
 * producen un único refresco. Se mantiene la latencia baja que pide RF-09.4
 * (el dashboard se actualiza al finalizar una ruta) sin la avalancha.
 */

const VENTANA_MS = 5000;

let temporizador = null;
let refrescando = false;
let pendiente = false;

const ejecutarRefresco = async () => {
  if (refrescando) {
    // Un refresco ya está en curso: se anota que hubo cambios posteriores para
    // relanzarlo al terminar. CONCURRENTLY no admite dos refrescos a la vez.
    pendiente = true;
    return;
  }

  refrescando = true;
  try {
    await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_eficiencia_rutas');
  } catch (err) {
    console.error('No se pudo refrescar mv_eficiencia_rutas:', err.message);
  } finally {
    refrescando = false;
    if (pendiente) {
      pendiente = false;
      solicitarRefrescoEficiencia();
    }
  }
};

/** Pide un refresco de la vista de eficiencia; las llamadas seguidas se agrupan. */
const solicitarRefrescoEficiencia = () => {
  if (temporizador) return;
  temporizador = setTimeout(() => {
    temporizador = null;
    ejecutarRefresco();
  }, VENTANA_MS);
  if (typeof temporizador.unref === 'function') temporizador.unref();
};

module.exports = { solicitarRefrescoEficiencia };
