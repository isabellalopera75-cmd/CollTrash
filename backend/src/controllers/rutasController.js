const pool = require('../config/database');
const { generarAsignaciones } = require('../services/cronService');
const { registrarActividad } = require('../services/auditoriaService');

// Crear ruta fija
/**
 * Normaliza los dias de repeticion a un arreglo de enteros ISO (1=lunes .. 7=domingo).
 *
 * El formulario envia unas veces la cadena "1,3,5" y otras el arreglo [1,3,5].
 * Al asumir siempre cadena, `dias_semana.split` lanzaba TypeError y la creacion
 * de la ruta respondia 500 sin explicar nada.
 */
const normalizarDias = (dias) => {
  const bruto = Array.isArray(dias) ? dias : String(dias ?? '').split(',');
  const limpios = bruto
    .map(d => parseInt(String(d).trim(), 10))
    .filter(d => Number.isInteger(d) && d >= 1 && d <= 7);
  return [...new Set(limpios)].sort((a, b) => a - b);
};

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
    const diasNuevos = normalizarDias(dias_semana);
    if (diasNuevos.length === 0) {
      return res.status(400).json({ mensaje: 'Debe indicar al menos un día de la semana válido (1 = lunes … 7 = domingo).' });
    }

    let rutaFija;
    const client = await pool.connect();
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');

      const rutasExistentes = await client.query(
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
          await client.query('ROLLBACK');
          client.release();
          const esConductor = ruta.conductor_default_id == conductor_default_id;
          const sujeto = esConductor ? `El conductor` : `El vehículo`;
          const razon = esConductor ? `ya tiene asignada la ruta "${ruta.nombre}"` : `ya está siendo usado en la ruta "${ruta.nombre}"`;
          
          return res.status(400).json({ 
            mensaje: `❌ Error de Logística: ${sujeto} ${razon} para los días: [${coincidencia.join(', ')}] en la jornada seleccionada.` 
          });
        }
      }

      // Guardar la ruta principal
      const resultado = await client.query(
        `INSERT INTO rutas_fijas (nombre, jornada_id, conductor_default_id, vehiculo_id, dias_semana_arr)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [nombre, jornada_id, conductor_default_id, vehiculo_id, diasNuevos]
      );

    rutaFija = resultado.rows[0];

    // Crear sectores si vienen en la petición
    if (sectores && sectores.length > 0) {
      for (const sector of sectores) {
        await client.query(
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

    await client.query('COMMIT');
    client.release();

    } catch (txError) {
      await client.query('ROLLBACK');
      client.release();
      throw txError;
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const offset = (page - 1) * limit;

    const totalRes = await pool.query('SELECT COUNT(*) FROM rutas_fijas');
    const totalRegistros = parseInt(totalRes.rows[0].count);
    const totalPaginas = Math.ceil(totalRegistros / limit);

    const resultado = await pool.query(
      `SELECT r.*, j.nombre as jornada_nombre, u.nombre as conductor_nombre, v.placa as vehiculo_placa
       FROM rutas_fijas r
       JOIN jornadas j ON r.jornada_id = j.id
       LEFT JOIN usuarios u ON r.conductor_default_id = u.id
       LEFT JOIN vehiculos v ON r.vehiculo_id = v.id
       ORDER BY r.id ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const { arrayToString } = require('../utils/dateHelper');
    const rutas = resultado.rows.map(r => ({
      ...r,
      dias_semana: arrayToString(r.dias_semana_arr || [])
    }));
    res.status(200).json({ 
      rutas,
      paginacion: {
        totalRegistros,
        totalPaginas,
        paginaActual: page,
        limite: limit
      }
    });
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

    const { arrayToString } = require('../utils/dateHelper');
    const rutaEncontrada = {
      ...ruta.rows[0],
      dias_semana: arrayToString(ruta.rows[0].dias_semana_arr || [])
    };

    res.status(200).json({
      ruta: rutaEncontrada,
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

      const diasNuevos = normalizarDias(d_sem);

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

    const diasEditados = normalizarDias(dias_semana);

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
       // null y no [] cuando no llegan dias validos: con un arreglo vacio el
       // COALESCE de arriba lo daria por valor bueno y la ruta se quedaria sin
       // ningun dia de repeticion, dejando de generar asignaciones.
       diasEditados.length > 0 ? diasEditados : null,
       activo, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Ruta no encontrada.' });
    }

    // Sincronizar los sectores de la ruta (RF-11: una ruta se divide en varios
    // sectores, cada uno con su nombre y su orden de visita).
    //
    // Antes se actualizaba sólo el primero y se borraba el resto sin más. Con
    // eso, una ruta de tres sectores quedaba reducida a uno en la primera
    // edición, y el borrado directo habría reventado contra la clave foránea
    // de sectores_asignacion en cuanto un sector tuviera jornadas asociadas.
    if (Array.isArray(sectores) && sectores.length > 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const existentes = await client.query(
          'SELECT id FROM sectores_ruta WHERE ruta_fija_id = $1 ORDER BY orden ASC, id ASC',
          [id]
        );

        // Se reaprovechan las filas existentes por posición para no romper las
        // referencias del historial: el sector 1 sigue siendo el sector 1.
        for (let i = 0; i < sectores.length; i++) {
          const sector = sectores[i];
          const porcentaje = sector.porcentaje_requerido !== undefined ? sector.porcentaje_requerido : 90;

          if (existentes.rows[i]) {
            await client.query(
              `UPDATE sectores_ruta
                  SET nombre = $1, orden = $2, trazado_geom = $3, porcentaje_requerido = $4
                WHERE id = $5`,
              [sector.nombre, i + 1, sector.trazado_geom, porcentaje, existentes.rows[i].id]
            );
          } else {
            await client.query(
              `INSERT INTO sectores_ruta (ruta_fija_id, nombre, orden, trazado_geom, porcentaje_requerido)
               VALUES ($1, $2, $3, $4, $5)`,
              [id, sector.nombre, i + 1, sector.trazado_geom, porcentaje]
            );
          }
        }

        // Sectores que sobran porque la ruta se rediseñó con menos tramos.
        const sobrantes = existentes.rows.slice(sectores.length).map(r => r.id);
        if (sobrantes.length > 0) {
          // Primero se desvinculan de las jornadas que aún no se han ejecutado,
          // igual que hace la baja de una ruta: el historial no se toca.
          await client.query(
            `DELETE FROM sectores_asignacion sa
              USING asignaciones_semanales a
              WHERE sa.asignacion_id = a.id
                AND sa.sector_id = ANY($1::int[])
                AND a.estado = 'pendiente'
                AND a.fecha >= CURRENT_DATE`,
            [sobrantes]
          );

          try {
            await client.query('DELETE FROM sectores_ruta WHERE id = ANY($1::int[])', [sobrantes]);
          } catch (errBorrado) {
            if (errBorrado.code === '23503') {
              await client.query('ROLLBACK');
              client.release();
              return res.status(400).json({
                mensaje: 'No se pueden quitar sectores que ya tienen jornadas ejecutadas. Reduzca el recorrido creando una ruta nueva.'
              });
            }
            throw errBorrado;
          }
        }

        await client.query('COMMIT');
      } catch (txError) {
        await client.query('ROLLBACK');
        client.release();
        throw txError;
      }
      client.release();
    }

    // Sincronizar asignaciones semanales con el cambio
    if (conductor_default_id !== undefined || vehiculo_id !== undefined) {
      await pool.query(
        `UPDATE asignaciones_semanales 
         SET conductor_id = COALESCE($1, conductor_id),
             vehiculo_id = COALESCE($2, vehiculo_id)
         WHERE ruta_fija_id = $3 AND estado = 'pendiente' AND fecha >= CURRENT_DATE`,
        [conductor_default_id, vehiculo_id, id]
      );
    }
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
    const placaUpper = placa.toUpperCase();
    
    // Verificar si el vehículo ya existe
    const existeVehiculo = await pool.query('SELECT id, activo FROM vehiculos WHERE placa = $1', [placaUpper]);
    
    if (existeVehiculo.rows.length > 0) {
      const v = existeVehiculo.rows[0];
      if (v.activo) {
        return res.status(400).json({ mensaje: 'Ya existe un vehículo registrado y activo con esa placa.' });
      } else {
        // Reactivar
        const resultado = await pool.query(
          'UPDATE vehiculos SET modelo = $1, capacidad_ton = $2, activo = TRUE WHERE id = $3 RETURNING *',
          [modelo, cap, v.id]
        );
        await registrarActividad(
          req.usuario?.id, 
          'Reactivación de Vehículo', 
          'vehiculos', 
          v.id, 
          `Se reactivó el vehículo previamente inactivo: ${placaUpper}`
        );
        return res.status(200).json({ 
          mensaje: 'El vehículo estaba inactivo y ha sido reactivado exitosamente con los nuevos datos.', 
          vehiculo: resultado.rows[0] 
        });
      }
    }

    const resultado = await pool.query(
      'INSERT INTO vehiculos (placa, modelo, capacidad_ton, activo) VALUES ($1, $2, $3, TRUE) RETURNING *',
      [placaUpper, modelo, cap]
    );
    // Auditoría
    await registrarActividad(
      req.usuario?.id, 
      'Registro de Vehículo', 
      'vehiculos', 
      resultado.rows[0].id, 
      `Se registró el vehículo: ${placaUpper}`
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

// Eliminar vehículo
const eliminarVehiculo = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Verificar si está en rutas fijas activas
    const rutasActivas = await pool.query(
      `SELECT id, nombre FROM rutas_fijas WHERE vehiculo_id = $1 LIMIT 1`,
      [id]
    );
    if (rutasActivas.rows.length > 0) {
      return res.status(400).json({ 
        mensaje: `No se puede eliminar: El vehículo está asignado a la ruta "${rutasActivas.rows[0].nombre}". Debes editar la ruta y cambiar el vehículo primero.` 
      });
    }

    // 2. Verificar si tiene asignaciones pendientes o activas actuales/futuras
    const asignacionesPendientes = await pool.query(
      `SELECT id FROM asignaciones_semanales 
       WHERE vehiculo_id = $1 
         AND estado IN ('activa', 'pendiente') 
         AND fecha >= CURRENT_DATE 
       LIMIT 1`,
      [id]
    );
    if (asignacionesPendientes.rows.length > 0) {
      return res.status(400).json({ 
        mensaje: 'No se puede eliminar: El vehículo tiene asignaciones de ruta pendientes o en curso.' 
      });
    }

    const resultado = await pool.query(
      `DELETE FROM vehiculos WHERE id = $1 RETURNING id, placa`,
      [id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Vehículo no encontrado' });
    }

    await registrarActividad(
      req.usuario?.id,
      'Eliminación de Vehículo',
      'vehiculos',
      id,
      `Se eliminó el vehículo: ${resultado.rows[0].placa}`
    );
    res.json({ mensaje: 'Vehículo eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar vehículo:', error.message);
    if (error.code === '23503') {
      try {
        const inactivado = await pool.query(
          `UPDATE vehiculos SET activo = FALSE WHERE id = $1 RETURNING id, placa`,
          [id]
        );
        if (inactivado.rows.length > 0) {
          await registrarActividad(
            req.usuario?.id,
            'Inactivación de Vehículo',
            'vehiculos',
            id,
            `Se inactivó el vehículo debido a historial operativo: ${inactivado.rows[0].placa}`
          );
          return res.json({ mensaje: 'El vehículo fue inactivado exitosamente (no pudo ser borrado definitivamente debido a historial operativo asociado).' });
        }
      } catch (inactivarError) {
        console.error('Error al inactivar vehículo:', inactivarError.message);
      }
    }
    res.status(500).json({ mensaje: 'Error interno al eliminar vehículo' });
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
        mensaje: `El nuevo horario se solapa con la jornada "${solapas[0].nombre}" (${solapas[0].hora_inicio} - ${solapas[0].hora_limite_fin}).`
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
      `Se editó la jornada: ${resultado.rows[0].nombre}`
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
    const rutaParaRestaurar = await pool.query(
      'SELECT nombre, conductor_default_id, vehiculo_id, jornada_id, dias_semana_arr FROM rutas_fijas WHERE id = $1',
      [id]
    );

    if (rutaParaRestaurar.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Ruta no encontrada' });
    }

    const { conductor_default_id, vehiculo_id, jornada_id, dias_semana_arr } = rutaParaRestaurar.rows[0];

    // REGLA DE ORO
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
      const coincidencia = dias_semana_arr.filter(diaN => 
        diasOcupados.some(diaO => diaN === diaO)
      );

      if (coincidencia.length > 0) {
        const esConductor = ruta.conductor_default_id == conductor_default_id;
        const sujeto = esConductor ? `El conductor` : `El vehículo`;
        const razon = esConductor ? `ya tiene asignada la ruta "${ruta.nombre}"` : `ya está siendo usado en la ruta "${ruta.nombre}"`;
        
        return res.status(400).json({ 
          mensaje: `❌ Error de Logística al Restaurar: ${sujeto} ${razon} para los días: [${coincidencia.join(', ')}] en la misma jornada. Libere el horario antes de restaurar.` 
        });
      }
    }

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

const obtenerRecursosLibres = async (req, res) => {
  try {
    const resultConductores = await pool.query(`
      SELECT id, nombre
      FROM usuarios 
      WHERE rol = 'conductor' AND activo = TRUE 
      AND id NOT IN (
        SELECT conductor_id 
        FROM asignaciones_semanales 
        WHERE fecha = CURRENT_DATE AND estado = 'activa'
      )
    `);

    const resultVehiculos = await pool.query(`
      SELECT v.id, v.placa, v.capacidad_ton 
      FROM vehiculos v 
      WHERE v.activo = TRUE 
      AND v.id NOT IN (
        SELECT COALESCE(a.vehiculo_id, rf.vehiculo_id) 
        FROM asignaciones_semanales a 
        JOIN rutas_fijas rf ON a.ruta_fija_id = rf.id 
        WHERE a.fecha = CURRENT_DATE AND a.estado = 'activa'
      )
    `);

    res.json({
      conductores: resultConductores.rows,
      vehiculos: resultVehiculos.rows
    });
  } catch (error) {
    console.error("Error al obtener recursos libres:", error);
    res.status(500).json({ mensaje: 'Error al obtener recursos libres' });
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
  eliminarVehiculo,
  crearJornada,
  editarJornada,
  obtenerRecursosLibres
};