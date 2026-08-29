const pool = require('../config/database');
const { crearNotificacion } = require('../services/notificacionService');

// Obtener alertas/incidencias activas (RF-07.3)
const obtenerIncidenciasActivas = async (req, res) => {
  try {
    // El conductor y el vehículo se toman de la asignación del día (RNF-12):
    // leyendo rutas_fijas, una incidencia reportada tras un relevo aparecía
    // atribuida al conductor titular y no a quien realmente iba conduciendo.
    //
    // Los JOIN son LEFT porque incidencias_conductor.asignacion_id admite NULL;
    // con JOIN interno esas incidencias desaparecían del panel del admin.
    const resultado = await pool.query(
      `SELECT i.*,
              ad.fecha AS asignacion_fecha,
              rf.nombre AS ruta_nombre,
              COALESCE(uc.nombre, u.nombre) AS conductor_nombre,
              v.placa AS vehiculo_placa
       FROM incidencias_conductor i
       LEFT JOIN usuarios uc ON uc.id = i.conductor_id
       LEFT JOIN asignaciones_semanales ad ON ad.id = i.asignacion_id
       LEFT JOIN rutas_fijas rf ON rf.id = ad.ruta_fija_id
       LEFT JOIN usuarios u ON u.id = COALESCE(ad.conductor_id, rf.conductor_default_id)
       LEFT JOIN vehiculos v ON v.id = COALESCE(ad.vehiculo_id, rf.vehiculo_id)
       WHERE i.resuelto = FALSE
       ORDER BY i.created_at DESC`
    );
    res.json({ incidencias: resultado.rows });
  } catch (error) {
    // Antes se respondía 200 con una lista vacía, de modo que un fallo real de
    // base de datos era indistinguible de "no hay incidencias" y el admin
    // dejaba de ver emergencias sin enterarse de nada.
    console.error('Error al obtener incidencias activas:', error.message);
    res.status(500).json({ mensaje: 'Error al obtener las incidencias activas.' });
  }
};

// Crear incidencia (conductor)
const crearIncidencia = async (req, res) => {
  const { asignacion_id, tipo, descripcion, lat, lng } = req.body;
  const conductor_id = req.usuario.id;

  if (!tipo) return res.status(400).json({ mensaje: 'El tipo de incidencia es obligatorio.' });
  if (!asignacion_id) return res.status(400).json({ mensaje: 'La asignacion es obligatoria para reportar una incidencia.' });

  const tiposPermitidos = [
    'via_obstruida', 'falla_motor', 'accidente', 'operario_lesionado', 'otro'
  ];
  if (!tiposPermitidos.includes(tipo)) {
    return res.status(400).json({ mensaje: `Tipo debe ser uno de: ${tiposPermitidos.join(', ')}` });
  }

  try {
    const asignacion = await pool.query(
      `SELECT a.id, v.placa as vehiculo_placa 
       FROM asignaciones_semanales a
       JOIN rutas_fijas rf ON rf.id = a.ruta_fija_id
       JOIN vehiculos v ON v.id = COALESCE(a.vehiculo_id, rf.vehiculo_id)
       WHERE a.id = $1 AND a.conductor_id = $2 AND a.estado = 'activa'`,
      [asignacion_id, conductor_id]
    );

    if (asignacion.rows.length === 0) {
      return res.status(403).json({ mensaje: 'No autorizado. La incidencia debe pertenecer a una ruta activa.' });
    }

    const r = await pool.query(
      `INSERT INTO incidencias_conductor (asignacion_id, conductor_id, tipo, descripcion, resuelto, lat, lng)
       VALUES ($1, $2, $3, $4, FALSE, $5, $6) RETURNING *`,
      [asignacion_id, conductor_id, tipo, descripcion || '', lat || null, lng || null]
    );

    let telefono_emergencia = null;
    if (tipo === 'operario_lesionado') {
       const conf = await pool.query("SELECT valor FROM configuracion WHERE clave = 'telefono_ambulancia'");
       if (conf.rows.length > 0) telefono_emergencia = conf.rows[0].valor;
    }

    // NOTIFICAR ADMIN: Nueva incidencia
    await crearNotificacion({
      titulo: tipo === 'accidente' || tipo === 'operario_lesionado' ? 'Emergencia crítica' : 'Novedad en ruta',
      mensaje: `Conductor ${req.usuario.nombre}: ${tipo.replace('_', ' ')}. ${descripcion || ''}`,
      tipo: tipo === 'accidente' || tipo === 'operario_lesionado' ? 'urgente' : 'operativo',
      metadata: { asignacion_id: asignacion_id, incidencia_id: r.rows[0].id, tipo: 'INCIDENCIA' }
    });

    const { emitirAdmins } = require('../config/socket');
    emitirAdmins('nueva_incidencia', {
      ...r.rows[0],
      conductor_nombre: req.usuario.nombre,
      vehiculo_placa: asignacion.rows[0].vehiculo_placa
    });

    res.status(201).json({ 
      incidencia: r.rows[0],
      telefono_emergencia 
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ mensaje: 'Error interno al reportar incidencia.' });
  }
};

module.exports = {
  obtenerIncidenciasActivas,
  crearIncidencia
};
