const pool = require('../config/database');
const { crearNotificacion } = require('../services/notificacionService');
const { emitirAdmins, emitirUsuario } = require('../config/socket');

/**
 * Difunde el cambio de estado de un reporte.
 * Va al panel del administrador y, ademas, al ciudadano que lo creo, para que
 * vea la actualizacion en su portal sin recargar (RF-08.6). Antes se emitia con
 * io.emit a todos los sockets conectados, incluidos conductores ajenos.
 */
const emitirReporteActualizado = (reporte) => {
  if (!reporte) return;
  emitirAdmins('reporte_actualizado', reporte);
  if (reporte.ciudadano_id) {
    emitirUsuario(reporte.ciudadano_id, 'reporte_actualizado', reporte);
  }
};

const fs = require('fs');
const path = require('path');
const { getFechaColombia, aFechaISO, formatearFechaLarga } = require('../utils/dateUtils');
const heicConvert = require('heic-convert');
require('dotenv').config();

const notificarConductorReporteAsignado = async (asignacionId, reporte) => {
  if (!asignacionId || !reporte) return;

  const asignacionRes = await pool.query(
    `SELECT COALESCE(a.conductor_id, rf.conductor_default_id) AS conductor_id,
            rf.nombre AS ruta_nombre, a.fecha
     FROM asignaciones_semanales a
     JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id
     WHERE a.id = $1`,
    [asignacionId]
  );

  if (asignacionRes.rows.length === 0 || !asignacionRes.rows[0].conductor_id) return;

  const asignacion = asignacionRes.rows[0];
  await crearNotificacion({
    usuario_id: asignacion.conductor_id,
    titulo: 'Reporte ciudadano asignado',
    mensaje: `Tienes un reporte de ${reporte.tipo_problema} asignado a la ruta ${asignacion.ruta_nombre}.`,
    tipo: 'comunidad',
    metadata: {
      tipo: 'REPORTE_ASIGNADO',
      reporte_id: reporte.id,
      asignacion_id: asignacionId,
      ruta_nombre: asignacion.ruta_nombre,
      fecha: asignacion.fecha
    }
  });
};

const crearReporte = async (req, res) => {
  const { latitud, longitud, descripcion, tipo_problema, nombre_ciudadano, barrio_id, descripcion_extra } = req.body;
  
  // La ruta exige token (reportesRoutes), de modo que siempre hay un autor: para
  // reportar hay que estar registrado y con la sesion iniciada. La rama que
  // contemplaba un autor anonimo era codigo muerto y hacia creer que el reporte
  // sin cuenta estaba soportado. nombre_ciudadano se sigue pidiendo porque es lo
  // que se muestra al administrador y al conductor.
  const ciudadanoId = req.usuario.id;
  
  let foto_url = req.file ? `/uploads/reportes/${req.file.filename}` : null;

  if (req.file && req.file.filename.toLowerCase().endsWith('.heic')) {
    try {
      const inputBuffer = await fs.promises.readFile(req.file.path);
      const outputBuffer = await heicConvert({
        buffer: inputBuffer,
        format: 'JPEG',
        quality: 0.5
      });
      
      const newFilename = req.file.filename.replace(/\.heic$/i, '.jpeg');
      const newPath = path.join(req.file.destination, newFilename);
      
      await fs.promises.writeFile(newPath, outputBuffer);
      await fs.promises.unlink(req.file.path);
      
      foto_url = `/uploads/reportes/${newFilename}`;
    } catch (err) {
      console.error('Error convirtiendo HEIC a JPEG:', err);
    }
  }

  // Combinar ubicación con descripción extra si existe
  const descripcionCompleta = descripcion_extra
    ? `${descripcion || ''}\n[Detalle: ${descripcion_extra}]`.trim()
    : (descripcion || null);

  try {
    if (!latitud || !longitud || !tipo_problema || !nombre_ciudadano) {
      return res.status(400).json({ mensaje: 'Ubicación, tipo de problema y nombre son obligatorios.' });
    }

    const resultado = await pool.query(
      `INSERT INTO reportes_ciudadanos (ciudadano_id, latitud, longitud, descripcion, foto_url, tipo_problema, nombre_ciudadano)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [ciudadanoId, latitud, longitud, descripcionCompleta, foto_url, tipo_problema, nombre_ciudadano]
    );

    // NOTIFICAR ADMIN: Nuevo reporte ciudadano
    await crearNotificacion({
      titulo: 'Reporte ciudadano',
      mensaje: `Nuevo reporte de ${nombre_ciudadano} por ${tipo_problema}.`,
      tipo: 'comunidad',
      metadata: { reporte_id: resultado.rows[0].id, tipo: 'REPORTE_CIUDADANO' }
    });

    res.status(201).json({ mensaje: 'Reporte enviado exitosamente.', reporte: resultado.rows[0] });
  } catch (error) {
    console.error('Error al crear reporte:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const obtenerReportes = async (req, res) => {
  try {
    const limite = parseInt(req.query.limite) || 20;
    const pagina = parseInt(req.query.pagina) || 1;
    const offset = (pagina - 1) * limite;

    // Obtener el total de registros para metadatos
    const totalRes = await pool.query('SELECT COUNT(*) FROM reportes_ciudadanos');
    const totalRegistros = parseInt(totalRes.rows[0].count);
    const totalPaginas = Math.ceil(totalRegistros / limite);

    // Usamos LEFT JOIN para que se vean los reportes aunque no tengan un ciudadano_id vinculado
    const resultado = await pool.query(
      `SELECT r.*, COALESCE(c.nombre, r.nombre_ciudadano) AS ciudadano_nombre, c.email AS ciudadano_email
       FROM reportes_ciudadanos r
       LEFT JOIN usuarios c ON c.id = r.ciudadano_id
       ORDER BY r.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limite, offset]
    );

    res.status(200).json({ 
      reportes: resultado.rows,
      paginacion: {
        totalRegistros,
        totalPaginas,
        paginaActual: pagina,
        limite
      }
    });
  } catch (error) {
    console.error('Error al obtener reportes:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};



const actualizarEstado = async (req, res) => {
  const { id } = req.params;
  const { estado, justificacion_rechazo, ruta_id, asignacion_id, asignacion_semanal_id, fecha_programada } = req.body;

  const targetId = asignacion_id || asignacion_semanal_id || ruta_id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let resultado;
    let finalAsignacionId = null;
    let targetRutaNombre = '';
    let targetFecha = null;

    if (estado === 'en_proceso' || estado === 'resuelto' || estado === 'atendido') {
      if (targetId) {
        if (typeof targetId === 'string' && targetId.includes('_')) {
          const parts = targetId.split('_');
          const rutaFijaId = parseInt(parts[0]);
          targetFecha = parts[1];

          // Obtener datos de la ruta fija
          const infoRuta = await client.query('SELECT nombre, conductor_default_id, vehiculo_id FROM rutas_fijas WHERE id = $1', [rutaFijaId]);
          if (infoRuta.rows.length > 0) {
            targetRutaNombre = infoRuta.rows[0].nombre;
            
            // Buscar si ya existe la asignación para esta ruta y fecha
            let asignacionRes = await client.query(
              'SELECT id FROM asignaciones_semanales WHERE ruta_fija_id = $1 AND fecha = $2',
              [rutaFijaId, targetFecha]
            );

            if (asignacionRes.rows.length > 0) {
              finalAsignacionId = asignacionRes.rows[0].id;
            } else {
              // Si no existe, la creamos dinámicamente para ese día.
              //
              // La tripulación se copia de la ruta fija en el propio INSERT.
              // Antes se omitía, y ésta era la única vía del sistema que dejaba
              // asignaciones con conductor y vehículo en nulo: por eso el resto
              // de consultas necesitaba un COALESCE contra rutas_fijas, y de ahí
              // salía la tentación de unir directamente contra la ruta fija, que
              // atribuye la jornada al titular y no a quien la condujo.
              const insertRes = await client.query(
                `INSERT INTO asignaciones_semanales (ruta_fija_id, conductor_id, vehiculo_id, fecha, estado)
                 SELECT rf.id, rf.conductor_default_id, rf.vehiculo_id, $2, 'pendiente'
                   FROM rutas_fijas rf
                  WHERE rf.id = $1
                 RETURNING id`,
                [rutaFijaId, targetFecha]
              );
              finalAsignacionId = insertRes.rows[0].id;

              // Vincular los sectores de la ruta a la nueva asignación
              await client.query(
                `INSERT INTO sectores_asignacion (asignacion_id, sector_id, estado, porcentaje_recorrido)
                 SELECT $1, id, 'pendiente', 0
                 FROM sectores_ruta
                 WHERE ruta_fija_id = $2
                 ON CONFLICT (asignacion_id, sector_id) DO NOTHING`,
                [finalAsignacionId, rutaFijaId]
              );
            }
          }
        } else {
          finalAsignacionId = parseInt(targetId);
          // Obtener info básica de la asignación
          const infoAsig = await client.query(
            `SELECT rf.nombre, a.fecha 
             FROM asignaciones_semanales a 
             JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id 
             WHERE a.id = $1`, 
            [finalAsignacionId]
          );
          if (infoAsig.rows.length > 0) {
            targetRutaNombre = infoAsig.rows[0].nombre;
            targetFecha = infoAsig.rows[0].fecha;
          }
        }
      }

      if (!finalAsignacionId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ mensaje: 'Debe seleccionar una asignacion para atender el reporte.' });
      }

      if (finalAsignacionId) {
        const asignacionValida = await client.query(
          `SELECT estado, fecha
           FROM asignaciones_semanales
           WHERE id = $1`,
          [finalAsignacionId]
        );

        if (asignacionValida.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ mensaje: 'La asignacion seleccionada no existe.' });
        }

        const destino = asignacionValida.rows[0];
        if (!['pendiente', 'activa'].includes(destino.estado)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ mensaje: 'No se puede asignar un reporte a una ruta cerrada.' });
        }

        // Comparacion de cadenas 'YYYY-MM-DD': new Date('2026-08-19') se
        // interpreta como medianoche UTC y el `date` de la asignacion como
        // medianoche local, de modo que la comparacion dependia de la zona del
        // servidor y podia aceptar una ruta de ayer o rechazar la de hoy.
        if (aFechaISO(destino.fecha) < getFechaColombia()) {
          await client.query('ROLLBACK');
          return res.status(400).json({ mensaje: 'No se puede asignar un reporte a una ruta pasada.' });
        }
      }

      // targetFecha es un `date` de PostgreSQL, es decir un objeto Date. Al
      // interpolarlo en la plantilla se convertía con toString() y el ciudadano
      // terminaba leyendo 'Thu Aug 27 2026 00:00:00 GMT-0500 (hora estándar de
      // Colombia)'. Aquí se escribe la fecha en español y sin hora, que es lo
      // único que necesita saber: el día que pasa el carro.
      //
      // El texto no repite "programado para recolección": ya lo dice el
      // encabezado bajo el que se muestra, tanto en la ficha del administrador
      // ("Detalle de agenda:") como en la tarjeta del ciudadano
      // ("Programado para recolección:"). Aquí van sólo la ruta y el día.
      const fechaLegible = formatearFechaLarga(targetFecha || fecha_programada);
      const ruta = targetRutaNombre || 'Ruta asignada';
      const msjAceptado = fechaLegible
        ? `${ruta} · ${fechaLegible}`
        : `${ruta} · dentro de las próximas 48 horas`;
      
      resultado = await client.query(
        `UPDATE reportes_ciudadanos 
         SET estado = $1, asignacion_id = $2, justificacion_rechazo = $4, atendido_at = NOW()
         WHERE id = $3 RETURNING *`,
        [estado, finalAsignacionId, id, msjAceptado]
      );
    } else if (estado === 'rechazado') {
      resultado = await client.query(
        `UPDATE reportes_ciudadanos 
         SET estado = 'rechazado', justificacion_rechazo = $1
         WHERE id = $2 RETURNING *`,
        [justificacion_rechazo || null, id]
      );
    } else {
      resultado = await client.query(
        `UPDATE reportes_ciudadanos SET estado = $1 WHERE id = $2 RETURNING *`,
        [estado, id]
      );
    }

    if (resultado.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ mensaje: 'Reporte no encontrado.' });
    }

    await client.query('COMMIT');

    // Emitir por Socket.io en tiempo real
    emitirReporteActualizado(resultado.rows[0]);

    if ((estado === 'en_proceso' || estado === 'atendido' || estado === 'resuelto') && finalAsignacionId) {
      await notificarConductorReporteAsignado(finalAsignacionId, resultado.rows[0])
        .catch(notiErr => console.error('Error al notificar conductor:', notiErr.message));
    }

    res.status(200).json({ mensaje: 'Estado de reporte actualizado.', reporte: resultado.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar estado del reporte:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  } finally {
    client.release();
  }
};

const obtenerMisReportes = async (req, res) => {
  const ciudadanoId = req.usuario.id;
  try {
    const resultado = await pool.query(
      `SELECT * FROM reportes_ciudadanos WHERE ciudadano_id = $1 ORDER BY created_at DESC`,
      [ciudadanoId]
    );
    res.status(200).json({ reportes: resultado.rows });
  } catch (error) {
    console.error('Error al obtener mis reportes:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

module.exports = { crearReporte, obtenerReportes, obtenerMisReportes, actualizarEstado };
