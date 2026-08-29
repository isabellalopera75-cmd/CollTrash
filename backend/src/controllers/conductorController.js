const pool = require('../config/database');
const { startSimulation, stopSimulation } = require('../services/simuladorService');
const { crearNotificacion } = require('../services/notificacionService');
const { solicitarRefrescoEficiencia } = require('../services/eficienciaService');
const {
  getFechaColombia, getMinutosDelDiaColombia, horaAMinutos, aFechaISO
} = require('../utils/dateUtils');

const obtenerAsignacionConductor = async (asignacionId, conductorId) => {
  const resultado = await pool.query(
    'SELECT a.*, rf.nombre as ruta_nombre FROM asignaciones_semanales a JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id WHERE a.id = $1 AND a.conductor_id = $2',
    [asignacionId, conductorId]
  );
  return resultado.rows[0] || null;
};

const exigirAsignacionActiva = (asignacion) => {
  if (!asignacion) {
    return { status: 403, mensaje: 'No autorizado. Esta asignacion no le pertenece.' };
  }
  if (asignacion.estado !== 'activa') {
    return { status: 400, mensaje: 'La ruta debe estar activa para realizar esta accion.' };
  }
  return null;
};


// Iniciar ruta
const iniciarRuta = async (req, res) => {
  const { id } = req.params;
  const conductorId = req.usuario.id;

  try {
    const asignacion = await pool.query(
      'SELECT a.*, rf.nombre as ruta_nombre FROM asignaciones_semanales a JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id WHERE a.id = $1 AND a.conductor_id = $2',
      [id, conductorId]
    );

    if (asignacion.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Asignación no encontrada.' });
    }

    const a = asignacion.rows[0];

    if (a.estado !== 'pendiente') {
      return res.status(400).json({ mensaje: 'La ruta no está en estado pendiente.' });
    }

    // Una asignación sólo puede iniciarse el día que le corresponde. Sin esta
    // comprobación los horarios se evaluaban contra el reloj de hoy sin mirar
    // a.fecha, de modo que la ruta de mañana podía iniciarse hoy.
    if (aFechaISO(a.fecha) !== getFechaColombia()) {
      return res.status(400).json({
        mensaje: 'Esta ruta corresponde a otra fecha y no puede iniciarse hoy.'
      });
    }

    const { justificacion } = req.body;
    const jornada = await pool.query(
      'SELECT j.* FROM jornadas j JOIN rutas_fijas rf ON rf.jornada_id = j.id WHERE rf.id = $1',
      [a.ruta_fija_id]
    );

    const j = jornada.rows[0];
    if (!j) {
      return res.status(409).json({ mensaje: 'La ruta no tiene una jornada configurada. Avise al administrador.' });
    }

    // Todos los cálculos se hacen en minutos desde medianoche en hora de
    // Colombia, para no depender de la zona horaria del servidor.
    const ahoraMin = getMinutosDelDiaColombia();
    const inicioMin = horaAMinutos(j.hora_inicio);
    const finMin = horaAMinutos(j.hora_limite_fin);

    const diffMinutos = ahoraMin - inicioMin;
    const inicioTardio = diffMinutos > j.margen_tardio_min;

    // RF-03.3: el bloqueo usa el margen de no asistencia configurado en la
    // jornada. Antes estaba fijado a 60 minutos en el código, ignorando por
    // completo el valor de jornadas.margen_no_asistido_min.
    const bloqueoTotal = diffMinutos > j.margen_no_asistido_min;

    // REGLA 1: pasada la hora de fin de la jornada no se puede iniciar, salvo
    // que el administrador lo haya habilitado expresamente.
    //
    // La excepción es necesaria para el relevo por incidencia: si el accidente
    // ocurre cerca del cierre, el conductor de reemplazo llega después de
    // hora_limite_fin y sin esta salida quedaría bloqueado de forma permanente,
    // que es justamente el caso para el que existe la función. habilitado_por_admin
    // sólo se activa por una acción explícita del administrador (RF-03.3).
    if (finMin !== null && ahoraMin > finMin && !a.habilitado_por_admin) {
      return res.status(403).json({
        bloqueado: true,
        mensaje: '❌ JORNADA EXPIRADA: Esta ruta ya superó su horario de finalización. No es posible iniciarla.'
      });
    }

    // REGLA 2: Si se superó el margen de no asistencia y el admin no lo habilitó, BLOQUEAR
    if (bloqueoTotal && !a.habilitado_por_admin) {
      // NOTIFICAR ADMIN: Intento de inicio bloqueado
      await crearNotificacion({
        titulo: 'Inicio bloqueado por retraso',
        mensaje: `El conductor ${req.usuario.nombre} intentó iniciar la ruta "${a.ruta_nombre}" con ${Math.round(diffMinutos)} minutos de retraso (margen permitido: ${j.margen_no_asistido_min}). Se requiere tu autorización manual.`,
        tipo: 'urgente',
        metadata: { asignacion_id: id, tipo: 'BLOQUEO_INICIO' }
      });

      return res.status(403).json({ 
        bloqueado: true,
        mensaje: `❌ TIEMPO LÍMITE EXCEDIDO: Has superado el tiempo permitido para iniciar la ruta (${j.margen_no_asistido_min} minutos). Contacta al administrador para que habilite tu inicio manualmente.` 
      });
    }

    // Si es tarde (dentro del margen o ya habilitado) y no hay justificación, pedirla
    if (inicioTardio && !justificacion && !a.habilitado_por_admin) {
      return res.status(200).json({ 
        requiere_justificacion: true, 
        mensaje: 'Estás iniciando fuera de tu horario habitual. Por favor, indica el motivo.' 
      });
    }

    const asigId = parseInt(id);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Se vuelve a comprobar el estado bloqueando la fila. La verificación
      // previa se hizo fuera de la transacción, así que dos peticiones
      // simultáneas (doble toque en el móvil) la superaban ambas y arrancaban
      // la ruta dos veces, duplicando novedades y notificaciones.
      const bloqueo = await client.query(
        `SELECT estado FROM asignaciones_semanales WHERE id = $1 AND conductor_id = $2 FOR UPDATE`,
        [asigId, conductorId]
      );

      if (bloqueo.rows.length === 0 || bloqueo.rows[0].estado !== 'pendiente') {
        await client.query('ROLLBACK');
        client.release();
        return res.status(409).json({ mensaje: 'La ruta ya fue iniciada.' });
      }

      await client.query(
        `UPDATE asignaciones_semanales
         SET estado = 'activa', hora_inicio_real = NOW(), inicio_tardio = $1, justificacion_tardio = $2
         WHERE id = $3`,
        [inicioTardio, justificacion || null, asigId]
      );

      if (inicioTardio && justificacion) {
        await client.query(
          `INSERT INTO novedades_operativas (asignacion_id, admin_id, tipo_novedad, descripcion)
           VALUES ($1, NULL, $2, $3)`,
          [asigId, 'REPORTE_CONDUCTOR_TARDIO', justificacion]
        );
      }


      // Activar el primer sector PENDIENTE, no el primero en orden.
      //
      // Tras un relevo por incidencia la asignacion vuelve a 'pendiente' con
      // parte del recorrido ya hecho. Al filtrar solo por orden, el arranque
      // del conductor de reemplazo devolvia el sector 1 -- ya completado -- a
      // 'en_progreso': se perdia el avance y la ruta no se podia cerrar hasta
      // rehacerlo. El NOT EXISTS evita ademas dejar dos sectores en curso a la
      // vez cuando uno ya venia activo.
      await client.query(
        `UPDATE sectores_asignacion SET estado = 'en_progreso'
         WHERE asignacion_id = $1
           AND sector_id = (
             SELECT sa.sector_id
             FROM sectores_asignacion sa
             JOIN sectores_ruta sr ON sr.id = sa.sector_id
             WHERE sa.asignacion_id = $1 AND sa.estado = 'pendiente'
             ORDER BY sr.orden ASC LIMIT 1
           )
           AND NOT EXISTS (
             SELECT 1 FROM sectores_asignacion s2
             WHERE s2.asignacion_id = $1 AND s2.estado = 'en_progreso'
           )`,
        [asigId]
      );

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    // NOTIFICAR ADMIN: Inicio de ruta
    // El motivo del retraso viaja en el propio aviso. Sin él, el administrador
    // sólo veía "inicio fuera de horario" y tenía que ir a buscar la
    // justificación a otra pantalla, cuando es justo el dato que necesita en
    // ese momento (RF-26).
    const detalleTardanza = inicioTardio
      ? ` Inició con ${Math.round(diffMinutos)} min de retraso.${justificacion ? ` Motivo: "${justificacion}"` : ''}`
      : '';

    await crearNotificacion({
      titulo: inicioTardio ? 'Inicio tardío' : 'Ruta iniciada',
      mensaje: `El conductor ${req.usuario.nombre || 'Conductor'} ha iniciado la ruta "${a.ruta_nombre || 'Sin nombre'}".${detalleTardanza}`,
      tipo: inicioTardio ? 'urgente' : 'operativo',
      metadata: { asignacion_id: asigId, tipo: 'INICIO_RUTA', inicio_tardio: inicioTardio, justificacion: justificacion || null }
    });

    // Iniciar el simulador en el backend
    console.log('🔄 Llamando startSimulation...');
    startSimulation(asigId);

    res.status(200).json({
      mensaje: inicioTardio ? 'Ruta iniciada con inicio tardío.' : 'Ruta iniciada correctamente.',
      inicio_tardio: inicioTardio
    });

  } catch (error) {
    // El detalle del fallo queda en el log del servidor. Devolverlo al cliente
    // exponía la traza completa, con rutas de archivos y estructura interna.
    console.error('❌ ERROR CRÍTICO en iniciarRuta:', error);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Actualizar progreso de sector
const actualizarSector = async (req, res) => {
  const { id, sectorId } = req.params;
  const { porcentaje_recorrido } = req.body;
  const conductorId = req.usuario.id;

  try {
    const asignacion = await obtenerAsignacionConductor(id, conductorId);
    const errorAsignacion = exigirAsignacionActiva(asignacion);
    if (errorAsignacion) {
      return res.status(errorAsignacion.status).json({ mensaje: errorAsignacion.mensaje });
    }

    const porcentaje = Number(porcentaje_recorrido);
    if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
      return res.status(400).json({ mensaje: 'El porcentaje recorrido debe estar entre 0 y 100.' });
    }

    const completado = porcentaje >= 90;

    await pool.query(
      `UPDATE sectores_asignacion 
       SET porcentaje_recorrido = $1,
           estado = $2,
           completado_at = $3
       WHERE asignacion_id = $4 AND sector_id = $5`,
      [
        porcentaje,
        completado ? 'completado' : 'en_progreso',
        completado ? new Date() : null,
        id, sectorId
      ]
    );

    if (completado) {
      // Activar siguiente sector
      await pool.query(
        `UPDATE sectores_asignacion SET estado = 'en_progreso'
         WHERE asignacion_id = $1 AND sector_id = (
           SELECT sr.id FROM sectores_ruta sr
           JOIN sectores_asignacion sa ON sa.sector_id = sr.id
           WHERE sa.asignacion_id = $1 AND sa.estado = 'pendiente'
           ORDER BY sr.orden ASC LIMIT 1
         )`,
        [id]
      );
    }

    res.status(200).json({ mensaje: 'Sector actualizado.', completado });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Registrar descarga
const registrarDescarga = async (req, res) => {
  const { id } = req.params;
  const { sector_asignacion_id, punto_pausa_lat, punto_pausa_lng, punto_descarga_id } = req.body;
  const conductorId = req.usuario.id;

  try {
    const asignacion = await obtenerAsignacionConductor(id, conductorId);
    const errorAsignacion = exigirAsignacionActiva(asignacion);
    if (errorAsignacion) {
      return res.status(errorAsignacion.status).json({ mensaje: errorAsignacion.mensaje });
    }

    // Validar botadero activo
    const landfill = await pool.query(
      'SELECT id FROM puntos_descarga WHERE id = $1 AND activo = true',
      [punto_descarga_id]
    );
    if (landfill.rows.length === 0) {
      return res.status(400).json({ mensaje: 'El botadero seleccionado no existe o no está activo.' });
    }

    // Una sola pausa abierta a la vez. El simulador sigue la ultima descarga
    // registrada, de modo que una segunda pausa dejaba la anterior abierta para
    // siempre: sin hora de regreso, sin toneladas y reteniendo el avance.
    const pausaAbierta = await pool.query(
      'SELECT id FROM descargas WHERE asignacion_id = $1 AND hora_regreso IS NULL LIMIT 1',
      [id]
    );
    if (pausaAbierta.rows.length > 0) {
      return res.status(409).json({
        mensaje: 'Ya hay una pausa de descarga en curso. Complétala antes de iniciar otra.',
        descarga_id: pausaAbierta.rows[0].id
      });
    }

    let insertResult;
    try {
      insertResult = await pool.query(
        `INSERT INTO descargas 
         (asignacion_id, sector_asignacion_id, punto_pausa_lat, punto_pausa_lng, punto_descarga_id, toneladas, hora_salida)
         VALUES ($1, $2, $3, $4, $5, 0, NOW()) RETURNING id`,
        [id, sector_asignacion_id, punto_pausa_lat, punto_pausa_lng, punto_descarga_id]
      );
    } catch (errInsert) {
      // uq_descarga_abierta_por_asignacion (migracion 015): cierra la ventana
      // entre la consulta anterior y este INSERT, que dos toques simultaneos
      // atravesaban a la vez.
      if (errInsert.code === '23505') {
        return res.status(409).json({ mensaje: 'Ya hay una pausa de descarga en curso. Complétala antes de iniciar otra.' });
      }
      throw errInsert;
    }

    const descargaId = insertResult.rows[0].id;

    const resultado = await pool.query(
      `SELECT d.*, pd.latitud_centro, pd.longitud_centro, pd.nombre as punto_descarga_nombre
       FROM descargas d
       JOIN puntos_descarga pd ON pd.id = d.punto_descarga_id
       WHERE d.id = $1`,
      [descargaId]
    );

    // NOTIFICACIÓN AUTOMÁTICA DE INICIO DE DESCARGA
    await crearNotificacion({
      usuario_id: null, // Global para todos los admins
      titulo: 'Pausa de descarga',
      mensaje: `El conductor ${req.usuario.nombre} se dirige a descargar en "${resultado.rows[0].punto_descarga_nombre}". Ruta pausada temporalmente.`,
      tipo: 'operativo',
      metadata: { 
        asignacion_id: parseInt(id), 
        descarga_id: resultado.rows[0].id,
        punto_descarga_id: parseInt(punto_descarga_id),
        tipo: 'INICIO_DESCARGA' 
      }
    });

    res.status(201).json({ mensaje: 'Descarga registrada e inicio de pausa.', descarga: resultado.rows[0] });
  } catch (error) {
    console.error('Error al registrar descarga:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Completar descarga
const completarDescarga = async (req, res) => {
  const { id, descargaId } = req.params;
  const { toneladas } = req.body;
  const conductorId = req.usuario.id;

  try {
    const asignacion = await obtenerAsignacionConductor(id, conductorId);
    const errorAsignacion = exigirAsignacionActiva(asignacion);
    if (errorAsignacion) {
      return res.status(errorAsignacion.status).json({ mensaje: errorAsignacion.mensaje });
    }

    const toneladasDescargadas = Number(toneladas);
    if (!Number.isFinite(toneladasDescargadas) || toneladasDescargadas < 0) {
      return res.status(400).json({ mensaje: 'Las toneladas deben ser un número válido mayor o igual a 0.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Completar la descarga actual registrando hora de regreso y toneladas
      const updateDescarga = await client.query(
        'UPDATE descargas SET hora_regreso = NOW(), toneladas = $1 WHERE id = $2 AND asignacion_id = $3 RETURNING *',
        [toneladasDescargadas, descargaId, id]
      );

      if (updateDescarga.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ mensaje: 'Registro de descarga no encontrado.' });
      }

      // REACTIVAR SECTOR SI ESTABA COMPLETADO
      const sectorAsigId = updateDescarga.rows[0].sector_asignacion_id;
      await client.query(
        `UPDATE sectores_asignacion 
         SET estado = 'en_progreso'
         WHERE id = $1 AND estado = 'completado'`,
        [sectorAsigId]
      );

      // 2. Sumar el total de descargas registradas en esta asignación y actualizar asignaciones_semanales
      await client.query(
        `UPDATE asignaciones_semanales 
         SET toneladas = (
           SELECT COALESCE(SUM(toneladas), 0) 
           FROM descargas 
           WHERE asignacion_id = $1 AND hora_regreso IS NOT NULL
         )
         WHERE id = $1`,
        [id]
      );

      await client.query('COMMIT');
      client.release();

      // NOTIFICACIÓN AUTOMÁTICA DE RETORNO Y TONELADAS
      await crearNotificacion({
        usuario_id: null,
        titulo: 'Descarga completada',
        mensaje: `El conductor ${req.usuario.nombre} completó la descarga de ${toneladasDescargadas} ton. Retomando la ruta.`,
        tipo: 'operativo',
        metadata: { 
          asignacion_id: parseInt(id), 
          descarga_id: parseInt(descargaId),
          toneladas: toneladasDescargadas,
          tipo: 'FIN_DESCARGA' 
        }
      });

      res.status(200).json({ mensaje: 'Descarga completada. Sector reactivado.', descarga: updateDescarga.rows[0] });
    } catch (txError) {
      await client.query('ROLLBACK');
      client.release();
      throw txError;
    }
  } catch (error) {
    console.error('Error al completar descarga:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const obtenerDescarga = async (req, res) => {
  const { id, descargaId } = req.params;
  const conductorId = req.usuario.id;
  try {
    const asignacion = await obtenerAsignacionConductor(id, conductorId);
    const errorAsignacion = exigirAsignacionActiva(asignacion);
    if (errorAsignacion) {
      return res.status(errorAsignacion.status).json({ mensaje: errorAsignacion.mensaje });
    }
    const resultado = await pool.query(
      `SELECT d.*, pd.latitud_centro, pd.longitud_centro, pd.nombre as punto_descarga_nombre
       FROM descargas d
       JOIN puntos_descarga pd ON pd.id = d.punto_descarga_id
       WHERE d.id = $1 AND d.asignacion_id = $2`,
      [descargaId, id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Descarga no encontrada.' });
    }
    res.status(200).json({ descarga: resultado.rows[0] });
  } catch (error) {
    console.error('Error al obtener descarga:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Registrar GPS
const registrarGPS = async (req, res) => {
  const { id } = req.params;
  const { latitud, longitud } = req.body;
  const conductorId = req.usuario.id;

  try {
    const asignacion = await obtenerAsignacionConductor(id, conductorId);
    const errorAsignacion = exigirAsignacionActiva(asignacion);
    if (errorAsignacion) {
      return res.status(errorAsignacion.status).json({ mensaje: errorAsignacion.mensaje });
    }

    const lat = Number(latitud);
    const lng = Number(longitud);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ mensaje: 'Coordenadas GPS invalidas.' });
    }

    await pool.query(
      'INSERT INTO rastreo_gps (asignacion_id, latitud, longitud) VALUES ($1, $2, $3)',
      [id, lat, lng]
    );

    res.status(201).json({ mensaje: 'GPS registrado.' });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Finalizar ruta
const finalizarRuta = async (req, res) => {
  const { id } = req.params;
  const { toneladas } = req.body;
  const conductorId = req.usuario.id;

  try {
    const toneladasNumero = Number(toneladas);
    if (!Number.isFinite(toneladasNumero) || toneladasNumero < 0) {
      return res.status(400).json({ mensaje: 'Las toneladas recolectadas son obligatorias y deben ser válidas.' });
    }

    const esDelConductor = await pool.query(
      'SELECT 1 FROM asignaciones_semanales WHERE id = $1 AND conductor_id = $2',
      [id, conductorId]
    );
    if (esDelConductor.rows.length === 0) {
      return res.status(403).json({ mensaje: 'No autorizado. Esta asignación no le pertenece.' });
    }

    // Verificar que todos los sectores estén completados
    const sectoresPendientes = await pool.query(
      `SELECT COUNT(*) FROM sectores_asignacion 
       WHERE asignacion_id = $1 AND estado != 'completado'`,
      [id]
    );

    if (parseInt(sectoresPendientes.rows[0].count) > 0) {
      return res.status(400).json({ mensaje: 'Aún hay sectores pendientes por completar.' });
    }

    const reportesPendientes = await pool.query(
      `SELECT COUNT(*) FROM reportes_ciudadanos
       WHERE asignacion_id = $1 AND estado = 'en_proceso'`,
      [id]
    );

    if (parseInt(reportesPendientes.rows[0].count) > 0) {
      return res.status(400).json({ mensaje: 'Aun hay reportes ciudadanos asignados sin resolver.' });
    }

    // Iniciar transacción para evitar Race Conditions
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verificar que no haya sido completada por el simulador simultáneamente
      const checkEstado = await client.query(
        'SELECT a.estado, a.hora_inicio_real FROM asignaciones_semanales a JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id WHERE a.id = $1 AND a.conductor_id = $2 FOR UPDATE',
        [id, conductorId]
      );

      if (checkEstado.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(403).json({ mensaje: 'No autorizado. Esta asignacion no le pertenece.' });
      }

      if (checkEstado.rows[0].estado !== 'activa') {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ mensaje: 'Solo se puede finalizar una ruta activa.' });
      }

      if (!checkEstado.rows[0].hora_inicio_real) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ mensaje: 'La ruta no tiene hora de inicio registrada.' });
      }

      // Finalizar asignación (ACUMULA TONELADAS DE DESCARGAS Y SUMA EL MANUAL)
      await client.query(
        `UPDATE asignaciones_semanales 
         SET estado = 'completada', hora_fin_real = NOW(),
             toneladas = (
               SELECT COALESCE(SUM(toneladas), 0) 
               FROM descargas 
               WHERE asignacion_id = $1 AND hora_regreso IS NOT NULL
             ) + $3
         WHERE id = $1 AND conductor_id = $2`,
        [id, conductorId, toneladasNumero]
      );

      // Calcular eficiencia (INCLUYE VEHICULO_ID EN LA CONSULTA)
      const asignacion = await client.query(
        'SELECT a.*, rf.nombre as ruta_nombre, rf.vehiculo_id FROM asignaciones_semanales a JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id WHERE a.id = $1',
        [id]
      );
      const a = asignacion.rows[0];


      const sectoresTotal = await client.query(
        'SELECT COUNT(*) FROM sectores_asignacion WHERE asignacion_id = $1',
        [id]
      );
      const sectoresCompletados = await client.query(
        `SELECT COUNT(*) FROM sectores_asignacion WHERE asignacion_id = $1 AND estado = 'completado'`,
        [id]
      );


      const total = parseInt(sectoresTotal.rows[0].count);
      const completados = parseInt(sectoresCompletados.rows[0].count);
      const porcentaje = total > 0 ? Math.round((completados / total) * 100) : 0;



      await client.query('COMMIT');
      client.release();

      // DETENER SIMULACIÓN Y EMITIR WEBSOCKET AL ADMIN
      stopSimulation(parseInt(id));

      // RF-04.4 (retirar el marcador) y RF-09.4 (refrescar métricas): ambos
      // consumidores son el panel del administrador.
      const { emitirAdmins } = require('../config/socket');
      emitirAdmins('ruta_finalizada', {
        asignacion_id: parseInt(id),
        vehiculo_id: a.vehiculo_id
      });

      // Refresco agrupado de la vista de eficiencia. Antes se ejecutaba aquí de
      // forma síncrona, recalculando la vista entera y reteniendo una conexión
      // del pool en cada cierre de ruta.
      solicitarRefrescoEficiencia();

      // NOTIFICAR ADMIN: Fin de ruta
      await crearNotificacion({
        titulo: 'Ruta finalizada',
        mensaje: `La ruta "${a.ruta_nombre || 'Sin nombre'}" ha sido completada con un ${porcentaje}% de cumplimiento.`,
        tipo: 'operativo',
        metadata: { asignacion_id: id, tipo: 'FIN_RUTA' }
      });

      res.status(200).json({ mensaje: 'Ruta finalizada exitosamente.', porcentaje_cumplimiento: porcentaje });
    } catch (err) {
      await client.query('ROLLBACK');
      client.release();
      throw err;
    }
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

module.exports = {
  iniciarRuta, actualizarSector,
  registrarDescarga, completarDescarga, obtenerDescarga,
  registrarGPS, finalizarRuta
};
