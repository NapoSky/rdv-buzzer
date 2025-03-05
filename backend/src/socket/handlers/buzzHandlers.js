// src/socket/handlers/buzzHandlers.js
const { Room } = require('../../models/Room');
const logger = require('../../utils/logger');
const spotifyService = require('../../services/spotifyService');

// Stockage des périodes de grâce pour les buzzers
const buzzerGracePeriods = {};

/**
 * Attache les événements de buzz au socket
 * @param {Socket} socket - Socket client
 * @param {Server} io - Instance Socket.IO
 */
function attachEvents(socket, io) {
  // Événement buzz d'un joueur
  socket.on('buzz', (data, callback) => handleBuzz(socket, io, data, callback));

  // Réinitialisation des buzzers par l'admin
  socket.on('reset_buzzer', (data) => handleResetBuzzer(socket, io, data));

  // Désactiver temporairement le buzzer pour un joueur
  socket.on('disable_buzzer', (data) => handleDisableBuzzer(socket, io, data));
}

/**
 * Gère un buzz d'un joueur
 */
function handleBuzz(socket, io, data, callback) {
  const { roomCode, clientTimestamp = Date.now() } = data;
  
  try {
    logger.info('BUZZ', 'Tentative de buzz', {
      socketId: socket.id,
      roomCode
    });
    
    // Vérifier si la salle existe
    const room = Room.get(roomCode);
    if (!room) {
      return callback({ error: 'Salle inexistante' });
    }
    
    // Vérifier si la partie est en pause
    if (room.paused) {
      return callback({ error: 'La partie est en pause' });
    }
    
    // Si un buzz est déjà validé, traiter normalement
    if (room.firstBuzz) {
      const buzzingPlayer = room.players[room.firstBuzz].pseudo;
      return callback({
        error: `${buzzingPlayer} a été plus rapide !`,
        buzzedBy: buzzingPlayer,
        lateAttempt: true
      });
    }
    
    // Vérification du joueur
    if (!room.players[socket.id]) {
      return callback({ error: 'Joueur introuvable dans la salle' });
    }
    
    // PÉRIODE DE GRÂCE: si c'est le premier buzz, ouvrir une fenêtre d'opportunité
    if (!buzzerGracePeriods[roomCode]) {
      // Premier buzz reçu - créer une période de grâce
      buzzerGracePeriods[roomCode] = [{
        socketId: socket.id,
        pseudo: room.players[socket.id].pseudo,
        timestamp: clientTimestamp,
        serverTimestamp: Date.now(),
        delta: Math.abs(Date.now() - clientTimestamp)
      }];
      
      // Confirmer réception sans désigner de gagnant encore
      callback({ received: true });
      
      logger.info('BUZZ', 'Période de grâce démarrée', {
        socketId: socket.id,
        roomCode,
        pseudo: room.players[socket.id].pseudo,
        delta: buzzerGracePeriods[roomCode][0].delta
      });
      
      // Démarrer un court timer avant de déterminer le gagnant
      setTimeout(() => {
        processBuzzers(roomCode, io);
      }, 300);
      
      return;
    }
    
    // Si on est déjà dans une période de grâce, ajouter ce buzz à la liste
    buzzerGracePeriods[roomCode].push({
      socketId: socket.id,
      pseudo: room.players[socket.id].pseudo,
      timestamp: clientTimestamp,
      serverTimestamp: Date.now(),
      delta: Math.abs(Date.now() - clientTimestamp)
    });
    
    logger.info('BUZZ', 'Buzz ajouté pendant la période de grâce', {
      socketId: socket.id,
      roomCode,
      pseudo: room.players[socket.id].pseudo,
      candidateCount: buzzerGracePeriods[roomCode].length,
      delta: Math.abs(Date.now() - clientTimestamp)
    });
    
    callback({ received: true });
    
  } catch (error) {
    // En cas d'erreur, nettoyer les ressources
    if (buzzerGracePeriods[roomCode]) {
      delete buzzerGracePeriods[roomCode];
    }
    
    logger.error('BUZZ', 'Erreur de buzz', error);
    return callback({ error: 'Erreur interne lors du buzz' });
  }
}

/**
 * Traite les buzzers après la période de grâce
 */
function processBuzzers(roomCode, io) {
  try {
    // Vérifier que les données nécessaires existent toujours
    const room = Room.get(roomCode);
    if (!buzzerGracePeriods[roomCode] || !room) {
      // Nettoyage par sécurité
      if (buzzerGracePeriods[roomCode]) delete buzzerGracePeriods[roomCode];
      return;
    }
    
    const candidates = buzzerGracePeriods[roomCode];
    
    logger.info('BUZZ_PROCESS', 'Traitement des buzzers après période de grâce', {
      roomCode,
      candidateCount: candidates.length,
      candidates: candidates.map(c => ({
        pseudo: c.pseudo,
        delta: c.delta
      }))
    });
    
    if (candidates.length === 0) {
      delete buzzerGracePeriods[roomCode];
      return;
    }
    
    // Trouver le candidat avec le delta le plus faible
    candidates.sort((a, b) => a.delta - b.delta);
    
    // Vérification de sécurité: chercher un candidat valide
    let winner = null;
    for (const candidate of candidates) {
      if (room.players[candidate.socketId]) {
        winner = candidate;
        break;
      }
    }
    
    if (!winner) {
      logger.info('BUZZ_PROCESS', 'Aucun candidat valide pour le buzz', { roomCode });
      delete buzzerGracePeriods[roomCode];
      return;
    }
    
    // Désigner le gagnant
    Room.setFirstBuzz(roomCode, winner.socketId);
    room.players[winner.socketId].buzzed = true;
    
    const buzzData = {
      buzzedBy: winner.pseudo,
      playerId: winner.socketId,
      roomCode,
      _debug: {
        delta: winner.delta,
        candidateCount: candidates.length
      }
    };
    
    Room.setLastBuzz(roomCode, buzzData);
    io.to(roomCode).emit('buzzed', buzzData);
    
    // Ajouter la pause Spotify ici
    pauseSpotifyIfConnected(roomCode, io);
    
    logger.info('BUZZ_PROCESS', 'Gagnant désigné après période de grâce', {
      roomCode,
      winner: winner.pseudo,
      socketId: winner.socketId,
      delta: winner.delta,
      candidateCount: candidates.length
    });
    
    // Nettoyer
    delete buzzerGracePeriods[roomCode];
  } catch (error) {
    logger.error('BUZZ_PROCESS', 'Erreur lors du traitement des buzzers', error);
    
    // Nettoyage en cas d'erreur
    if (buzzerGracePeriods[roomCode]) {
      delete buzzerGracePeriods[roomCode];
    }
  }
}

/**
 * Met en pause Spotify si connecté pour la salle
 */
function pauseSpotifyIfConnected(roomCode, io) {
  if (spotifyService.isRoomConnected(roomCode)) {
    spotifyService.pausePlayback(roomCode)
      .then(result => {
        if (result.success) {
          logger.info('SPOTIFY', 'Lecture mise en pause automatiquement', { roomCode });
          io.to(roomCode).emit('spotify_status', { action: 'paused' });
        } else {
          logger.error('SPOTIFY', 'Échec de la pause', { 
            roomCode, 
            error: result.error 
          });
        }
      })
      .catch(error => {
        logger.error('SPOTIFY', 'Erreur lors de la pause', error);
      });
  }
}

/**
 * Gère la réinitialisation des buzzers
 */
function handleResetBuzzer(socket, io, data) {
  try {
    const { roomCode } = data;
    const room = Room.get(roomCode);
    
    if (!room) return;
    if (room.adminId !== socket.id) return;
    
    // Réinitialiser l'état de buzz pour tous les joueurs
    for (let id in room.players) {
      room.players[id].buzzed = false;
    }
    
    // Réinitialiser le premier buzz
    Room.clearBuzz(roomCode);
    
    io.to(roomCode).emit('reset_buzzer');
    
    logger.info('RESET_BUZZER', 'Buzzers réinitialisés', { roomCode });
  } catch (error) {
    logger.error('RESET_BUZZER', 'Erreur lors de la réinitialisation', error);
  }
}

/**
 * Gère la désactivation temporaire du buzzer pour un joueur
 */
function handleDisableBuzzer(socket, io, data) {
  try {
    const { roomCode, playerId, duration = 1 } = data;
    const room = Room.get(roomCode);
    
    if (!room) return;
    if (room.adminId !== socket.id) return;
    if (!room.players[playerId]) return;
    
    // Marquer le joueur comme buzzed
    room.players[playerId].buzzed = true;
    
    // Informer tous les joueurs de la salle
    io.to(roomCode).emit('update_players', room.players);
    
    // Notifier le joueur concerné de la désactivation temporaire (pour l'UI)
    io.to(playerId).emit('buzzer_disabled', { duration: duration * 1000 });
    
    // Réactiver après la durée spécifiée
    setTimeout(() => {
      try {
        const currentRoom = Room.get(roomCode);
        if (currentRoom && currentRoom.players[playerId]) {
          currentRoom.players[playerId].buzzed = false;
          io.to(roomCode).emit('update_players', currentRoom.players);
          
          logger.info('DISABLE_BUZZER', 'Buzzer réactivé après délai', {
            roomCode,
            playerId,
            duration,
            pseudo: currentRoom.players[playerId].pseudo
          });
        }
      } catch (timeoutError) {
        logger.error('DISABLE_BUZZER', 'Erreur dans le timeout', timeoutError);
      }
    }, duration * 1000);
    
    logger.info('DISABLE_BUZZER', 'Buzzer temporairement désactivé', {
      roomCode,
      playerId,
      duration,
      pseudo: room.players[playerId].pseudo
    });
  } catch (error) {
    logger.error('DISABLE_BUZZER', 'Erreur lors de la désactivation', error);
  }
}

module.exports = {
  attachEvents,
  buzzerGracePeriods
};