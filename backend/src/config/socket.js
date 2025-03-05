// src/config/socket.js
const socketConfig = {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000
};

module.exports = {
  socketConfig
};