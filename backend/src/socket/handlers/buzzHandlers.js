// src/socket/handlers/buzzHandlers.js
const { Room, defaultRoomOptions } = require('../../models/Room'); // Importer defaultRoomOptions
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

    // --- Vérification Ajoutée pour Spotify ---
    // Vérifier si Spotify est activé ET si la piste est déjà trouvée
    if (room.options?.spotifyEnabled && room.trackIsFullyFound) {
        logger.info('BUZZ', `Buzz rejeté pour ${socket.id} dans ${roomCode}: piste déjà trouvée.`);
        const firstBuzzerPseudo = room.players[room.firstBuzz]?.pseudo; // Utiliser room.firstBuzz
        return callback({ error: 'La piste a déjà été trouvée.', lateAttempt: true, buzzedBy: firstBuzzerPseudo });
    }
    // --- Fin Vérification ---

    // Vérifier si la partie est en pause
    if (room.paused) {
      return callback({ error: 'La partie est en pause' });
    }

    // Si un buzz est déjà validé, traiter normalement
    if (room.firstBuzz) {
      const buzzingPlayer = room.players[room.firstBuzz]?.pseudo || 'Quelqu\'un';
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

    if (!room) {
      logger.warn('RESET_BUZZER', 'Salle non trouvée pour réinitialisation', { roomCode });
      return;
    }
    // Vérifier que c'est bien l'admin qui demande la réinitialisation
    if (room.adminId !== socket.id) {
       logger.warn('RESET_BUZZER', 'Tentative de réinitialisation non-admin', { roomCode, socketId: socket.id });
      return;
    }

    logger.info('RESET_BUZZER', 'Réinitialisation des états de buzz des joueurs', { roomCode });
    // Réinitialiser l'état de buzz pour tous les joueurs
    for (let id in room.players) {
      if (room.players[id]) { // Vérification de sécurité
        room.players[id].buzzed = false;
      }
    }

    // Réinitialiser le premier/dernier buzz dans la salle
    logger.info('RESET_BUZZER', 'Nettoyage des données de buzz de la salle', { roomCode });
    Room.clearBuzz(roomCode); // Réinitialise firstBuzz et lastBuzz

    // *** AJOUT IMPORTANT ***
    // Émettre à nouveau l'état des joueurs après avoir mis buzzed=false
    logger.info('RESET_BUZZER', 'Émission de update_players après réinitialisation des flags buzzed', { roomCode });
    io.to(roomCode).emit('update_players', room.players);

    // Émettre l'événement spécifique de réinitialisation pour l'UI client
    logger.info('RESET_BUZZER', 'Émission de l\'événement reset_buzzer', { roomCode });
    io.to(roomCode).emit('reset_buzzer'); // Garder cet événement

    logger.info('RESET_BUZZER', 'Buzzers réinitialisés avec succès', { roomCode });
  } catch (error) {
    logger.error('RESET_BUZZER', 'Erreur lors de la réinitialisation des buzzers', error);
  }
}

/**
 * Gère la désactivation temporaire du buzzer pour un joueur (après mauvaise réponse)
 */
function handleDisableBuzzer(socket, io, data) {
  try {
    // On attend juste roomCode et playerId, la durée vient des options de la salle
    const { roomCode, playerId } = data;
    const room = Room.get(roomCode);
    
    if (!room) return logger.warn('DISABLE_BUZZER', 'Salle non trouvée', { roomCode });
    if (room.adminId !== socket.id) return logger.warn('DISABLE_BUZZER', 'Tentative non-admin', { roomCode, socketId: socket.id });
    if (!room.players[playerId]) return logger.warn('DISABLE_BUZZER', 'Joueur non trouvé', { roomCode, playerId });
    
    const options = room.options || defaultRoomOptions;
    const penaltyDurationSeconds = options.penaltyDelay; // Utiliser la durée des options
    
    // Ne rien faire si la pénalité est de 0 seconde
    if (penaltyDurationSeconds <= 0) {
        logger.info('DISABLE_BUZZER', 'Pénalité désactivée (0s), pas de blocage.', { roomCode, playerId });
        return;
    }

    // Marquer le joueur comme buzzed (pour le bloquer visuellement/logiquement)
    room.players[playerId].buzzed = true;
    
    // Informer tous les joueurs de la salle (pour màj UI)
    io.to(roomCode).emit('update_players', room.players);
    
    // Notifier le joueur concerné de la désactivation temporaire (pour l'UI)
    const durationMs = penaltyDurationSeconds * 1000;
    io.to(playerId).emit('buzzer_disabled', { duration: durationMs });
    
    logger.info('DISABLE_BUZZER', 'Buzzer temporairement désactivé', {
      roomCode,
      playerId,
      duration: penaltyDurationSeconds,
      pseudo: room.players[playerId].pseudo
    });

    // Réactiver après la durée spécifiée
    setTimeout(() => {
      try {
        // Re-vérifier l'existence de la salle et du joueur
        const currentRoom = Room.get(roomCode);
        if (currentRoom && currentRoom.players[playerId]) {
          // Ne réactiver que si le joueur est toujours marqué comme 'buzzed' (évite conflits)
          if (currentRoom.players[playerId].buzzed) {
              currentRoom.players[playerId].buzzed = false;
              
              // AJOUT ICI: Si c'est ce joueur qui avait le firstBuzz, le réinitialiser
              if (currentRoom.firstBuzz === playerId) {
                  Room.resetBuzz(roomCode); // Réinitialiser firstBuzz et lastBuzz
              }
              
              io.to(roomCode).emit('update_players', currentRoom.players);
              io.to(playerId).emit('buzzer_enabled'); // Informer le joueur qu'il est réactivé
              
              logger.info('DISABLE_BUZZER', 'Buzzer réactivé après délai', {
                roomCode,
                playerId,
                duration: penaltyDurationSeconds,
                pseudo: currentRoom.players[playerId].pseudo
              });
          }
        }
      } catch (timeoutError) {
        logger.error('DISABLE_BUZZER', 'Erreur dans le timeout de réactivation', timeoutError);
      }
    }, durationMs);
    
  } catch (error) {
    logger.error('DISABLE_BUZZER', 'Erreur lors de la désactivation', error);
  }
}

module.exports = {
  attachEvents,
  handleResetBuzzer, // Exporter si utilisé par playerHandlers
  handleDisableBuzzer, // Exporter si utilisé par playerHandlers
  // buzzerGracePeriods n'a pas besoin d'être exporté
};