// src/socket/index.js
const { Server } = require('socket.io');
const roomHandlers = require('./handlers/roomHandlers');
const buzzHandlers = require('./handlers/buzzHandlers');
const playerHandlers = require('./handlers/playerHandlers');
const spectatorHandlers = require('./handlers/spectatorHandlers');
const logger = require('../utils/logger');

let io;

/**
 * Initialise Socket.IO avec le serveur HTTP
 * @param {http.Server} server - Serveur HTTP
 */
function initialize(server) {
  // Configuration Socket.IO avec options de performance et de sécurité
  io = new Server(server, {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN || '*',
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000
  });

  // Configuration des événements de connexion
  io.on('connection', (socket) => {
    logger.info('SOCKET', 'Nouvelle connexion établie', {
      socketId: socket.id,
      transport: socket.conn.transport.name,
      userAgent: socket.handshake.headers['user-agent']
    });

    // Configuration des handlers pour les différents types d'événements
    configureSocketHandlers(socket);

    // Gestion de la déconnexion
    socket.on('disconnect', (reason) => {
      logger.info('SOCKET', 'Déconnexion', {
        socketId: socket.id,
        reason
      });
    });

    // Ping-pong pour le debugging de connexion
    socket.on('ping', (data, callback) => {
      if (typeof callback === 'function') {
        callback({ time: Date.now(), received: true });
      }
    });
  });

  logger.info('SOCKET', 'Socket.IO initialisé');
  
  return io;
}

/**
 * Configure tous les handlers d'événements pour un socket
 * @param {Socket} socket - Socket client
 */
function configureSocketHandlers(socket) {
  // Événements de salle
  roomHandlers.attachEvents(socket, io);
  
  // Événements de buzz
  buzzHandlers.attachEvents(socket, io);
  
  // Événements de joueur
  playerHandlers.attachEvents(socket, io);
  
  // Événements de spectateur
  spectatorHandlers.attachEvents(socket, io);
}

/**
 * Récupère l'instance Socket.IO
 * @returns {Server} - Instance Socket.IO
 */
function getIO() {
  if (!io) {
    throw new Error("Socket.IO n'a pas été initialisé");
  }
  return io;
}

module.exports = initialize;
module.exports.getIO = getIO;