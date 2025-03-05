// src/socket/handlers/playerHandlers.js
const { Room } = require('../../models/Room');
const logger = require('../../utils/logger');

/**
 * Attache les événements de joueur au socket
 * @param {Socket} socket - Socket client
 * @param {Server} io - Instance Socket.IO
 */
function attachEvents(socket, io) {
  // Mise à jour du score d'un joueur
  socket.on('update_score', (data) => handleUpdateScore(socket, io, data));
}

/**
 * Gère la mise à jour du score d'un joueur
 */
function handleUpdateScore(socket, io, data) {
  try {
    const { roomCode, playerId, score } = data;
    const room = Room.get(roomCode);
    
    if (!room) return;
    if (room.adminId !== socket.id) return;
    
    // Vérifier que le score n'est pas négatif
    const validScore = Math.max(0, score);
    
    if (room.players[playerId]) {
      room.players[playerId].score = validScore;
      io.to(roomCode).emit('update_players', room.players);
      
      logger.info('PLAYERS', 'Score mis à jour', {
        roomCode,
        playerId,
        pseudo: room.players[playerId].pseudo,
        score: validScore
      });
    }
  } catch (error) {
    logger.error('PLAYERS', 'Erreur lors de la mise à jour du score', error);
  }
}

module.exports = {
  attachEvents
};