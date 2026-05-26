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
    const usuario = socket.data.usuario;
    if (usuario?.id) socket.join(`usuario:${usuario.id}`);
    if (usuario?.rol) socket.join(`rol:${usuario.rol}`);

    console.log(`Socket conectado: ${socket.id}`);
    
    // El conductor envía su ubicación simulada
    socket.on('actualizar_ubicacion', async (data) => {
      if (usuario?.rol !== 'conductor' || !data?.asignacion_id) return;

      try {
        const pool = require('./database');
        const asignacion = await pool.query(
          `SELECT id FROM asignaciones_semanales
           WHERE id = $1 AND conductor_id = $2 AND estado = 'activa'`,
          [data.asignacion_id, usuario.id]
        );

        if (asignacion.rows.length === 0) return;
        io.emit('ubicacion_vehiculo', data);
      } catch (error) {
        console.error('Error validando ubicacion socket:', error.message);
      }
    });

    // El conductor envía una novedad
    socket.on('enviar_novedad', (data) => {
      if (usuario?.rol !== 'conductor') return;
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
