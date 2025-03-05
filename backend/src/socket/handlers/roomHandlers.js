// src/socket/handlers/roomHandlers.js
const { Room } = require('../../models/Room');
const { generateRoomCode } = require('../../utils/helpers');
const logger = require('../../utils/logger');

/**
 * Attache les événements de salle au socket
 * @param {Socket} socket - Socket client
 * @param {Server} io - Instance Socket.IO
 */
function attachEvents(socket, io) {
  // Création d'une salle
  socket.on('create_room', (callback) => handleCreateRoom(socket, callback));
  
  // Rejoindre une salle
  socket.on('join_room', (data, callback) => handleJoinRoom(socket, io, data, callback));
  
  // Mise en pause ou reprise de la partie
  socket.on('pause_game', (data) => handlePauseGame(socket, io, data));
  
  // Fermeture d'une salle
  socket.on('close_room', (data, callback) => handleCloseRoom(socket, io, data, callback));
  
  // Expulsion d'un joueur
  socket.on('kick_player', (data, callback) => handleKickPlayer(socket, io, data, callback));
  
  // Déconnexion
  socket.on('disconnect', (reason) => handleDisconnect(socket, io, reason));
}

/**
 * Crée une nouvelle salle
 */
function handleCreateRoom(socket, callback) {
  try {
    logger.info('ROOM', 'Tentative de création de salle', { socketId: socket.id });
    
    // Générer un code unique pour la salle
    const roomCode = generateRoomCode();
    
    // Initialiser la salle
    Room.create(roomCode, socket.id);
    
    // Faire rejoindre la salle au créateur
    socket.join(roomCode);
    
    logger.info('ROOM', 'Salle créée', { roomCode, socketId: socket.id });
    callback({ roomCode });
  } catch (error) {
    logger.error('ROOM', 'Erreur lors de la création de salle', error);
    callback({ error: 'Erreur lors de la création de la salle' });
  }
}

/**
 * Gère la connexion d'un joueur à une salle
 */
function handleJoinRoom(socket, io, data, callback) {
  const { roomCode, pseudo, isAdmin, forceOwnership } = data;
  
  try {
    // Vérification du pseudo
    if (pseudo && pseudo.length > 30) {
      return callback({ error: 'Le pseudo ne doit pas dépasser 30 caractères' });
    }
    
    const room = Room.get(roomCode);
    
    // Vérification de l'existence de la salle
    if (!room) {
      return callback({ closed: true });
    }
    
    // Cas de l'admin qui se reconnecte
    if (isAdmin) {
      if (!room.adminId || forceOwnership) {
        Room.setAdminId(roomCode, socket.id);
        Room.setPaused(roomCode, false);
        
        io.to(roomCode).emit('admin_connected');
        io.to(roomCode).emit('game_paused', { paused: false });
        
        // Chercher et supprimer l'ancien admin si présent
        const adminPlayerEntry = Object.entries(room.players)
          .find(([, player]) => player.isAdmin);
          
        if (adminPlayerEntry) {
          const [oldAdminId] = adminPlayerEntry;
          Room.removePlayer(roomCode, oldAdminId);
        }
        
        // Ajouter le joueur admin
        Room.addPlayer(roomCode, socket.id, {
          pseudo,
          score: 0,
          buzzed: false,
          isAdmin: true,
          disconnected: false
        });
        
        socket.join(roomCode);

        io.to(roomCode).emit('admin_connected');
        io.to(roomCode).emit('update_players', room.players);
        
        // Renvoyer l'état de la salle à l'admin qui se reconnecte
        if (room.lastBuzz) {
          socket.emit('buzzed', room.lastBuzz);
        }
        
        return callback({
          success: true,
          roomCode,
          pseudo,
          paused: false,
          isAdmin: true
        });
      }
    }
    
    // Vérification d'unicité du pseudo
    if (!isAdmin && Object.values(room.players).some(player => player.pseudo === pseudo)) {
      // Si le joueur existe déjà, restaurer ses informations
      const existingPlayer = Object.entries(room.players)
        .find(([id, player]) => player.pseudo === pseudo);
        
      if (existingPlayer) {
        const [existingPlayerId, playerData] = existingPlayer;
        Room.removePlayer(roomCode, existingPlayerId);
        Room.addPlayer(roomCode, socket.id, { ...playerData, disconnected: false });
        
        socket.join(roomCode);
        io.to(roomCode).emit('update_players', room.players);
        
        return callback({
          success: true,
          roomCode,
          pseudo,
          paused: room.paused
        });
      }
      
      return callback({ error: 'Ce pseudo est déjà pris' });
    }
    
    // Ajouter le joueur à la salle
    Room.addPlayer(roomCode, socket.id, {
      pseudo,
      score: 0,
      buzzed: false,
      isAdmin: !!isAdmin,
      disconnected: false
    });
    
    socket.join(roomCode);
    io.to(roomCode).emit('update_players', room.players);
    
    logger.info('ROOM', 'Joueur a rejoint la salle', {
      socketId: socket.id,
      roomCode,
      pseudo,
      isAdmin: !!isAdmin
    });
    
    callback({
      success: true,
      roomCode,
      pseudo,
      paused: room.paused
    });
    
  } catch (error) {
    logger.error('ROOM', 'Erreur lors de l\'inscription', error);
    callback({ error: 'Erreur interne lors de l\'inscription dans la salle' });
  }
}

/**
 * Gère la mise en pause ou reprise de la partie
 */
function handlePauseGame(socket, io, data) {
  try {
    const { roomCode, pause } = data;
    const room = Room.get(roomCode);
    
    if (!room) return;
    if (room.adminId !== socket.id) return;
    
    Room.setPaused(roomCode, pause);
    
    // Notifier tous les joueurs
    io.to(roomCode).emit('game_paused', { paused: pause });
    
    if (!pause) {
      // Lors de la reprise, réafficher que l'admin est présent
      io.to(roomCode).emit('admin_connected');
      io.to(roomCode).emit('update_players', room.players);
    }
    
    logger.info('ROOM', pause ? 'Partie mise en pause' : 'Partie reprise', {
      roomCode
    });
  } catch (error) {
    logger.error('ROOM', 'Erreur lors de la mise en pause/reprise', error);
  }
}

/**
 * Ferme une salle
 */
function handleCloseRoom(socket, io, data, callback) {
  try {
    const { roomCode } = data;
    const result = verifyRoomAndAdmin(roomCode, socket.id, callback);
    if (!result.success) return;
    
    // Utiliser le service commun
    const roomService = require('../../services/roomService');
    
    roomService.closeRoom(roomCode, io)
      .then(result => {
        if (!result.success) {
          return callback({ error: result.error });
        }
        
        logger.info('ROOM', 'Salle fermée via socket', { roomCode });
        callback({ success: true });
      })
      .catch(error => {
        logger.error('ROOM', 'Erreur lors de la fermeture de la salle via socket', error);
        callback({ error: 'Erreur interne lors de la fermeture de la salle' });
      });
  } catch (error) {
    logger.error('ROOM', 'Erreur lors de la fermeture de la salle', error);
    callback({ error: 'Erreur interne lors de la fermeture de la salle' });
  }
}

/**
 * Expulse un joueur de la salle
 */
function handleKickPlayer(socket, io, data, callback) {
  try {
    const { roomCode, playerId } = data;
    const result = verifyRoomAndAdmin(roomCode, socket.id, callback);
    if (!result.success) return;
    const room = result.room;
    
    if (!room.players[playerId]) {
      return callback({ error: 'Joueur inexistant' });
    }
    
    const kickedPseudo = room.players[playerId].pseudo;
    
    // Notifier le joueur expulsé
    io.to(playerId).emit('kicked', { roomCode });
    
    // Supprimer le joueur
    Room.removePlayer(roomCode, playerId);
    
    // Mettre à jour pour les autres joueurs
    io.to(roomCode).emit('update_players', room.players);
    
    logger.info('ROOM', 'Joueur expulsé', {
      roomCode,
      playerId,
      pseudo: kickedPseudo
    });
    
    callback({ success: true, kickedPseudo });
  } catch (error) {
    logger.error('ROOM', 'Erreur lors de l\'expulsion d\'un joueur', error);
    callback({ error: 'Erreur interne lors de l\'expulsion' });
  }
}

/**
 * Gère la déconnexion d'un client
 */
function handleDisconnect(socket, io, reason) {
  try {
    logger.info('ROOM', 'Client déconnecté', {
      socketId: socket.id,
      reason
    });
    
    // Vérifier toutes les salles où le joueur pourrait être
    for (const roomCode in Room.getAll()) {
      const room = Room.get(roomCode);
      
      // Si le joueur déconnecté est l'admin
      if (room.adminId === socket.id) {
        // Ajouter un délai avant de marquer l'admin comme déconnecté
        setTimeout(() => {
          const currentRoom = Room.get(roomCode);
          if (!currentRoom) return;
          
          // Vérifier si un nouvel admin est déjà assigné
          if (currentRoom.adminId === socket.id) {
            currentRoom.adminId = null;
            io.to(roomCode).emit('admin_disconnected');
            logger.info('ROOM', 'Admin déconnecté après délai', { roomCode });
          }
        }, 1500);
      }
      
      // Si le joueur existe dans cette salle
      if (room.players[socket.id]) {
        // Marquer le joueur comme déconnecté
        room.players[socket.id].disconnected = true;
        
        logger.info('ROOM', 'Joueur marqué comme déconnecté', {
          roomCode,
          pseudo: room.players[socket.id].pseudo
        });
        
        // Informer les autres joueurs
        io.to(roomCode).emit('update_players', room.players);
        
        // Si le joueur était le premier à buzzer, réinitialiser
        if (room.firstBuzz === socket.id) {
          Room.resetBuzz(roomCode);
          io.to(roomCode).emit('reset_buzzer');
        }
      }
    }
  } catch (error) {
    logger.error('ROOM', 'Erreur lors de la déconnexion', error);
  }
}

/**
 * Vérifie l'existence d'une salle et les permissions d'administration
 * @returns {Object} Résultat avec {success, room, error} ou appelle callback si erreur
 */
function verifyRoomAndAdmin(roomCode, socketId, callback = null) {
  const room = Room.get(roomCode);
  
  if (!room) {
    if (callback) callback({ error: 'Salle inexistante' });
    return { success: false, error: 'Salle inexistante' };
  }
  
  if (room.adminId !== socketId) {
    if (callback) callback({ error: 'Non autorisé' });
    return { success: false, error: 'Non autorisé' };
  }
  
  return { success: true, room };
}

module.exports = {
  attachEvents
};