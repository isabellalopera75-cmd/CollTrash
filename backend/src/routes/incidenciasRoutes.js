const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { obtenerIncidenciasActivas, crearIncidencia } = require('../controllers/incidenciasController');
const { verificarToken, soloAdmin, soloConductor } = require('../middlewares/authMiddleware');
const { emitirAdmins, emitirUsuario } = require('../config/socket');
const { crearNotificacion } = require('../services/notificacionService');
const { stopSimulation } = require('../services/simuladorService');

// Conductor crea una incidencia
router.post('/', verificarToken, soloConductor, crearIncidencia);

// Admin consulta incidencias activas
router.get('/', verificarToken, soloAdmin, obtenerIncidenciasActivas);

/**
 * Admin resuelve una incidencia (RF-07.5, RF-07.6, RF-07.8).
 *
 * Los tipos falla_motor y accidente exigen relevo de conductor y vehiculo.
 * operario_lesionado admite relevo opcional: si no se indica, se gestiona como
 * protocolo medico sin cambiar la tripulacion.
 */
router.put('/:id/resolver', verificarToken, soloAdmin, async (req, res) => {
  const { resolucion, nuevo_conductor_id, nuevo_vehiculo_id, eta_minutos } = req.body;
  const incidencia_id = req.params.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Se bloquea la incidencia para que dos administradores no puedan
    // resolverla a la vez y generar dos relevos sobre la misma asignacion.
    const incRes = await client.query(
      'SELECT * FROM incidencias_conductor WHERE id = $1 FOR UPDATE',
      [incidencia_id]
    );

    if (incRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ mensaje: 'Incidencia no encontrada' });
    }

    const incidencia = incRes.rows[0];

    if (incidencia.resuelto) {
      await client.query('ROLLBACK');
      return res.status(409).json({ mensaje: 'Esta incidencia ya fue resuelta.' });
    }

    const pideRelevo = Boolean(nuevo_conductor_id && nuevo_vehiculo_id);
    const exigeRelevo = incidencia.tipo === 'falla_motor' || incidencia.tipo === 'accidente';

    // CASO A: relevo de conductor y vehiculo
    if (exigeRelevo || pideRelevo) {
      if (!pideRelevo) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          mensaje: 'Se requiere conductor y vehiculo de reemplazo para este tipo de incidencia.'
        });
      }

      if (!incidencia.asignacion_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          mensaje: 'Esta incidencia no esta ligada a una asignacion, no es posible asignar un relevo.'
        });
      }

      const asigRes = await client.query(
        'SELECT ruta_fija_id, fecha FROM asignaciones_semanales WHERE id = $1 FOR UPDATE',
        [incidencia.asignacion_id]
      );

      if (asigRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ mensaje: 'La asignacion de la incidencia ya no existe.' });
      }

      const { ruta_fija_id, fecha } = asigRes.rows[0];

      // Validar que el relevo exista y este disponible
      const relevo = await client.query(
        `SELECT
           (SELECT count(*) FROM usuarios  WHERE id = $1 AND rol = 'conductor' AND activo = TRUE) AS conductor_ok,
           (SELECT count(*) FROM vehiculos WHERE id = $2 AND activo = TRUE)                       AS vehiculo_ok`,
        [nuevo_conductor_id, nuevo_vehiculo_id]
      );

      if (Number(relevo.rows[0].conductor_ok) === 0 || Number(relevo.rows[0].vehiculo_ok) === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ mensaje: 'El conductor o el vehiculo de reemplazo no existe o esta inactivo.' });
      }

      // El relevo llega en mitad de la jornada, casi siempre pasado el margen de
      // no asistencia. Sin habilitado_por_admin el conductor de reemplazo choca
      // contra el bloqueo por retraso de iniciarRuta y no puede arrancar nunca,
      // que es justamente el escenario para el que existe esta funcion.
      await client.query(
        `UPDATE asignaciones_semanales
            SET conductor_id = $1,
                vehiculo_id = $2,
                estado = 'pendiente',
                habilitado_por_admin = TRUE
          WHERE id = $3`,
        [nuevo_conductor_id, nuevo_vehiculo_id, incidencia.asignacion_id]
      );

      // origen 'relevo_incidencia' (migracion 014): el relevo es una
      // contingencia, no una decision de logistica, asi que no consume el unico
      // cupo de reasignacion manual que tiene la asignacion ese dia.
      await client.query(
        `INSERT INTO cambios_conductor
           (ruta_fija_id, asignacion_id, origen, conductor_original_id, conductor_reemplazante_id, motivo, fecha_inicio, fecha_fin, es_permanente)
         VALUES ($1, $2, 'relevo_incidencia', $3, $4, $5, $6, $6, false)`,
        [
          ruta_fija_id,
          incidencia.asignacion_id,
          incidencia.conductor_id,
          nuevo_conductor_id,
          `Relevo por ${incidencia.tipo}: ${incidencia.descripcion || 'Siniestro en ruta'}`,
          fecha
        ]
      );

      const finalRes = await client.query(
        'UPDATE incidencias_conductor SET resuelto = TRUE, resolucion = $1 WHERE id = $2 RETURNING *',
        [resolucion || `Relevo asignado. Conductor de refuerzo en camino. ETA: ${eta_minutos || 'N/A'} min.`, incidencia_id]
      );

      await client.query('COMMIT');

      // Los efectos externos (notificaciones y sockets) van despues del COMMIT:
      // si la transaccion se deshace, nadie recibe aviso de algo que no ocurrio.
      await crearNotificacion({
        usuario_id: nuevo_conductor_id,
        titulo: 'Relevo de Emergencia',
        mensaje: 'Tienes un relevo de emergencia asignado. Revisa tu panel para la ubicacion exacta.',
        tipo: 'urgente',
        metadata: {
          tipo: 'RELEVO_EMERGENCIA',
          asignacion_id: incidencia.asignacion_id,
          lat: incidencia.lat,
          lng: incidencia.lng
        }
      });

      stopSimulation(incidencia.asignacion_id);
      emitirAdmins('incidencia_resuelta', incidencia_id);
      emitirUsuario(incidencia.conductor_id, 'novedad_atendida', {
        incidencia_id,
        mensaje: `La grua y tu relevo van en camino. ETA estimado: ${eta_minutos || 'N/A'} minutos.`
      });

      return res.json({ mensaje: 'Refuerzo asignado e incidencia resuelta.', incidencia: finalRes.rows[0] });
    }

    // CASO B: resolucion sin relevo
    const mensajeConductor = incidencia.tipo === 'operario_lesionado'
      ? 'La ambulancia va en camino, ayuda medica notificada.'
      : 'Tu reporte ha sido leido y gestionado por el admin.';

    const resolucionPorDefecto = incidencia.tipo === 'operario_lesionado'
      ? 'Ambulancia y protocolo gestionado por el administrador'
      : 'Resolucion simple por el administrador';

    const r = await client.query(
      'UPDATE incidencias_conductor SET resuelto = TRUE, resolucion = $1 WHERE id = $2 RETURNING *',
      [resolucion || resolucionPorDefecto, incidencia_id]
    );

    await client.query('COMMIT');

    emitirAdmins('incidencia_resuelta', incidencia_id);
    emitirUsuario(incidencia.conductor_id, 'novedad_atendida', { incidencia_id, mensaje: mensajeConductor });

    res.json({ mensaje: 'Incidencia marcada como resuelta.', incidencia: r.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error al resolver incidencia:', e.message);
    res.status(500).json({ mensaje: 'Error al resolver incidencia.' });
  } finally {
    client.release();
  }
});

module.exports = router;
