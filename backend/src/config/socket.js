const socketIo = require('socket.io');

let io;

const iniciarSocket = (server) => {
  io = socketIo(server, {
    cors: { origin: 'http://localhost:3001', methods: ['GET', 'POST'] }
  });

  io.on('connection', (socket) => {
    console.log(`Socket conectado: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`Socket desconectado: ${socket.id}`);
    });
  });

  return io;
};

const getIo = () => io;

module.exports = { iniciarSocket, getIo };