const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config();

let io;

// Orígenes autorizados. En desarrollo se permite localhost; para exponer el
// sistema con ngrok basta añadir la URL pública en FRONTEND_URL (.env).
const origenesPermitidos = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// Direcciones de red local (el celular entrando por la IP LAN del equipo).
const PATRON_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

// Tuneles de demostracion (ngrok y equivalentes). Solo fuera de produccion.
const PATRON_TUNEL = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(ngrok-free\.app|ngrok\.app|ngrok\.io|ngrok-free\.dev|trycloudflare\.com|loca\.lt)$/i;

/**
 * Decide si un Origin puede hablar con la API.
 *
 * `host` es la cabecera Host de la peticion. Es imprescindible: el backend
 * sirve el build de React, de modo que a traves de ngrok el navegador pide a su
 * propio origen, pero aun asi manda la cabecera Origin en todo POST, PUT y
 * DELETE (la especificacion de Fetch la incluye en cualquier metodo que no sea
 * GET o HEAD). Sin comparar Origin contra Host, esas peticiones se rechazaban
 * como si vinieran de otro sitio: entrar desde el celular devolvia error en el
 * login, en el registro de ciudadano y en toda la operacion del conductor,
 * mientras las lecturas GET seguian funcionando.
 */
const esOrigenPermitido = (origin, host) => {
  if (!origin) return true;                       // apps nativas / same-origin
  if (origenesPermitidos.includes(origin)) return true;
  if (host && (origin === `https://${host}` || origin === `http://${host}`)) return true;
  if (process.env.NODE_ENV !== 'production') {
    if (PATRON_LOCAL.test(origin)) return true;
    if (PATRON_TUNEL.test(origin)) return true;
  }
  return false;
};

const iniciarSocket = (server) => {
  io = socketIo(server, {
    // Delegado con acceso a la peticion completa: el handshake de WebSocket
    // siempre lleva Origin, incluso cuando la pagina y el socket comparten
    // origen, asi que hace falta el Host para reconocerlo como mismo origen.
    cors: (req, callback) => callback(null, {
      origin: esOrigenPermitido(req.headers.origin, req.headers.host),
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true
    })
  });

  // Validar token JWT al conectar
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) {
      return next(new Error('Acceso denegado. Token no proporcionado.'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.usuario = decoded;
      next();
    } catch (err) {
      return next(new Error('Token inválido o expirado.'));
    }
  });

  io.on('connection', (socket) => {
    const usuario = socket.data.usuario;

    // Salas por usuario y por rol (RF-10.2, RF-10.3, RI-SW.2).
    // Desde la migración 010 los tres roles comparten el espacio de ids de
    // usuarios, de modo que `usuario:ID` identifica a una única persona.
    if (usuario?.id) socket.join(`usuario:${usuario.id}`);
    if (['administrador', 'conductor', 'ciudadano'].includes(usuario?.rol)) {
      socket.join(`rol:${usuario.rol}`);
    }



    socket.on('disconnect', () => {});
  });

  return io;
};

const getIo = () => io;

/** Emite un evento sólo a los administradores conectados. */
const emitirAdmins = (evento, payload) => {
  if (io) io.to('rol:administrador').emit(evento, payload);
};

/** Emite un evento a un usuario concreto (sala usuario:ID). */
const emitirUsuario = (usuarioId, evento, payload) => {
  if (io && usuarioId) io.to(`usuario:${usuarioId}`).emit(evento, payload);
};

module.exports = { iniciarSocket, getIo, emitirAdmins, emitirUsuario, esOrigenPermitido };
