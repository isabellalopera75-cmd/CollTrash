const pool = require('../config/database');
const { crearNotificacion } = require('../services/notificacionService');
const { getIo } = require('../config/socket');
require('dotenv').config();

const notificarConductorReporteAsignado = async (asignacionId, reporte) => {
  if (!asignacionId || !reporte) return;

  const asignacionRes = await pool.query(
    `SELECT rf.conductor_default_id AS conductor_id, rf.nombre AS ruta_nombre, a.fecha
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
  
  const ciudadanoId = req.usuario ? req.usuario.id : null;
  // Construir URL de la foto si se subió un archivo
  const foto_url = req.file ? `/uploads/reportes/${req.file.filename}` : null;
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
      titulo: '👥 Reporte Ciudadano',
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
       LEFT JOIN ciudadanos c ON c.id = r.ciudadano_id
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

const atenderReporte = async (req, res) => {
  const { id } = req.params;
  const { asignacion_id } = req.body;

  try {
    if (!asignacion_id) {
      return res.status(400).json({ mensaje: 'Debe seleccionar una asignacion para atender el reporte.' });
    }

    const asignacionValida = await pool.query(
      `SELECT estado, fecha
       FROM asignaciones_semanales
       WHERE id = $1`,
      [asignacion_id]
    );

    if (asignacionValida.rows.length === 0) {
      return res.status(400).json({ mensaje: 'La asignacion seleccionada no existe.' });
    }

    const destino = asignacionValida.rows[0];
    if (!['pendiente', 'activa'].includes(destino.estado)) {
      return res.status(400).json({ mensaje: 'No se puede asignar un reporte a una ruta cerrada.' });
    }

    if (new Date(destino.fecha) < new Date(new Date().toISOString().split('T')[0])) {
      return res.status(400).json({ mensaje: 'No se puede asignar un reporte a una ruta pasada.' });
    }

    const reporte = await pool.query(
      `UPDATE reportes_ciudadanos SET estado = 'en_proceso', asignacion_id = $1, atendido_at = NOW()
       WHERE id = $2 RETURNING *`,
      [asignacion_id, id]
    );

    if (reporte.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Reporte no encontrado.' });
    }

    // Emitir por Socket.io en tiempo real
    const io = getIo();
    if (io) {
      io.emit('reporte_actualizado', reporte.rows[0]);
    }

    await notificarConductorReporteAsignado(asignacion_id, reporte.rows[0])
      .catch(notiErr => console.error('Error al notificar conductor:', notiErr.message));

    res.status(200).json({ mensaje: 'Reporte atendido correctamente.' });
  } catch (error) {
    console.error('Error al atender:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const rechazarReporte = async (req, res) => {
  const { id } = req.params;
  const { justificacion } = req.body;

  try {
    const resultado = await pool.query(
      `UPDATE reportes_ciudadanos SET estado = 'rechazado', justificacion_rechazo = $1 WHERE id = $2 RETURNING *`,
      [justificacion, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Reporte no encontrado.' });
    }

    // Emitir por Socket.io en tiempo real
    const io = getIo();
    if (io) {
      io.emit('reporte_actualizado', resultado.rows[0]);
    }

    res.status(200).json({ mensaje: 'Reporte rechazado.', reporte: resultado.rows[0] });
  } catch (error) {
    console.error('Error al rechazar reporte:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const actualizarEstado = async (req, res) => {
  const { id } = req.params;
  const { estado, justificacion_rechazo, ruta_id, asignacion_id, asignacion_semanal_id, fecha_programada } = req.body;

  const targetId = asignacion_id || asignacion_semanal_id || ruta_id;

  try {
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
          const infoRuta = await pool.query('SELECT nombre, conductor_default_id, vehiculo_id FROM rutas_fijas WHERE id = $1', [rutaFijaId]);
          if (infoRuta.rows.length > 0) {
            targetRutaNombre = infoRuta.rows[0].nombre;
            
            // Buscar si ya existe la asignación para esta ruta y fecha
            let asignacionRes = await pool.query(
              'SELECT id FROM asignaciones_semanales WHERE ruta_fija_id = $1 AND fecha = $2',
              [rutaFijaId, targetFecha]
            );

            if (asignacionRes.rows.length > 0) {
              finalAsignacionId = asignacionRes.rows[0].id;
            } else {
              // Si no existe, la creamos dinámicamente para ese día
              const insertRes = await pool.query(
                `INSERT INTO asignaciones_semanales (ruta_fija_id, fecha, estado)
                 VALUES ($1, $2, 'pendiente') RETURNING id`,
                [rutaFijaId, targetFecha]
              );
              finalAsignacionId = insertRes.rows[0].id;

              // Vincular los sectores de la ruta a la nueva asignación
              await pool.query(
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
          const infoAsig = await pool.query(
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
        return res.status(400).json({ mensaje: 'Debe seleccionar una asignacion para atender el reporte.' });
      }

      if (finalAsignacionId) {
        const asignacionValida = await pool.query(
          `SELECT estado, fecha
           FROM asignaciones_semanales
           WHERE id = $1`,
          [finalAsignacionId]
        );

        if (asignacionValida.rows.length === 0) {
          return res.status(400).json({ mensaje: 'La asignacion seleccionada no existe.' });
        }

        const destino = asignacionValida.rows[0];
        if (!['pendiente', 'activa'].includes(destino.estado)) {
          return res.status(400).json({ mensaje: 'No se puede asignar un reporte a una ruta cerrada.' });
        }

        if (new Date(destino.fecha) < new Date(new Date().toISOString().split('T')[0])) {
          return res.status(400).json({ mensaje: 'No se puede asignar un reporte a una ruta pasada.' });
        }
      }

      const msjAceptado = `Programado para recolección en la ruta: ${targetRutaNombre || 'asignada'} (${targetFecha || fecha_programada || 'Próximas 48h'})`;
      
      resultado = await pool.query(
        `UPDATE reportes_ciudadanos 
         SET estado = $1, asignacion_id = $2, justificacion_rechazo = $4, atendido_at = NOW()
         WHERE id = $3 RETURNING *`,
        [estado, finalAsignacionId, id, msjAceptado]
      );
    } else if (estado === 'rechazado') {
      resultado = await pool.query(
        `UPDATE reportes_ciudadanos 
         SET estado = 'rechazado', justificacion_rechazo = $1
         WHERE id = $2 RETURNING *`,
        [justificacion_rechazo || null, id]
      );
    } else {
      resultado = await pool.query(
        `UPDATE reportes_ciudadanos SET estado = $1 WHERE id = $2 RETURNING *`,
        [estado, id]
      );
    }

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Reporte no encontrado.' });
    }

    // Emitir por Socket.io en tiempo real
    const io = getIo();
    if (io) {
      io.emit('reporte_actualizado', resultado.rows[0]);
    }

    if ((estado === 'en_proceso' || estado === 'atendido' || estado === 'resuelto') && finalAsignacionId) {
      await notificarConductorReporteAsignado(finalAsignacionId, resultado.rows[0])
        .catch(notiErr => console.error('Error al notificar conductor:', notiErr.message));
    }

    res.status(200).json({ mensaje: 'Estado de reporte actualizado.', reporte: resultado.rows[0] });
  } catch (error) {
    console.error('Error al actualizar estado del reporte:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
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

module.exports = { crearReporte, obtenerReportes, atenderReporte, rechazarReporte, obtenerMisReportes, actualizarEstado };
