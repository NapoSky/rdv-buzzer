const { Room } = require('../../models/Room');
const logger = require('../../utils/logger');

/**
 * Gère la connexion d'un spectateur à une salle
 */
function handleJoinAsSpectator(socket, io, data) {
  const { roomCode } = data;
  
  try {
    const room = Room.get(roomCode);
    if (!room) {
      return socket.emit('error', { message: 'Salle introuvable' });
    }

    // MODIFICATION : Rejoindre la room Socket.IO normale pour recevoir TOUS les événements
    socket.join(roomCode);
    
    logger.info('SPECTATOR', 'Spectateur rejoint la salle', {
      socketId: socket.id,
      roomCode
    });

    // Ajouter les statuts de connexion aux données des joueurs
    const playersWithConnectionStatus = {};
    Object.keys(room.players).forEach(playerId => {
      playersWithConnectionStatus[playerId] = {
        ...room.players[playerId],
        connected: io.sockets.sockets.has(playerId)
      };
    });

    // Envoyer les données initiales
    socket.emit('spectator_room_data', {
      roomCode,
      players: playersWithConnectionStatus,
      options: room.options,
      currentTrack: room.currentTrack,
      artistFound: room.artistFound || false,
      titleFound: room.titleFound || false,
      buzzedBy: room.firstBuzz ? room.players[room.firstBuzz]?.pseudo : '',
      paused: room.paused || false
    });

  } catch (error) {
    logger.error('SPECTATOR', 'Erreur lors de la connexion spectateur', error);
    socket.emit('error', { message: 'Erreur de connexion' });
  }
}

/**
 * Met à jour les données pour les spectateurs quand il y a des changements
 */
function broadcastSpectatorUpdate(io, roomCode, room) {
  try {
    // Ajouter les statuts de connexion aux données des joueurs
    const playersWithConnectionStatus = {};
    Object.keys(room.players).forEach(playerId => {
      playersWithConnectionStatus[playerId] = {
        ...room.players[playerId],
        connected: io.sockets.sockets.has(playerId)
      };
    });

    // Envoyer la mise à jour aux spectateurs de cette salle
    io.to(roomCode).emit('spectator_room_data', {
      roomCode,
      players: playersWithConnectionStatus,
      options: room.options,
      currentTrack: room.currentTrack,
      artistFound: room.artistFound || false,
      titleFound: room.titleFound || false,
      buzzedBy: room.firstBuzz ? room.players[room.firstBuzz]?.pseudo : '',
      paused: room.paused || false
    });

  } catch (error) {
    logger.error('SPECTATOR', 'Erreur lors de la diffusion spectateur', error);
  }
}

/**
 * Attache les événements de spectateur au socket
 */
function attachEvents(socket, io) {
  socket.on('join_as_spectator', (data) => handleJoinAsSpectator(socket, io, data));
}

module.exports = {
  attachEvents,
  broadcastSpectatorUpdate
};