const socketIo = require('socket.io');

let io;

const iniciarSocket = (server) => {
  io = socketIo(server, {
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
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