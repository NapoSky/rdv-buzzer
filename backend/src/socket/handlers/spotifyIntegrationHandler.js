const { Room } = require('../../models/Room');
const logger = require('../../utils/logger');

// Import conditionnel du service Spotify
let spotifyService;
try {
  spotifyService = require('../../services/spotifyService');
} catch (error) {
  logger.warn('SPOTIFY_INTEGRATION', 'Service Spotify non disponible', { error: error.message });
}

/**
 * Vérifie si l'intégration Spotify est disponible
 * @returns {boolean}
 */
function isSpotifyAvailable() {
  return !!spotifyService;
}

/**
 * Vérifie si Spotify est activé et connecté pour une salle
 * @param {string} roomCode - Code de la salle
 * @returns {boolean}
 */
function isSpotifyEnabledForRoom(roomCode) {
  if (!isSpotifyAvailable()) return false;
  
  const room = Room.get(roomCode);
  if (!room || !room.options?.spotifyEnabled) return false;
  
  // Vérifier si la salle est connectée à Spotify
  return spotifyService.isRoomConnected && spotifyService.isRoomConnected(roomCode);
}

/**
 * Vérifie les autorisations pour les actions Spotify
 * @param {string} roomCode - Code de la salle
 * @param {string} socketId - ID du socket
 * @returns {{ authorized: boolean, room?: Room, error?: string }}
 */
function checkSpotifyAuthorization(roomCode, socketId) {
  const room = Room.get(roomCode);
  
  if (!room) {
    return { authorized: false, error: 'Salle non trouvée' };
  }
  
  if (room.adminId !== socketId) {
    return { authorized: false, error: 'Non autorisé' };
  }
  
  return { authorized: true, room };
}

/**
 * Wrapper générique pour les actions Spotify avec gestion d'erreurs
 * @param {Function} action - Action à exécuter
 * @param {string} logContext - Contexte pour les logs
 * @param {Function} callback - Callback de réponse
 */
async function executeSpotifyAction(action, logContext, callback) {
  try {
    const result = await action();
    
    if (result.success) {
      logger.info('SPOTIFY_INTEGRATION', `${logContext} réussie`, result.logData || {});
      if (callback) callback({ success: true, ...result.data });
    } else {
      logger.error('SPOTIFY_INTEGRATION', `Échec ${logContext}`, result.logData || {});
      if (callback) callback({ error: result.error || `Erreur ${logContext}` });
    }
  } catch (error) {
    logger.error('SPOTIFY_INTEGRATION', `Erreur lors de ${logContext}`, error);
    if (callback) callback({ error: 'Erreur interne' });
  }
}

/**
 * Gère les changements de piste (suivante/précédente)
 * @param {Socket} socket - Socket client
 * @param {Server} io - Instance Socket.IO
 * @param {Object} data - Données de l'événement
 * @param {Function} callback - Callback de réponse
 * @param {Function} trackAction - Action de changement de piste
 * @param {string} actionName - Nom de l'action pour les logs
 */
async function handleTrackChange(socket, io, data, callback, trackAction, actionName) {
  const { roomCode } = data;
  const authCheck = checkSpotifyAuthorization(roomCode, socket.id);
  
  if (!authCheck.authorized) {
    return callback && callback({ error: authCheck.error });
  }

  await executeSpotifyAction(
    async () => {
      const result = await trackAction(roomCode);
      
      if (result.success) {
        // Réinitialiser l'état de la salle pour la nouvelle piste
        Room.resetQuestionState(roomCode, result.currentTrack);
        
        io.to(roomCode).emit('spotify_track_changed', { 
          roomCode, 
          track: result.currentTrack 
        });
        io.to(roomCode).emit('update_players', authCheck.room.players);
        
        return {
          success: true,
          data: { track: result.currentTrack },
          logData: { roomCode }
        };
      }
      
      return {
        success: false,
        error: result.error || 'Erreur changement de piste',
        logData: { roomCode, error: result.error }
      };
    },
    actionName,
    callback
  );
}

/**
 * Attache les événements liés à l'intégration Spotify
 * @param {Socket} socket - Socket client
 * @param {Server} io - Instance Socket.IO
 */
function attachSpotifyIntegration(socket, io) {
  if (!isSpotifyAvailable()) {
    logger.info('SPOTIFY_INTEGRATION', 'Service Spotify non disponible, événements ignorés');
    return;
  }

  // Événements spécifiques à Spotify
  socket.on('spotify_connect', (data, callback) => handleSpotifyConnect(socket, io, data, callback));
  socket.on('spotify_disconnect', (data, callback) => handleSpotifyDisconnect(socket, io, data, callback));
  socket.on('spotify_play', (data, callback) => handleSpotifyPlay(socket, io, data, callback));
  socket.on('spotify_pause', (data, callback) => handleSpotifyPause(socket, io, data, callback));
  socket.on('spotify_next', (data, callback) => handleSpotifyNext(socket, io, data, callback));
  socket.on('spotify_previous', (data, callback) => handleSpotifyPrevious(socket, io, data, callback));
  socket.on('spotify_seek', (data, callback) => handleSpotifySeek(socket, io, data, callback));
  socket.on('spotify_get_status', (data, callback) => handleGetSpotifyStatus(socket, io, data, callback));

  // Écouter les événements génériques pour automatiser Spotify
  socket.on('player_buzzed', (data) => {
    if (isSpotifyEnabledForRoom(data.roomCode)) {
      handlePlayerBuzzed(data, io);
    }
  });

  socket.on('track_fully_found', (data) => {
    if (isSpotifyEnabledForRoom(data.roomCode)) {
      handleTrackFullyFound(data, io);
    }
  });

  socket.on('game_reset', (data) => {
    if (isSpotifyEnabledForRoom(data.roomCode)) {
      handleGameReset(data, io);
    }
  });
}

/**
 * Gère la connexion Spotify pour une salle
 */
async function handleSpotifyConnect(socket, io, data, callback) {
  try {
    const { roomCode, authCode } = data;
    const room = Room.get(roomCode);

    if (!room) {
      return callback({ error: 'Salle non trouvée' });
    }

    if (room.adminId !== socket.id) {
      return callback({ error: 'Seul l\'administrateur peut connecter Spotify' });
    }

    if (!room.options?.spotifyEnabled) {
      return callback({ error: 'Spotify n\'est pas activé pour cette salle' });
    }

    const result = await spotifyService.connectRoom(roomCode, authCode);
    
    if (result.success) {
      logger.info('SPOTIFY_INTEGRATION', 'Spotify connecté avec succès', { roomCode });
      io.to(roomCode).emit('spotify_connected', { roomCode });
      callback({ success: true });
    } else {
      logger.error('SPOTIFY_INTEGRATION', 'Échec de la connexion Spotify', { roomCode, error: result.error });
      callback({ error: result.error || 'Erreur de connexion Spotify' });
    }
  } catch (error) {
    logger.error('SPOTIFY_INTEGRATION', 'Erreur lors de la connexion Spotify', error);
    callback({ error: 'Erreur interne lors de la connexion' });
  }
}

/**
 * Gère la déconnexion Spotify pour une salle
 */
async function handleSpotifyDisconnect(socket, io, data, callback) {
  try {
    const { roomCode } = data;
    const room = Room.get(roomCode);

    if (!room) {
      return callback({ error: 'Salle non trouvée' });
    }

    if (room.adminId !== socket.id) {
      return callback({ error: 'Seul l\'administrateur peut déconnecter Spotify' });
    }

    const result = await spotifyService.disconnectRoom(roomCode);
    
    if (result.success) {
      logger.info('SPOTIFY_INTEGRATION', 'Spotify déconnecté', { roomCode });
      io.to(roomCode).emit('spotify_disconnected', { roomCode });
      callback({ success: true });
    } else {
      callback({ error: result.error || 'Erreur de déconnexion' });
    }
  } catch (error) {
    logger.error('SPOTIFY_INTEGRATION', 'Erreur lors de la déconnexion Spotify', error);
    callback({ error: 'Erreur interne lors de la déconnexion' });
  }
}

/**
 * Gère la lecture Spotify
 */
async function handleSpotifyPlay(socket, io, data, callback) {
  const { roomCode } = data;
  const authCheck = checkSpotifyAuthorization(roomCode, socket.id);
  
  if (!authCheck.authorized) {
    return callback && callback({ error: authCheck.error });
  }

  await executeSpotifyAction(
    async () => {
      const result = await spotifyService.resumePlayback(roomCode);
      
      if (result.success) {
        io.to(roomCode).emit('spotify_status', { action: 'playing' });
        return {
          success: true,
          logData: { roomCode }
        };
      }
      
      return {
        success: false,
        error: result.error || 'Erreur de lecture',
        logData: { roomCode, error: result.error }
      };
    },
    'reprise de lecture',
    callback
  );
}

/**
 * Gère la pause Spotify
 */
async function handleSpotifyPause(socket, io, data, callback) {
  const { roomCode } = data;
  const authCheck = checkSpotifyAuthorization(roomCode, socket.id);
  
  if (!authCheck.authorized) {
    return callback && callback({ error: authCheck.error });
  }

  await executeSpotifyAction(
    async () => {
      const result = await spotifyService.pausePlayback(roomCode);
      
      if (result.success) {
        io.to(roomCode).emit('spotify_status', { action: 'paused' });
        return {
          success: true,
          logData: { roomCode }
        };
      }
      
      return {
        success: false,
        error: result.error || 'Erreur de pause',
        logData: { roomCode, error: result.error }
      };
    },
    'mise en pause',
    callback
  );
}

/**
 * Gère le passage à la piste suivante
 */
async function handleSpotifyNext(socket, io, data, callback) {
  await handleTrackChange(socket, io, data, callback, spotifyService.nextTrack, 'piste suivante');
}

/**
 * Gère le passage à la piste précédente
 */
async function handleSpotifyPrevious(socket, io, data, callback) {
  await handleTrackChange(socket, io, data, callback, spotifyService.previousTrack, 'piste précédente');
}

/**
 * Gère le positionnement dans la piste
 */
async function handleSpotifySeek(socket, io, data, callback) {
  const { roomCode, positionMs } = data;
  const authCheck = checkSpotifyAuthorization(roomCode, socket.id);
  
  if (!authCheck.authorized) {
    return callback && callback({ error: authCheck.error });
  }

  await executeSpotifyAction(
    async () => {
      const result = await spotifyService.seekToPosition(roomCode, positionMs);
      
      if (result.success) {
        io.to(roomCode).emit('spotify_position_changed', { roomCode, positionMs });
        return {
          success: true,
          logData: { roomCode, positionMs }
        };
      }
      
      return {
        success: false,
        error: result.error || 'Erreur de positionnement',
        logData: { roomCode, positionMs, error: result.error }
      };
    },
    'changement de position',
    callback
  );
}

/**
 * Récupère le statut Spotify actuel
 */
async function handleGetSpotifyStatus(socket, io, data, callback) {
  try {
    const { roomCode } = data;
    
    if (!isSpotifyEnabledForRoom(roomCode)) {
      return callback({ connected: false });
    }

    const status = await spotifyService.getPlaybackState(roomCode);
    callback({ 
      connected: true, 
      ...status 
    });
  } catch (error) {
    logger.error('SPOTIFY_INTEGRATION', 'Erreur lors de la récupération du statut', error);
    callback({ error: 'Erreur interne' });
  }
}

/**
 * Gère la pause automatique quand un joueur buzze
 */
async function handlePlayerBuzzed(data, io) {
  const { roomCode } = data;
  
  try {
    const result = await spotifyService.pausePlayback(roomCode);
    
    if (result.success) {
      logger.info('SPOTIFY_INTEGRATION', 'Lecture mise en pause automatiquement après buzz', { roomCode });
      io.to(roomCode).emit('spotify_status', { action: 'paused', reason: 'player_buzzed' });
    } else {
      logger.error('SPOTIFY_INTEGRATION', 'Échec de la pause automatique', { 
        roomCode, 
        error: result.error 
      });
    }
  } catch (error) {
    logger.error('SPOTIFY_INTEGRATION', 'Erreur lors de la pause automatique', error);
  }
}

/**
 * Gère les actions quand la piste est trouvée
 */
async function handleTrackFullyFound(data, io) {
  const { roomCode } = data;
  
  // Optionnel : reprendre la lecture ou passer à la piste suivante
  // selon les préférences de la salle
  try {
    const room = Room.get(roomCode);
    const autoNext = room?.options?.autoNextTrack || false;
    
    if (autoNext) {
      // Attendre un peu avant de passer à la suivante
      setTimeout(async () => {
        const result = await spotifyService.nextTrack(roomCode);
        if (result.success) {
          Room.resetQuestionState(roomCode, result.currentTrack);
          io.to(roomCode).emit('spotify_track_changed', { 
            roomCode, 
            track: result.currentTrack 
          });
          io.to(roomCode).emit('update_players', room.players);
        }
      }, 3000); // 3 secondes de délai
    }
  } catch (error) {
    logger.error('SPOTIFY_INTEGRATION', 'Erreur lors du passage automatique', error);
  }
}

/**
 * Gère la réinitialisation du jeu
 */
async function handleGameReset(data, io) {
  const { roomCode } = data;
  
  // Optionnel : reprendre la lecture si elle était en pause
  try {
    const status = await spotifyService.getPlaybackState(roomCode);
    if (status && !status.is_playing) {
      await spotifyService.resumePlayback(roomCode);
      io.to(roomCode).emit('spotify_status', { action: 'playing', reason: 'game_reset' });
    }
  } catch (error) {
    logger.error('SPOTIFY_INTEGRATION', 'Erreur lors de la reprise après reset', error);
  }
}

module.exports = {
  attachSpotifyIntegration,
  isSpotifyAvailable,
  isSpotifyEnabledForRoom
};