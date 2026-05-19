const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { registrarActividad } = require('../services/auditoriaService');
require('dotenv').config();

// Login admin y conductor
const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validar campos
    if (!email || !password) {
      return res.status(400).json({ mensaje: 'Email y contraseña son obligatorios.' });
    }

    // Buscar usuario en BD
    let resultado = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1 AND activo = TRUE',
      [email]
    );

    let usuario = null;
    let rolFijo = null;

    if (resultado.rows.length > 0) {
      usuario = resultado.rows[0];
      rolFijo = usuario.rol;
    } else {
      // Buscar en ciudadanos
      resultado = await pool.query('SELECT * FROM ciudadanos WHERE email = $1', [email]);
      if (resultado.rows.length > 0) {
        usuario = resultado.rows[0];
        rolFijo = 'ciudadano';
      }
    }

    if (!usuario) {
      return res.status(401).json({ mensaje: 'Credenciales incorrectas.' });
    }


    // Verificar contraseña
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValida) {
      return res.status(401).json({ mensaje: 'Credenciales incorrectas.' });
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: rolFijo, nombre: usuario.nombre },
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
        rol: rolFijo
      }
    });

  } catch (error) {
    console.error('Error en login:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Registrar conductor (solo admin)
const registrarConductor = async (req, res) => {
  const { nombre, email, password, cedula, telefono } = req.body;

  // Normalizar: strings vacíos → null
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

    // Verificar duplicados
    const emailExiste = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (emailExiste.rows.length > 0) {
      return res.status(400).json({ mensaje: 'Ya existe un conductor con ese correo electrónico.' });
    }
    if (cedulaNorm) {
      const cedulaExiste = await pool.query('SELECT id FROM usuarios WHERE cedula = $1', [cedulaNorm]);
      if (cedulaExiste.rows.length > 0) {
        return res.status(400).json({ mensaje: 'Ya existe un conductor registrado con esa cédula.' });
      }
    }
    if (telefonoNorm) {
      const telExiste = await pool.query('SELECT id FROM usuarios WHERE telefono = $1', [telefonoNorm]);
      if (telExiste.rows.length > 0) {
        return res.status(400).json({ mensaje: 'Ya existe un conductor registrado con ese número de teléfono.' });
      }
    }

    const hash = await bcrypt.hash(password, 10);
    const resultado = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, cedula, telefono) 
       VALUES ($1, $2, $3, 'conductor', $4, $5) RETURNING id, nombre, email, rol`,
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
    console.error('Error al registrar conductor:', error.message);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
};

// Editar conductor
const editarConductor = async (req, res) => {
  const { id } = req.params;
  const { nombre, email, cedula, telefono, password } = req.body;

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
    let resultado;
    
    if (req.usuario.rol === 'ciudadano') {
      resultado = await pool.query(
        'SELECT id, nombre, email, \'ciudadano\' as rol, created_at FROM ciudadanos WHERE id = $1',
        [req.usuario.id]
      );
    } else {
      resultado = await pool.query(
        'SELECT id, nombre, email, rol, created_at FROM usuarios WHERE id = $1',
        [req.usuario.id]
      );
    }

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
    if (!nombre || !email || !password) {
      return res.status(400).json({ mensaje: 'Nombre, email y contraseña son obligatorios.' });
    }

    // Verificar si el email ya existe en usuarios o ciudadanos
    const existeUsuario = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existeUsuario.rows.length > 0) {
      return res.status(400).json({ mensaje: 'El correo electrónico ya está registrado en el sistema.' });
    }

    const existeCiudadano = await pool.query('SELECT id FROM ciudadanos WHERE email = $1', [email]);
    if (existeCiudadano.rows.length > 0) {
      return res.status(400).json({ mensaje: 'El correo electrónico ya está registrado como ciudadano.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const resultado = await pool.query(
      `INSERT INTO ciudadanos (nombre, email, password_hash, barrio_id) 
       VALUES ($1, $2, $3, $4) RETURNING id, nombre, email`,
      [nombre, email, hash, barrio_id || null]
    );

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

module.exports = { login, registrarConductor, editarConductor, obtenerPerfil, registrarCiudadano };