const pool = require('../config/database');

const obtenerBarrios = async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM barrios ORDER BY nombre ASC');
    res.status(200).json({ barrios: resultado.rows });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Distancia máxima entre la posición del ciudadano y el centro de un barrio
// para darlo por suyo. Sin este límite la consulta devolvía siempre el barrio
// más cercano del catálogo, aunque el ciudadano estuviera a cientos de
// kilómetros de Neiva: la detección nunca podía fallar y, por tanto, nunca
// cedía el paso a la selección manual.
const RADIO_DETECCION_KM = 5;

const detectarBarrio = async (req, res) => {
  const { lat, lng } = req.query;

  try {
    const latitud = Number(lat);
    const longitud = Number(lng);

    if (!Number.isFinite(latitud) || !Number.isFinite(longitud) ||
        latitud < -90 || latitud > 90 || longitud < -180 || longitud > 180) {
      return res.status(400).json({ mensaje: 'Latitud y longitud válidas son requeridas.' });
    }

    // Distancia ortodrómica (fórmula del semiverseno) al centro de cada barrio.
    // Se descartan los barrios sin coordenadas: su distancia es NULL y en
    // PostgreSQL los NULL ordenan al final, pero con LIMIT 1 sobre un catálogo
    // incompleto podían colarse como resultado.
    const resultado = await pool.query(
      `SELECT id, nombre, sector, latitud_centro, longitud_centro,
              (6371 * acos(
                 LEAST(1, GREATEST(-1,
                   cos(radians($1)) * cos(radians(latitud_centro)) *
                   cos(radians(longitud_centro) - radians($2)) +
                   sin(radians($1)) * sin(radians(latitud_centro))
                 ))
              )) AS distancia_km
         FROM barrios
        WHERE latitud_centro IS NOT NULL AND longitud_centro IS NOT NULL
        ORDER BY distancia_km ASC
        LIMIT 1`,
      [latitud, longitud]
    );

    const barrio = resultado.rows[0];

    if (!barrio || Number(barrio.distancia_km) > RADIO_DETECCION_KM) {
      return res.status(404).json({
        mensaje: 'No se detectó ningún barrio cercano a su ubicación. Selecciónelo manualmente.'
      });
    }

    res.status(200).json({
      barrio: { ...barrio, distancia_km: Number(Number(barrio.distancia_km).toFixed(2)) }
    });
  } catch (error) {
    console.error('Error al detectar barrio:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

module.exports = { obtenerBarrios, detectarBarrio };
