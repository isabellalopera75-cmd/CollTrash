const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { registrarActividad } = require('../services/auditoriaService');
require('dotenv').config();

// Política de bloqueo por cuenta ante intentos fallidos consecutivos.
const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;

// Login para los tres roles (administrador, conductor y ciudadano)
const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validar campos
    if (!email || typeof email !== 'string' || !password) {
      return res.status(400).json({ mensaje: 'Email y contraseña son obligatorios.' });
    }

    // El correo se compara siempre normalizado. Antes login usaba `email = $1`
    // mientras verificar-correo usaba lower(), de modo que podían coexistir
    // cuentas que sólo diferían en mayúsculas y quien se registraba con
    // mayúsculas no lograba entrar escribiendo su correo en minúsculas.
    const resultado = await pool.query(
      'SELECT * FROM usuarios WHERE lower(email) = lower($1) AND activo = TRUE',
      [email.trim()]
    );

    const usuario = resultado.rows[0] || null;

    // Un usuario sin hash utilizable no puede autenticarse. Se responde igual
    // que ante un correo inexistente para no revelar qué cuentas existen, y se
    // evita que bcrypt.compare lance una excepción con un hash nulo.
    if (!usuario || !usuario.password_hash) {
      return res.status(401).json({ mensaje: 'Credenciales incorrectas.' });
    }

    // Cuenta bloqueada por acumular fallos. Se responde 429 y no 401: un 401
    // haría que el frontend destruyera la sesión (RF-01.5 / RNF-05).
    if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
      const minutosRestantes = Math.ceil((new Date(usuario.bloqueado_hasta) - new Date()) / 60000);
      return res.status(429).json({
        mensaje: `Cuenta bloqueada temporalmente por intentos fallidos. Intente de nuevo en ${minutosRestantes} minuto(s).`,
        bloqueada: true,
        minutos_restantes: minutosRestantes
      });
    }

    // Verificar contraseña
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValida) {
      // El conteo es por cuenta, no por IP: detrás de ngrok o de un NAT todos
      // los usuarios comparten dirección, así que el limitador por IP castiga a
      // los legítimos sin encarecer el ataque contra una cuenta concreta.
      const fallos = await pool.query(
        `UPDATE usuarios
            SET intentos_fallidos = intentos_fallidos + 1,
                bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= $2
                                       THEN NOW() + make_interval(mins => $3)
                                       ELSE bloqueado_hasta END
          WHERE id = $1
          RETURNING intentos_fallidos, bloqueado_hasta`,
        [usuario.id, MAX_INTENTOS, MINUTOS_BLOQUEO]
      );

      const { intentos_fallidos, bloqueado_hasta } = fallos.rows[0];

      if (bloqueado_hasta && new Date(bloqueado_hasta) > new Date()) {
        return res.status(429).json({
          mensaje: `Cuenta bloqueada por ${MINUTOS_BLOQUEO} minutos tras ${MAX_INTENTOS} intentos fallidos.`,
          bloqueada: true,
          minutos_restantes: MINUTOS_BLOQUEO
        });
      }

      const restantes = MAX_INTENTOS - intentos_fallidos;
      return res.status(401).json({
        mensaje: `Credenciales incorrectas. Le quedan ${restantes} intento(s) antes del bloqueo temporal.`,
        intentos_restantes: restantes
      });
    }

    // Ingreso correcto: se reinicia el contador y se levanta cualquier bloqueo.
    if (usuario.intentos_fallidos > 0 || usuario.bloqueado_hasta) {
      await pool.query(
        'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1',
        [usuario.id]
      );
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(200).json({
      mensaje: 'Login exitoso.',
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol
      }
    });

  } catch (error) {
    console.error('Error en login:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

const registrarConductor = async (req, res) => {
  const { nombre, password, cedula, telefono } = req.body;

  // Normalizar: strings vacíos → null, correo siempre en minúsculas
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : req.body.email;
  const cedulaNorm = cedula && cedula.trim() !== '' ? cedula.trim() : null;
  const telefonoNorm = telefono && telefono.trim() !== '' ? telefono.trim() : null;

  if (telefonoNorm && telefonoNorm.length !== 10) {
    return res.status(400).json({ mensaje: 'El número de teléfono debe tener exactamente 10 dígitos.' });
  }

  if (nombre && /[0-9]/.test(nombre)) {
    return res.status(400).json({ mensaje: 'El nombre no puede contener números.' });
  }

  if (cedulaNorm && !/^[0-9]+$/.test(cedulaNorm)) {
    return res.status(400).json({ mensaje: 'La cédula solo debe contener números.' });
  }

  try {
    if (!nombre || !email || !password) {
      return res.status(400).json({ mensaje: 'Nombre, email y contraseña son obligatorios.' });
    }

    // 1. Verificar si existe por cédula (para reactivar si está inactivo)
    if (cedulaNorm) {
      const existeCedula = await pool.query('SELECT id, activo FROM usuarios WHERE cedula = $1', [cedulaNorm]);
      if (existeCedula.rows.length > 0) {
        const usuarioExistente = existeCedula.rows[0];
        if (usuarioExistente.activo) {
          return res.status(400).json({ mensaje: 'Ya existe un conductor registrado y activo con esa cédula.' });
        } else {
          // Está inactivo, procedemos a reactivar
          // Verificar que el email no esté usado por otro
          const emailOcupado = await pool.query('SELECT id FROM usuarios WHERE email = $1 AND id != $2', [email, usuarioExistente.id]);
          if (emailOcupado.rows.length > 0) {
            return res.status(400).json({ mensaje: 'No se puede reactivar: el correo ya está en uso por otro usuario.' });
          }
          
          const hash = await bcrypt.hash(password, 10);
          const resultado = await pool.query(
            `UPDATE usuarios SET nombre = $1, email = $2, password_hash = $3, telefono = $4, activo = TRUE WHERE id = $5 RETURNING id, nombre, email, rol`,
            [nombre, email, hash, telefonoNorm, usuarioExistente.id]
          );

          await registrarActividad(
            req.usuario?.id, 
            'Reactivación de Conductor', 
            'usuarios', 
            usuarioExistente.id, 
            `Se reactivó al conductor previamente inactivo: ${nombre} (${email})`
          );

          return res.status(200).json({
            mensaje: 'El conductor estaba inactivo y ha sido reactivado exitosamente con los nuevos datos.',
            conductor: resultado.rows[0]
          });
        }
      }
    }

    // Flujo normal de creación (no existe la cédula)
    // Verificar duplicados de email y teléfono para creación nueva
    const emailExiste = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (emailExiste.rows.length > 0) {
      return res.status(400).json({ mensaje: 'Ya existe un usuario con ese correo electrónico.' });
    }
    
    if (telefonoNorm) {
      const telExiste = await pool.query('SELECT id FROM usuarios WHERE telefono = $1', [telefonoNorm]);
      if (telExiste.rows.length > 0) {
        return res.status(400).json({ mensaje: 'Ya existe un conductor registrado con ese número de teléfono.' });
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const resultado = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, cedula, telefono, activo) 
       VALUES ($1, $2, $3, 'conductor', $4, $5, TRUE) RETURNING id, nombre, email, rol`,
      [nombre, email, hash, cedulaNorm, telefonoNorm]
    );

    // Auditoría
    await registrarActividad(
      req.usuario?.id, 
      'Registro de Conductor', 
      'usuarios', 
      resultado.rows[0].id, 
      `Se registró al conductor: ${nombre} (${email})`
    );

    res.status(201).json({
      mensaje: 'Conductor registrado exitosamente.',
      conductor: resultado.rows[0]
    });

  } catch (error) {
    // Las restricciones únicas de correo y cédula son la única garantía real
    // frente a peticiones simultáneas: las comprobaciones previas con SELECT
    // dejan una ventana en la que dos registros idénticos pasan ambos.
    if (error.code === '23505') {
      const detalle = /cedula/.test(error.constraint || '') ? 'esa cédula'
        : /telefono/.test(error.constraint || '') ? 'ese número de teléfono'
        : 'ese correo electrónico';
      return res.status(400).json({ mensaje: `Ya existe un usuario registrado con ${detalle}.` });
    }
    console.error('Error al registrar conductor:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Editar conductor
const editarConductor = async (req, res) => {
  const { id } = req.params;
  const { nombre, cedula, telefono, password } = req.body;

  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : req.body.email;
  const cedulaNorm = cedula && cedula.trim() !== '' ? cedula.trim() : null;
  const telefonoNorm = telefono && telefono.trim() !== '' ? telefono.trim() : null;

  if (telefonoNorm && telefonoNorm.length !== 10) {
    return res.status(400).json({ mensaje: 'El número de teléfono debe tener exactamente 10 dígitos.' });
  }

  if (nombre && /[0-9]/.test(nombre)) {
    return res.status(400).json({ mensaje: 'El nombre no puede contener números.' });
  }

  if (cedulaNorm && !/^[0-9]+$/.test(cedulaNorm)) {
    return res.status(400).json({ mensaje: 'La cédula solo debe contener números.' });
  }

  try {
    // Verificar unicidad excluyendo el conductor actual
    if (cedulaNorm) {
      const cedulaExiste = await pool.query('SELECT id FROM usuarios WHERE cedula = $1 AND id != $2', [cedulaNorm, id]);
      if (cedulaExiste.rows.length > 0) {
        return res.status(400).json({ mensaje: 'Ya existe otro conductor con esa cédula.' });
      }
    }
    if (telefonoNorm) {
      const telExiste = await pool.query('SELECT id FROM usuarios WHERE telefono = $1 AND id != $2', [telefonoNorm, id]);
      if (telExiste.rows.length > 0) {
        return res.status(400).json({ mensaje: 'Ya existe otro conductor con ese número de teléfono.' });
      }
    }

    // Si viene contraseña, la actualizamos también
    let hashNuevo = null;
    if (password && password.trim() !== '') {
      hashNuevo = await bcrypt.hash(password, 10);
    }

    const resultado = await pool.query(
      `UPDATE usuarios 
       SET nombre = COALESCE($1, nombre),
           email = COALESCE($2, email),
           cedula = $3,
           telefono = $4,
           password_hash = COALESCE($5, password_hash)
       WHERE id = $6 AND rol = 'conductor' RETURNING id, nombre, email, cedula, telefono`,
      [nombre, email, cedulaNorm, telefonoNorm, hashNuevo, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Conductor no encontrado' });
    }

    // Auditoría
    await registrarActividad(
      req.usuario?.id, 
      'Edición de Conductor', 
      'usuarios', 
      id, 
      `Se actualizaron los datos del conductor: ${resultado.rows[0].nombre}`
    );

    res.json({ mensaje: 'Conductor actualizado exitosamente', conductor: resultado.rows[0] });
  } catch (error) {
    console.error('Error al editar conductor:', error.message);
    res.status(500).json({ mensaje: 'Error interno al editar conductor' });
  }
};

// Obtener perfil del usuario autenticado
const obtenerPerfil = async (req, res) => {
  try {
    // Los tres roles viven en la misma tabla desde la migración 010, por lo que
    // el perfil se resuelve con una sola consulta sin ramificar por rol.
    const resultado = await pool.query(
      'SELECT id, nombre, email, rol, created_at, barrio_id FROM usuarios WHERE id = $1 AND activo = TRUE',
      [req.usuario.id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
    }

    res.status(200).json({ usuario: resultado.rows[0] });

  } catch (error) {
    console.error('Error al obtener perfil:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Registrar ciudadano
const registrarCiudadano = async (req, res) => {
  const { nombre, email, password, barrio_id } = req.body;

  try {
    if (!nombre || !email || typeof email !== 'string' || !password) {
      return res.status(400).json({ mensaje: 'Nombre, email y contraseña son obligatorios.' });
    }

    const emailNorm = email.trim().toLowerCase();

    const hash = await bcrypt.hash(password, 10);

    // El correo se inserta directamente y se confía en el índice único
    // uq_usuarios_email_lower para detectar el duplicado. Comprobar antes con un
    // SELECT dejaba una ventana de carrera entre la consulta y el INSERT que
    // permitía crear dos cuentas con el mismo correo en peticiones simultáneas.
    let resultado;
    try {
      resultado = await pool.query(
        `INSERT INTO usuarios (nombre, email, password_hash, rol, barrio_id, activo)
         VALUES ($1, $2, $3, 'ciudadano', $4, TRUE) RETURNING id, nombre, email`,
        [nombre, emailNorm, hash, barrio_id || null]
      );
    } catch (errInsert) {
      if (errInsert.code === '23505') {
        return res.status(400).json({ mensaje: 'El correo electrónico ya está registrado en el sistema.' });
      }
      throw errInsert;
    }

    const ciudadano = resultado.rows[0];

    // Generar token para autologueo
    const token = jwt.sign(
      { id: ciudadano.id, email: ciudadano.email, rol: 'ciudadano', nombre: ciudadano.nombre },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(201).json({
      mensaje: 'Ciudadano registrado exitosamente.',
      token,
      usuario: {
        id: ciudadano.id,
        nombre: ciudadano.nombre,
        email: ciudadano.email,
        rol: 'ciudadano'
      }
    });

  } catch (error) {
    console.error('Error al registrar ciudadano:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor al registrar ciudadano.' });
  }
};

const eliminarConductor = async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Verificar si el conductor está asignado por defecto a alguna ruta fija
    const rutasActivas = await pool.query(
      `SELECT id, nombre FROM rutas_fijas WHERE conductor_default_id = $1 LIMIT 1`,
      [id]
    );
    if (rutasActivas.rows.length > 0) {
      return res.status(400).json({ 
        mensaje: `No se puede eliminar: El conductor está asignado a la ruta "${rutasActivas.rows[0].nombre}". Debes editar la ruta y cambiar el conductor primero.` 
      });
    }

    // 2. Verificar si tiene asignaciones pendientes o activas actuales/futuras
    const asignacionesPendientes = await pool.query(
      `SELECT id FROM asignaciones_semanales 
       WHERE conductor_id = $1 
         AND estado IN ('activa', 'pendiente') 
         AND fecha >= CURRENT_DATE 
       LIMIT 1`,
      [id]
    );
    if (asignacionesPendientes.rows.length > 0) {
      return res.status(400).json({ 
        mensaje: 'No se puede eliminar: El conductor tiene asignaciones de ruta pendientes o en curso.' 
      });
    }

    // Si todo está bien, procedemos con la eliminación
    const resultado = await pool.query(
      `DELETE FROM usuarios WHERE id = $1 AND rol = 'conductor' RETURNING id, nombre`,
      [id]
    );
    
    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Conductor no encontrado' });
    }
    
    await registrarActividad(
      req.usuario?.id,
      'Eliminación de Conductor',
      'usuarios',
      id,
      `Se eliminó al conductor: ${resultado.rows[0].nombre}`
    );
    res.json({ mensaje: 'Conductor eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar conductor:', error.message);
    if (error.code === '23503') {
      // Inactivación lógica si hay registros asociados (Foreign Key Violation)
      try {
        const inactivado = await pool.query(
          `UPDATE usuarios SET activo = FALSE WHERE id = $1 AND rol = 'conductor' RETURNING id, nombre`,
          [id]
        );
        if (inactivado.rows.length > 0) {
          await registrarActividad(
            req.usuario?.id,
            'Inactivación de Conductor',
            'usuarios',
            id,
            `Se inactivó al conductor debido a historial operativo: ${inactivado.rows[0].nombre}`
          );
          return res.json({ mensaje: 'El conductor fue inactivado exitosamente (no pudo ser borrado definitivamente debido a historial operativo asociado).' });
        }
      } catch (inactivarError) {
        console.error('Error al inactivar conductor:', inactivarError.message);
      }
    }
    res.status(500).json({ mensaje: 'Error interno al eliminar conductor' });
  }
};

module.exports = { login, registrarConductor, editarConductor, eliminarConductor, obtenerPerfil, registrarCiudadano };