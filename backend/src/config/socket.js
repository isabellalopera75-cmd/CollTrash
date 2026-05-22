const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config();

let io;

const iniciarSocket = (server) => {
  io = socketIo(server, {
    cors: { 
      origin: function (origin, callback) { callback(null, true); }, 
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true
    }
  });

  // Validar token JWT al conectar
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) {
      console.log(`❌ Conexión WebSocket denegada: sin token.`);
      return next(new Error('Acceso denegado. Token no proporcionado.'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.usuario = decoded;
      next();
    } catch (err) {
      console.log(`❌ Conexión WebSocket denegada: token inválido.`);
      return next(new Error('Token inválido o expirado.'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket conectado: ${socket.id}`);
    
    // El conductor envía su ubicación simulada
    socket.on('actualizar_ubicacion', (data) => {
      // Emitimos a todos (el panel de admin lo escuchará)
      io.emit('ubicacion_vehiculo', data);
    });

    // El conductor envía una novedad
    socket.on('enviar_novedad', (data) => {
      io.emit('nueva_novedad', data);
    });

    socket.on('disconnect', () => {
      console.log(`Socket desconectado: ${socket.id}`);
    });
  });

  return io;
};

const getIo = () => io;

module.exports = { iniciarSocket, getIo };