const pool = require('../config/database');
const { generarAsignaciones } = require('../services/cronService');
const { registrarActividad } = require('../services/auditoriaService');

// Crear ruta fija
const crearRutaFija = async (req, res) => {
  const { nombre, jornada_id, conductor_default_id, vehiculo_id, dias_semana, sectores } = req.body;

  try {
    // Validar campos obligatorios
    if (!nombre || !jornada_id || !conductor_default_id || !vehiculo_id || !dias_semana) {
      return res.status(400).json({ mensaje: 'Todos los campos son obligatorios.' });
    }

    // Validar que el conductor existe y tiene rol conductor
    const conductor = await pool.query(
      'SELECT id FROM usuarios WHERE id = $1 AND rol = $2 AND activo = TRUE',
      [conductor_default_id, 'conductor']
    );
    if (conductor.rows.length === 0) {
      return res.status(400).json({ mensaje: 'El conductor no existe o no está activo.' });
    }

    // Validar que el vehículo existe
    const vehiculo = await pool.query(
      'SELECT id FROM vehiculos WHERE id = $1 AND activo = TRUE',
      [vehiculo_id]
    );
    if (vehiculo.rows.length === 0) {
      return res.status(400).json({ mensaje: 'El vehículo no existe o no está activo.' });
    }

    // NUEVA VALIDACIÓN: Verificar si existe una ruta inactiva con el mismo nombre para ofrecer restaurarla
    const inactiva = await pool.query(
      'SELECT id FROM rutas_fijas WHERE nombre = $1 AND activo = FALSE',
      [nombre]
    );

    if (inactiva.rows.length > 0) {
      return res.status(409).json({ 
        mensaje: `Ya existe una ruta llamada "${nombre}" que fue eliminada anteriormente. ¿Deseas restaurarla?`,
        rutaId: inactiva.rows[0].id,
        requiereRestauracion: true 
      });
    }

    // NUEVA VALIDACIÓN: Evitar nombres duplicados activos
    const activa = await pool.query(
      'SELECT id FROM rutas_fijas WHERE nombre = $1 AND activo = TRUE',
      [nombre]
    );

    if (activa.rows.length > 0) {
      return res.status(400).json({ 
        mensaje: `Ya existe una ruta activa con el nombre "${nombre}". Para evitar confusiones, por favor usa un nombre diferente (ej. añadiendo el día).` 
      });
    }

    // NUEVA VALIDACIÓN: REGLA DE ORO (No repetir jornada/día para Conductor o Vehículo)
    const diasNuevos = dias_semana.split(',').map(Number);

    const rutasExistentes = await pool.query(
      `SELECT nombre, dias_semana_arr, conductor_default_id, vehiculo_id
       FROM rutas_fijas 
       WHERE (conductor_default_id = $1 OR vehiculo_id = $2)
       AND jornada_id = $3
       AND activo = TRUE`,
      [conductor_default_id, vehiculo_id, jornada_id]
    );

    for (const ruta of rutasExistentes.rows) {
      const diasOcupados = ruta.dias_semana_arr || [];
      const coincidencia = diasNuevos.filter(diaN => 
        diasOcupados.some(diaO => diaN === diaO)
      );

      if (coincidencia.length > 0) {
        const esConductor = ruta.conductor_default_id == conductor_default_id;
        const sujeto = esConductor ? `El conductor` : `El vehículo`;
        const razon = esConductor ? `ya tiene asignada la ruta "${ruta.nombre}"` : `ya está siendo usado en la ruta "${ruta.nombre}"`;
        
        return res.status(400).json({ 
          mensaje: `❌ Error de Logística: ${sujeto} ${razon} para los días: [${coincidencia.join(', ')}] en la jornada seleccionada.` 
        });
      }
    }

    // Guardar la ruta principal
    const diasArray = dias_semana
      .split(',')
      .map(d => parseInt(d.trim()))
      .filter(d => !isNaN(d));

    const resultado = await pool.query(
      `INSERT INTO rutas_fijas (nombre, jornada_id, conductor_default_id, vehiculo_id, dias_semana_arr)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nombre, jornada_id, conductor_default_id, vehiculo_id, diasArray]
    );

    const rutaFija = resultado.rows[0];

    // Crear sectores si vienen en la petición
    if (sectores && sectores.length > 0) {
      for (const sector of sectores) {
        await pool.query(
          `INSERT INTO sectores_ruta (ruta_fija_id, nombre, orden, trazado_geom, porcentaje_requerido)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            rutaFija.id,
            sector.nombre,
            sector.orden,
            sector.trazado_geom,
            sector.porcentaje_requerido !== undefined ? sector.porcentaje_requerido : 90
          ]
        );
      }
    }

    // Generar asignaciones inmediatamente para que aparezcan en el panel semanal
    await generarAsignaciones();

    // Auditoría
    await registrarActividad(
      req.usuario?.id, 
      'Creación de Ruta', 
      'rutas_fijas', 
      rutaFija.id, 
      `Se creó la ruta: ${rutaFija.nombre}`
    );

    res.status(201).json({
      mensaje: 'Ruta fija creada exitosamente.',
      ruta: rutaFija
    });

  } catch (error) {
    console.error('Error al crear ruta fija:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Obtener todas las rutas fijas
const obtenerRutasFijas = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT r.*, j.nombre as jornada_nombre, u.nombre as conductor_nombre, v.placa as vehiculo_placa
       FROM rutas_fijas r
       JOIN jornadas j ON r.jornada_id = j.id
       LEFT JOIN usuarios u ON r.conductor_default_id = u.id
       LEFT JOIN vehiculos v ON r.vehiculo_id = v.id
       ORDER BY r.id ASC`
    );
    const { arrayToString } = require('../utils/dateHelper');
    const rutas = resultado.rows.map(r => ({
      ...r,
      dias_semana: arrayToString(r.dias_semana_arr || [])
    }));
    res.status(200).json({ rutas });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener rutas fijas' });
  }
};

// Obtener una ruta fija con sus sectores
const obtenerRutaFijaPorId = async (req, res) => {
  const { id } = req.params;

  try {
    const ruta = await pool.query(
      `SELECT rf.*, 
              u.nombre AS conductor_nombre,
              v.placa AS vehiculo_placa,
              j.nombre AS jornada_nombre,
              j.hora_inicio,
              j.hora_limite_fin
       FROM rutas_fijas rf
       JOIN usuarios u ON u.id = rf.conductor_default_id
       JOIN vehiculos v ON v.id = rf.vehiculo_id
       JOIN jornadas j ON j.id = rf.jornada_id
       WHERE rf.id = $1 AND rf.activo = TRUE`,
      [id]
    );

    if (ruta.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Ruta no encontrada.' });
    }

    // Obtener sectores de la ruta
    const sectores = await pool.query(
      'SELECT * FROM sectores_ruta WHERE ruta_fija_id = $1 ORDER BY orden ASC',
      [id]
    );

    res.status(200).json({
      ruta: ruta.rows[0],
      sectores: sectores.rows
    });

  } catch (error) {
    console.error('Error al obtener ruta:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Editar ruta fija
const editarRutaFija = async (req, res) => {
  const { id } = req.params;
  const { nombre, jornada_id, conductor_default_id, vehiculo_id, dias_semana, activo, sectores } = req.body;

  try {
    // Validar disponibilidad antes de actualizar
    if (nombre) {
      const activa = await pool.query(
        'SELECT id FROM rutas_fijas WHERE nombre = $1 AND activo = TRUE AND id != $2',
        [nombre, id]
      );
      if (activa.rows.length > 0) {
        return res.status(400).json({ 
          mensaje: `Ya existe otra ruta activa con el nombre "${nombre}". Por favor usa un nombre diferente (ej. añadiendo el día).` 
        });
      }
    }

    const rutaActual = await pool.query('SELECT * FROM rutas_fijas WHERE id = $1', [id]);
    if (rutaActual.rows.length > 0) {
      const r = rutaActual.rows[0];
      const c_id = conductor_default_id || r.conductor_default_id;
      const v_id = vehiculo_id || r.vehiculo_id;
      const j_id = jornada_id || r.jornada_id;
      const { arrayToString } = require('../utils/dateHelper');
      const d_sem = dias_semana || arrayToString(r.dias_semana_arr || []);
      
      const rExistentes = await pool.query(
        `SELECT nombre, dias_semana_arr FROM rutas_fijas 
         WHERE (conductor_default_id = $1 OR vehiculo_id = $2)
         AND jornada_id = $3 AND activo = TRUE AND id != $4`,
        [c_id, v_id, j_id, id]
      );

      const diasNuevos = typeof d_sem === 'string' ? d_sem.split(',').map(Number) : d_sem;

      for (const rx of rExistentes.rows) {
        const diasOcupados = rx.dias_semana_arr || [];
        for (const diaN of diasNuevos) {
          for (const diaO of diasOcupados) {
            if (diaN === diaO) {
              return res.status(400).json({ 
                mensaje: `❌ Conflicto: El conductor o vehículo ya tienen la ruta "${rx.nombre}" el día ${diaN} en esta misma jornada.` 
              });
            }
          }
        }
      }
    }

    const resultado = await pool.query(
      `UPDATE rutas_fijas 
       SET nombre = COALESCE($1, nombre),
           jornada_id = COALESCE($2, jornada_id),
           conductor_default_id = COALESCE($3, conductor_default_id),
           vehiculo_id = COALESCE($4, vehiculo_id),
           dias_semana_arr = COALESCE($5, dias_semana_arr),
           activo = COALESCE($6, activo)
       WHERE id = $7
       RETURNING *`,
      [nombre, jornada_id, conductor_default_id, vehiculo_id,
       (dias_semana && typeof dias_semana === 'string')
         ? dias_semana.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d))
         : dias_semana,
       activo, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Ruta no encontrada.' });
    }

    // Si vienen sectores, actualizamos el primero (suponiendo 1 sector por ruta por ahora)
    if (sectores && sectores.length > 0) {
      const sector = sectores[0];
      const sectorUpdate = await pool.query(
        `UPDATE sectores_ruta SET trazado_geom = $1, nombre = $2 
         WHERE ruta_fija_id = $3 RETURNING id`,
        [sector.trazado_geom, sector.nombre, id]
      );
      if (sectorUpdate.rows.length === 0) {
        await pool.query(
          `INSERT INTO sectores_ruta (ruta_fija_id, nombre, orden, trazado_geom, porcentaje_requerido)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, sector.nombre, 1, sector.trazado_geom, sector.porcentaje_requerido !== undefined ? sector.porcentaje_requerido : 90]
        );
      }
    }

    // Sincronizar asignaciones semanales con el cambio
    await generarAsignaciones();

    // Auditoría
    await registrarActividad(
      req.usuario?.id, 
      'Edición de Ruta', 
      'rutas_fijas', 
      id, 
      `Se modificó la ruta: ${resultado.rows[0].nombre}. Activo: ${resultado.rows[0].activo}`
    );

    res.status(200).json({
      mensaje: 'Ruta actualizada exitosamente.',
      ruta: resultado.rows[0]
    });

  } catch (error) {
    console.error('Error al editar ruta:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Eliminar ruta fija (soft delete)
const eliminarRutaFija = async (req, res) => {
  const { id } = req.params;

  try {
    // Obtener nombre antes de borrar para el historial
    const infoRuta = await pool.query(
      'SELECT rf.nombre, j.nombre as jornada FROM rutas_fijas rf JOIN jornadas j ON j.id = rf.jornada_id WHERE rf.id = $1',
      [id]
    );
    const rutaData = infoRuta.rows[0];

    const resultado = await pool.query(
      'UPDATE rutas_fijas SET activo = FALSE WHERE id = $1 RETURNING id',
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Ruta no encontrada.' });
    }

    // Limpiar asignaciones futuras pendientes de esta ruta
    const asignacionesPendientes = await pool.query(
      "SELECT id FROM asignaciones_semanales WHERE ruta_fija_id = $1 AND estado = 'pendiente' AND fecha >= CURRENT_DATE",
      [id]
    );

    if (asignacionesPendientes.rows.length > 0) {
      const ids = asignacionesPendientes.rows.map(r => r.id);
      const { eliminarAsignacionesPorIds } = require('../services/dbCleanupService');
      await eliminarAsignacionesPorIds(ids);
    }

    // Auditoría
    await registrarActividad(
      req.usuario?.id, 
      'Eliminación de Ruta', 
      'rutas_fijas', 
      id, 
      `Se eliminó la ruta "${rutaData?.nombre}" de la jornada ${rutaData?.jornada}. (ID: ${id})`
    );

    res.status(200).json({ mensaje: 'Ruta eliminada exitosamente.' });

  } catch (error) {
    console.error('Error al eliminar ruta:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Obtener vehículos activos
const obtenerVehiculos = async (req, res) => {
  try {
    const resultado = await pool.query('SELECT id, placa, modelo, capacidad_ton FROM vehiculos WHERE activo = TRUE');
    res.status(200).json({ vehiculos: resultado.rows });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener vehículos' });
  }
};

// Obtener jornadas
const obtenerJornadas = async (req, res) => {
  try {
    const resultado = await pool.query('SELECT id, nombre, hora_inicio, hora_limite_fin FROM jornadas');
    res.status(200).json({ jornadas: resultado.rows });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener jornadas' });
  }
};

// Crear vehículo
const crearVehiculo = async (req, res) => {
  const { placa, modelo, capacidad_ton } = req.body;
  
  // Validar placa (Formato AAA-123)
  const regexPlaca = /^[A-Z]{3}-[0-9]{3}$/;
  if (!placa || !regexPlaca.test(placa.toUpperCase())) {
    return res.status(400).json({ mensaje: 'La placa debe tener el formato AAA-123 (3 letras, guión y 3 números).' });
  }

  // Validar capacidad
  const cap = parseFloat(capacidad_ton);
  if (isNaN(cap) || cap <= 0) {
    return res.status(400).json({ mensaje: 'La capacidad debe ser un número mayor a 0.' });
  }

  try {
    const resultado = await pool.query(
      'INSERT INTO vehiculos (placa, modelo, capacidad_ton) VALUES ($1, $2, $3) RETURNING *',
      [placa.toUpperCase(), modelo, cap]
    );
    // Auditoría
    await registrarActividad(
      req.usuario?.id, 
      'Registro de Vehículo', 
      'vehiculos', 
      resultado.rows[0].id, 
      `Se registró el vehículo: ${placa.toUpperCase()}`
    );

    res.status(201).json({ mensaje: 'Vehículo registrado', vehiculo: resultado.rows[0] });
  } catch (error) {
    console.error('Error DB:', error);
    res.status(500).json({ mensaje: 'Error al registrar vehículo' });
  }
};

// Editar vehículo
const editarVehiculo = async (req, res) => {
  const { id } = req.params;
  const { placa, modelo, capacidad_ton } = req.body;

  // Validaciones si vienen los campos
  if (placa) {
    const regexPlaca = /^[A-Z]{3}-[0-9]{3}$/;
    if (!regexPlaca.test(placa.toUpperCase())) {
      return res.status(400).json({ mensaje: 'La placa debe tener el formato AAA-123.' });
    }
  }

  if (capacidad_ton !== undefined) {
    const cap = parseFloat(capacidad_ton);
    if (isNaN(cap) || cap <= 0) {
      return res.status(400).json({ mensaje: 'La capacidad debe ser un número mayor a 0.' });
    }
  }

  try {
    const resultado = await pool.query(
      `UPDATE vehiculos 
       SET placa = COALESCE($1, placa),
           modelo = COALESCE($2, modelo),
           capacidad_ton = COALESCE($3, capacidad_ton)
       WHERE id = $4 RETURNING *`,
      [placa ? placa.toUpperCase() : null, modelo, capacidad_ton, id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Vehículo no encontrado' });
    }
    // Auditoría
    await registrarActividad(
      req.usuario?.id, 
      'Edición de Vehículo', 
      'vehiculos', 
      id, 
      `Se actualizaron los datos del vehículo: ${resultado.rows[0].placa}`
    );

    res.json({ mensaje: 'Vehículo actualizado', vehiculo: resultado.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al editar vehículo' });
  }
};

// Helper: verifica si un rango de horas se solapa con jornadas existentes
const verificarSolapaJornada = async (hora_inicio, hora_limite_fin, excluirId = null) => {
  const query = `
    SELECT id, nombre, hora_inicio, hora_limite_fin 
    FROM jornadas
    WHERE id != COALESCE($3, -1)
      AND (
        -- La nueva jornada comienza dentro de una existente
        ($1 >= hora_inicio AND $1 < hora_limite_fin)
        OR
        -- La nueva jornada termina dentro de una existente
        ($2 > hora_inicio AND $2 <= hora_limite_fin)
        OR
        -- La nueva jornada envuelve completamente una existente
        ($1 <= hora_inicio AND $2 >= hora_limite_fin)
      )
  `;
  const resultado = await pool.query(query, [hora_inicio, hora_limite_fin, excluirId]);
  return resultado.rows;
};

// Crear jornada
const crearJornada = async (req, res) => {
  const { nombre, hora_inicio, hora_limite_fin } = req.body;
  if (!nombre || !hora_inicio || !hora_limite_fin) {
    return res.status(400).json({ mensaje: 'Todos los campos son obligatorios.' });
  }
  if (hora_inicio >= hora_limite_fin) {
    return res.status(400).json({ mensaje: 'La hora de inicio debe ser anterior a la hora de fin.' });
  }
  try {
    const solapas = await verificarSolapaJornada(hora_inicio, hora_limite_fin);
    if (solapas.length > 0) {
      return res.status(409).json({
        mensaje: `El horario se solapa con la jornada existente "${solapas[0].nombre}" (${solapas[0].hora_inicio} - ${solapas[0].hora_limite_fin}). Ajusta las horas para que no se crucen.`
      });
    }
    const resultado = await pool.query(
      'INSERT INTO jornadas (nombre, hora_inicio, hora_limite_fin) VALUES ($1, $2, $3) RETURNING *',
      [nombre, hora_inicio, hora_limite_fin]
    );
    // Auditoría
    await registrarActividad(
      req.usuario?.id, 
      'Creación de Jornada', 
      'jornadas', 
      resultado.rows[0].id, 
      `Se creó la jornada: ${nombre}`
    );

    res.status(201).json({ mensaje: 'Jornada creada', jornada: resultado.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al crear jornada' });
  }
};

// Editar jornada
const editarJornada = async (req, res) => {
  const { id } = req.params;
  const { nombre, hora_inicio, hora_limite_fin } = req.body;
  if (hora_inicio && hora_limite_fin && hora_inicio >= hora_limite_fin) {
    return res.status(400).json({ mensaje: 'La hora de inicio debe ser anterior a la hora de fin.' });
  }
  try {
    // Obtener los datos actuales para completar los COALESCE
    const actual = await pool.query('SELECT * FROM jornadas WHERE id = $1', [id]);
    if (actual.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Jornada no encontrada' });
    }
    const inicio = hora_inicio || actual.rows[0].hora_inicio;
    const fin = hora_limite_fin || actual.rows[0].hora_limite_fin;

    // Validar solapamiento excluyendo la jornada actual
    const solapas = await verificarSolapaJornada(inicio, fin, id);
    if (solapas.length > 0) {
      return res.status(409).json({
        mensaje: `El horario se solapa con la jornada "${solapas[0].nombre}" (${solapas[0].hora_inicio} - ${solapas[0].hora_limite_fin}). Ajusta las horas.`
      });
    }

    const resultado = await pool.query(
      `UPDATE jornadas 
       SET nombre = COALESCE($1, nombre),
           hora_inicio = COALESCE($2, hora_inicio),
           hora_limite_fin = COALESCE($3, hora_limite_fin)
       WHERE id = $4 RETURNING *`,
      [nombre, hora_inicio, hora_limite_fin, id]
    );
    // Auditoría
    await registrarActividad(
      req.usuario?.id, 
      'Edición de Jornada', 
      'jornadas', 
      id, 
      `Se modificó la jornada: ${resultado.rows[0].nombre}`
    );

    res.json({ mensaje: 'Jornada actualizada', jornada: resultado.rows[0] });
  } catch (error) {
    console.error('Error DB en editarJornada:', error.message);
    res.status(500).json({ mensaje: 'Error DB: ' + error.message });
  }
};

// Restaurar ruta eliminada
const restaurarRuta = async (req, res) => {
  const { id } = req.params;
  try {
    const resultado = await pool.query(
      'UPDATE rutas_fijas SET activo = TRUE WHERE id = $1 RETURNING *',
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Ruta no encontrada' });
    }

    const ruta = resultado.rows[0];

    // Sincronizar asignaciones futuras tras restaurar
    const { generarAsignaciones } = require('../services/cronService');
    await generarAsignaciones(ruta.id);

    // Auditoría
    const { registrarActividad } = require('../services/auditoriaService');
    await registrarActividad(
      req.usuario?.id, 
      'Restauración de Ruta', 
      'rutas_fijas', 
      id, 
      `Se restauró la ruta: ${ruta.nombre}`
    );

    res.json({ mensaje: 'Ruta restaurada exitosamente', ruta });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al restaurar ruta' });
  }
};

module.exports = {
  crearRutaFija,
  obtenerRutasFijas,
  obtenerRutaFijaPorId,
  editarRutaFija,
  eliminarRutaFija,
  restaurarRuta,
  obtenerVehiculos,
  obtenerJornadas,
  crearVehiculo,
  editarVehiculo,
  crearJornada,
  editarJornada
};