const pool = require('../config/database');
const { startSimulation } = require('../services/simuladorService');
const { crearNotificacion } = require('../services/notificacionService');

// Conductor ve sus rutas de la semana
const misRutas = async (req, res) => {
  const conductorId = req.usuario.id;

  try {
    const hoy = new Date();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - hoy.getDay() + 1);
    const sabado = new Date(lunes);
    sabado.setDate(lunes.getDate() + 5);

    const resultado = await pool.query(
      `SELECT a.*, rf.nombre AS ruta_nombre,
              j.nombre AS jornada_nombre,
              j.hora_inicio, j.hora_limite_fin,
              v.placa, a.habilitado_por_admin
       FROM asignaciones_semanales a
       JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id
       JOIN jornadas j ON j.id = rf.jornada_id
       JOIN vehiculos v ON v.id = a.vehiculo_id
       WHERE a.conductor_id = $1
       AND a.fecha BETWEEN $2 AND $3
       ORDER BY a.fecha ASC`,
      [conductorId, lunes.toISOString().split('T')[0], sabado.toISOString().split('T')[0]]
    );

    res.status(200).json({ rutas: resultado.rows });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Iniciar ruta
const iniciarRuta = async (req, res) => {
  const { id } = req.params;
  const conductorId = req.usuario.id;

  try {
    const asignacion = await pool.query(
      'SELECT * FROM asignaciones_semanales WHERE id = $1 AND conductor_id = $2',
      [id, conductorId]
    );

    if (asignacion.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Asignación no encontrada.' });
    }

    const a = asignacion.rows[0];

    if (a.estado !== 'pendiente') {
      return res.status(400).json({ mensaje: 'La ruta no está en estado pendiente.' });
    }

    const { justificacion } = req.body;
    const ahora = new Date();
    const jornada = await pool.query(
      'SELECT j.* FROM jornadas j JOIN rutas_fijas rf ON rf.jornada_id = j.id WHERE rf.id = $1',
      [a.ruta_fija_id]
    );

    const j = jornada.rows[0];
    const [h, m] = j.hora_inicio.split(':');
    const horaInicio = new Date();
    horaInicio.setHours(parseInt(h), parseInt(m), 0);

    const diffMinutos = (ahora - horaInicio) / 60000;
    const inicioTardio = diffMinutos > j.margen_tardio_min;
    const bloqueoTotal = diffMinutos > 60; // 1 hora de retraso

    const [hf, mf] = j.hora_limite_fin.split(':');
    const horaFin = new Date();
    horaFin.setHours(parseInt(hf), parseInt(mf), 0);

    // REGLA 1: Si ya pasó la hora de FIN de la jornada, NO SE PUEDE INICIAR
    if (ahora > horaFin) {
      return res.status(403).json({ 
        bloqueado: true,
        mensaje: '❌ JORNADA EXPIRADA: Esta ruta ya superó su horario de finalización. No es posible iniciarla.' 
      });
    }

    // REGLA 2: Si pasó más de 1 hora y NO ha sido habilitado por admin, BLOQUEAR
    if (bloqueoTotal && !a.habilitado_por_admin) {
      // NOTIFICAR ADMIN: Intento de inicio bloqueado
      await crearNotificacion({
        titulo: '🚨 Inicio Bloqueado (Muy Tarde)',
        mensaje: `El conductor ${req.usuario.nombre} intentó iniciar la ruta "${a.ruta_nombre}" con más de 1 hora de retraso. Se requiere tu autorización manual.`,
        tipo: 'urgente',
        metadata: { asignacion_id: id, tipo: 'BLOQUEO_INICIO' }
      });

      return res.status(403).json({ 
        bloqueado: true,
        mensaje: '❌ TIEMPO LÍMITE EXCEDIDO: Has superado el tiempo permitido para iniciar la ruta (1 hora). Contacta al administrador para que habilite tu inicio manualmente.' 
      });
    }

    // Si es tarde (pero menos de 1h o ya habilitado) y no hay justificación, pedirla
    if (inicioTardio && !justificacion && !a.habilitado_por_admin) {
      return res.status(200).json({ 
        requiere_justificacion: true, 
        mensaje: 'Estás iniciando fuera de tu horario habitual. Por favor, indica el motivo.' 
      });
    }

    const asigId = parseInt(id);

    await pool.query(
      `UPDATE asignaciones_semanales 
       SET estado = 'activa', hora_inicio_real = NOW(), inicio_tardio = $1, justificacion_tardio = $2
       WHERE id = $3`,
      [inicioTardio, justificacion || null, asigId]
    );

    // Activar primer sector (si existe)
    await pool.query(
      `UPDATE sectores_asignacion SET estado = 'en_progreso'
       WHERE asignacion_id = $1 AND sector_id = (
         SELECT sa.sector_id 
         FROM sectores_asignacion sa
         JOIN sectores_ruta sr ON sr.id = sa.sector_id
         WHERE sa.asignacion_id = $2
         ORDER BY sr.orden ASC LIMIT 1
       )`,
      [asigId, asigId]
    );

    // NOTIFICAR ADMIN: Inicio de ruta
    await crearNotificacion({
      titulo: inicioTardio ? '⚠️ Inicio Tardío' : '🚛 Ruta Iniciada',
      mensaje: `El conductor ${req.usuario.nombre || 'Conductor'} ha iniciado la ruta "${a.ruta_nombre || 'Sin nombre'}".${inicioTardio ? ' (Inicio fuera de horario)' : ''}`,
      tipo: inicioTardio ? 'urgente' : 'operativo',
      metadata: { asignacion_id: asigId, tipo: 'INICIO_RUTA' }
    });

    // Iniciar el simulador en el backend
    console.log('🔄 Llamando startSimulation...');
    startSimulation(asigId);

    res.status(200).json({
      mensaje: inicioTardio ? 'Ruta iniciada con inicio tardío.' : 'Ruta iniciada correctamente.',
      inicio_tardio: inicioTardio
    });

  } catch (error) {
    console.error('❌ ERROR CRÍTICO en iniciarRuta:', error);
    res.status(500).json({ 
      mensaje: 'Error interno del servidor.', 
      error: error.message,
      stack: error.stack 
    });
  }
};

// Actualizar progreso de sector
const actualizarSector = async (req, res) => {
  const { id, sectorId } = req.params;
  const { porcentaje_recorrido } = req.body;

  try {
    const completado = porcentaje_recorrido >= 90;

    await pool.query(
      `UPDATE sectores_asignacion 
       SET porcentaje_recorrido = $1,
           estado = $2,
           completado_at = $3
       WHERE asignacion_id = $4 AND sector_id = $5`,
      [
        porcentaje_recorrido,
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
  const { sector_pausa_id, punto_pausa_lat, punto_pausa_lng, punto_descarga_lat, punto_descarga_lng } = req.body;

  try {
    const resultado = await pool.query(
      `INSERT INTO descargas 
       (asignacion_id, sector_pausa_id, punto_pausa_lat, punto_pausa_lng, punto_descarga_lat, punto_descarga_lng, hora_salida)
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
      [id, sector_pausa_id, punto_pausa_lat, punto_pausa_lng, punto_descarga_lat, punto_descarga_lng]
    );

    res.status(201).json({ mensaje: 'Descarga registrada.', descarga: resultado.rows[0] });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Completar descarga
const completarDescarga = async (req, res) => {
  const { id, descargaId } = req.params;

  try {
    await pool.query(
      'UPDATE descargas SET hora_regreso = NOW() WHERE id = $1 AND asignacion_id = $2',
      [descargaId, id]
    );

    res.status(200).json({ mensaje: 'Descarga completada. Sector reactivado.' });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Registrar GPS
const registrarGPS = async (req, res) => {
  const { id } = req.params;
  const { latitud, longitud } = req.body;

  try {
    await pool.query(
      'INSERT INTO rastreo_gps (asignacion_id, latitud, longitud) VALUES ($1, $2, $3)',
      [id, latitud, longitud]
    );

    res.status(201).json({ mensaje: 'GPS registrado.' });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Reportar incidencia
const reportarIncidencia = async (req, res) => {
  const { id } = req.params;
  const { tipo, descripcion } = req.body;
  const conductorId = req.usuario.id;

  try {
    const tiposPermitidos = ['trancon', 'accidente', 'contenedor_lleno', 'via_bloqueada'];
    if (!tiposPermitidos.includes(tipo)) {
      return res.status(400).json({ mensaje: `Tipo debe ser uno de: ${tiposPermitidos.join(', ')}` });
    }

    const resultado = await pool.query(
      `INSERT INTO incidencias_conductor (asignacion_id, conductor_id, tipo, descripcion)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, conductorId, tipo, descripcion]
    );

    res.status(201).json({ mensaje: 'Incidencia reportada al administrador.', incidencia: resultado.rows[0] });
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
    if (!toneladas) {
      return res.status(400).json({ mensaje: 'Las toneladas recolectadas son obligatorias.' });
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

    // Finalizar asignación
    await pool.query(
      `UPDATE asignaciones_semanales 
       SET estado = 'completada', hora_fin_real = NOW()
       WHERE id = $1 AND conductor_id = $2`,
      [id, conductorId]
    );

    // Calcular eficiencia
    const asignacion = await pool.query(
      'SELECT * FROM asignaciones_semanales WHERE id = $1',
      [id]
    );
    const a = asignacion.rows[0];
    const tiempoMinutos = Math.round((new Date(a.hora_fin_real) - new Date(a.hora_inicio_real)) / 60000);

    const sectoresTotal = await pool.query(
      'SELECT COUNT(*) FROM sectores_asignacion WHERE asignacion_id = $1',
      [id]
    );
    const sectoresCompletados = await pool.query(
      `SELECT COUNT(*) FROM sectores_asignacion WHERE asignacion_id = $1 AND estado = 'completado'`,
      [id]
    );
    const numDescargas = await pool.query(
      'SELECT COUNT(*) FROM descargas WHERE asignacion_id = $1',
      [id]
    );

    const total = parseInt(sectoresTotal.rows[0].count);
    const completados = parseInt(sectoresCompletados.rows[0].count);
    const porcentaje = total > 0 ? Math.round((completados / total) * 100) : 0;

    await pool.query(
      `INSERT INTO eficiencia_rutas 
       (asignacion_id, toneladas, tiempo_minutos, sectores_completados, sectores_totales, porcentaje_cumplimiento, num_descargas, km_recorridos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, toneladas, tiempoMinutos, completados, total, porcentaje, parseInt(numDescargas.rows[0].count), a.km_recorridos]
    );

    // NOTIFICAR ADMIN: Fin de ruta
    await crearNotificacion({
      titulo: '✅ Ruta Finalizada',
      mensaje: `La ruta "${a.ruta_nombre || 'Sin nombre'}" ha sido completada con un ${porcentaje}% de cumplimiento.`,
      tipo: 'operativo',
      metadata: { asignacion_id: id, tipo: 'FIN_RUTA' }
    });

    res.status(200).json({ mensaje: 'Ruta finalizada exitosamente.', porcentaje_cumplimiento: porcentaje });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

module.exports = {
  misRutas, iniciarRuta, actualizarSector,
  registrarDescarga, completarDescarga,
  registrarGPS, reportarIncidencia, finalizarRuta
};