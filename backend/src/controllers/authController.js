const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
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
    const resultado = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1 AND activo = TRUE',
      [email]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ mensaje: 'Credenciales incorrectas.' });
    }

    const usuario = resultado.rows[0];

    // Verificar contraseña
    const passwordValida = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValida) {
      return res.status(401).json({ mensaje: 'Credenciales incorrectas.' });
    }

    // Generar token JWT
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

// Registrar conductor (solo admin)
const registrarConductor = async (req, res) => {
  const { nombre, email, password, cedula, telefono } = req.body;

  try {
    // Validar campos
    if (!nombre || !email || !password) {
      return res.status(400).json({ mensaje: 'Nombre, email y contraseña son obligatorios.' });
    }

    // Verificar email duplicado
    const emailExiste = await pool.query(
      'SELECT id FROM usuarios WHERE email = $1',
      [email]
    );
    if (emailExiste.rows.length > 0) {
      return res.status(400).json({ mensaje: 'El email ya está registrado.' });
    }

    // Encriptar contraseña
    const hash = await bcrypt.hash(password, 10);

    // Guardar en BD
    const resultado = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol) 
       VALUES ($1, $2, $3, 'conductor') RETURNING id, nombre, email, rol`,
      [nombre, email, hash]
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

// Obtener perfil del usuario autenticado
const obtenerPerfil = async (req, res) => {
  try {
    const resultado = await pool.query(
      'SELECT id, nombre, email, rol, created_at FROM usuarios WHERE id = $1',
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

module.exports = { login, registrarConductor, obtenerPerfil };