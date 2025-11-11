// src/socket/handlers/roomHandlers.js
const { Room, defaultRoomOptions } = require('../../models/Room');
const { generateRoomCode } = require('../../utils/helpers');
const logger = require('../../utils/logger');
const roomService = require('../../services/roomService'); // Assurez-vous que c'est importé
const { startSpotifyPolling, stopSpotifyPolling } = require('../../services/spotifyService'); // Importer les fonctions de polling
const analyticsService = require('../../services/analyticsService');

// Importer l'intégration Spotify seulement quand nécessaire
let spotifyIntegrationHandler;
try {
  spotifyIntegrationHandler = require('./spotifyIntegrationHandler');
} catch (error) {
  logger.warn('ROOM', 'Intégration Spotify non disponible', { error: error.message });
}

/**
 * Attache les événements de salle au socket
 * @param {Socket} socket - Socket client
 * @param {Server} io - Instance Socket.IO
 */
function attachEvents(socket, io) {
  // Création d'une salle - Accepte maintenant les options
  socket.on('create_room', (options, callback) => handleCreateRoom(socket, options, callback));
  
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

  // Attacher l'intégration Spotify uniquement si disponible
  if (spotifyIntegrationHandler) {
    spotifyIntegrationHandler.attachSpotifyIntegration(socket, io);
  }
}

/**
 * Crée une nouvelle salle
 * @param {object} options - Options de configuration de la salle
 */
function handleCreateRoom(socket, options, callback) {
  try {
    logger.info('ROOM', 'Tentative de création de salle', { socketId: socket.id, options });

    // Validation simple des options (peut être étendue)
    const validatedOptions = {
      roomType: ['Standard', 'Titre/Artiste'].includes(options?.roomType) ? options.roomType : defaultRoomOptions.roomType,
      pointsCorrect: typeof options?.pointsCorrect === 'number' && options.pointsCorrect >= 0 ? options.pointsCorrect : defaultRoomOptions.pointsCorrect,
      pointsWrong: typeof options?.pointsWrong === 'number' && options.pointsWrong >= 0 ? options.pointsWrong : defaultRoomOptions.pointsWrong,
      penaltyDelay: typeof options?.penaltyDelay === 'number' && options.penaltyDelay >= 0 ? options.penaltyDelay : defaultRoomOptions.penaltyDelay,
      saveRoom: typeof options?.saveRoom === 'boolean' ? options.saveRoom : defaultRoomOptions.saveRoom,
      roomType: ['Standard', 'Titre/Artiste'].includes(options?.roomType || options?.roomType)
                ? (options.roomType || options.roomType)
                : defaultRoomOptions.roomType, // Utiliser roomType par défaut si roomType non fourni
      spotifyEnabled: typeof options?.spotifyEnabled === 'boolean' ? options.spotifyEnabled : defaultRoomOptions.spotifyEnabled,
    };
      
    // Générer un code unique pour la salle
    const roomCode = generateRoomCode();
    
    // Initialiser la salle avec les options validées
    Room.create(roomCode, socket.id, validatedOptions);
    
    // Initialiser les analytics pour cette room
    analyticsService.initRoomAnalytics(roomCode);
    
    // Faire rejoindre la salle au créateur
    socket.join(roomCode);
    
    // Persister la room dans Redis (backup)
    Room.persistToRedis(roomCode).catch(err => {
      logger.error('ROOM', 'Erreur lors de la persistence Redis à la création', err);
    });
    
    // Démarrer le polling si Spotify est activé (nécessite connexion Spotify séparée)
    // Le polling ne démarrera vraiment que si isRoomConnected est true plus tard
    if (validatedOptions.spotifyEnabled) {
        // On pourrait appeler startSpotifyPolling ici, mais il ne fera rien tant que isRoomConnected est false.
        // Il est préférable de l'appeler après une connexion Spotify réussie.
        logger.info('ROOM', `Spotify activé pour ${roomCode}, polling démarrera après connexion.`);
    }

    logger.info('ROOM', 'Salle créée', { roomCode, socketId: socket.id, options: validatedOptions });
    // Renvoyer le code et les options utilisées
    callback({ roomCode, roomOptions: validatedOptions });
  } catch (error) {
    logger.error('ROOM', 'Erreur lors de la création de salle', error);
    callback({ error: 'Erreur lors de la création de la salle' });
  }
}

/**
 * Gère la connexion d'un joueur à une salle
 */
function handleJoinRoom(socket, io, data, callback) {
  const { roomCode, pseudo, isAdmin, forceOwnership } = data; // Assurez-vous que ces variables sont bien extraites

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

    if (isAdmin) {
      // CAS 1: L'admin qui rejoint EST l'admin actuel (reconnexion ou juste après création)
      if (room.adminId === socket.id) {
        logger.info('ROOM', `Admin ${pseudo} (${socket.id}) se reconnecte ou rejoint après création pour ${roomCode}`);
        // S'assurer que l'entrée joueur existe et est marquée comme connectée
        if (!room.players[socket.id]) {
          // Sécurité : si l'entrée joueur manque, l'ajouter
           Room.addPlayer(roomCode, socket.id, { pseudo, score: 0, buzzed: false, isAdmin: true, disconnected: false });
           logger.info('ROOM', `Entrée joueur manquante pour admin ${socket.id} dans ${roomCode}, ajoutée.`);
        } else {
          room.players[socket.id].disconnected = false; // Marquer comme reconnecté
        }
        socket.join(roomCode);
        io.to(roomCode).emit('admin_connected');
        io.to(roomCode).emit('update_players', room.players);

        // --- CORRECTION : Utiliser getClientState ---
        const clientState = Room.getClientState(roomCode);
        if (clientState) {
            //logger.info('JOIN_ROOM_DEBUG', `Préparation de la réponse pour ADMIN RECONNECTÉ ${socket.id} dans ${roomCode}`);
            return callback(clientState); // Envoyer l'état complet unifié
        } else {
            //logger.error('JOIN_ROOM_DEBUG', `Erreur: clientState null pour ADMIN RECONNECTÉ ${socket.id}`);
            return callback({ error: 'Erreur interne (admin reconnect)' });
        }
        // --- FIN CORRECTION ---
      }
      // CAS 2: Pas d'admin actuel OU prise de contrôle forcée
      else if (!room.adminId || forceOwnership) {
        const oldAdminId = room.adminId; // Sauvegarder l'ancien ID s'il existe
        logger.info('ROOM', `Prise de contrôle admin par ${pseudo} (${socket.id}) pour ${roomCode}. Ancien admin: ${oldAdminId || 'aucun'}`);

        // Définir le nouvel admin ID
        Room.setAdminId(roomCode, socket.id);

        // Supprimer l'ancien joueur admin si takeover
        if (oldAdminId) {
          Room.removePlayer(roomCode, oldAdminId); // Assurez-vous que removePlayer gère l'ID inexistant
        }

        // Assurer une entrée propre pour le nouvel admin (supprimer d'abord au cas où, puis ajouter)
        Room.removePlayer(roomCode, socket.id);
        Room.addPlayer(roomCode, socket.id, { pseudo, score: 0, buzzed: false, isAdmin: true, disconnected: false });

        socket.join(roomCode);
        io.to(roomCode).emit('admin_connected');
        io.to(roomCode).emit('update_players', room.players);

        // --- CORRECTION : Utiliser getClientState ---
        const clientState = Room.getClientState(roomCode);
        if (clientState) {
            //logger.info('JOIN_ROOM_DEBUG', `Préparation de la réponse pour NOUVEL ADMIN ${socket.id} dans ${roomCode}`);
            return callback(clientState); // Envoyer l'état complet unifié
        } else {
            //logger.error('JOIN_ROOM_DEBUG', `Erreur: clientState null pour NOUVEL ADMIN ${socket.id}`);
            return callback({ error: 'Erreur interne (new admin)' });
        }
        // --- FIN CORRECTION ---
      }
      // CAS 3: Un admin existe déjà, ce n'est pas ce socket, et pas de forceOwnership
      else {
        // --- CORRECTION DU LOGGER ---
        logger.info('ROOM', `Tentative de connexion admin ${socket.id} refusée pour ${roomCode}`, { adminId: room.adminId });
        // --- FIN CORRECTION DU LOGGER ---
        return callback({
          error: 'Un autre administrateur est déjà actif dans cette salle.',
          roomOptions: room.options // Garder les options ici pour info dans le cas d'erreur
        });
      }
      // --- FIN NOUVELLE LOGIQUE ADMIN ---
    }

    // Vérification d'unicité du pseudo
    if (!isAdmin && Object.values(room.players).some(player => player.pseudo === pseudo)) {
      // Si le joueur existe déjà, restaurer ses informations
      const existingPlayer = Object.entries(room.players)
        .find(([id, player]) => player.pseudo === pseudo);

      if (existingPlayer) {
        const [existingPlayerId, playerData] = existingPlayer;
        // Supprimer l'ancienne entrée socket
        Room.removePlayer(roomCode, existingPlayerId);
        // Ajouter la nouvelle entrée socket avec les données existantes
        Room.addPlayer(roomCode, socket.id, { ...playerData, disconnected: false });

        socket.join(roomCode);
        io.to(roomCode).emit('update_players', room.players);

        // --- MODIFICATION ---
        // Renvoyer l'état complet, comme pour un nouveau joueur
        const clientState = Room.getClientState(roomCode);
        if (clientState) {
            //logger.info('JOIN_ROOM_DEBUG', `Préparation de la réponse pour client RECONNECTÉ ${socket.id} dans ${roomCode}`, {
            //    clientStatePayload: JSON.stringify(clientState) // Logguer le payload complet
            //});
            return callback(clientState); // Envoyer l'état complet
        } else {
            // Sécurité : si getClientState échoue, renvoyer une erreur
            //logger.error('JOIN_ROOM_DEBUG', `Erreur: clientState est null pour ${roomCode} lors de la RECONNEXION de ${socket.id}`);
            return callback({ error: 'Erreur interne lors de la récupération de l\'état de la salle après reconnexion' });
        }
      }

      // Gérer le cas où le pseudo est pris par quelqu'un d'autre (logique inchangée)
      return callback({ error: 'Ce pseudo est déjà pris' });
    }

    // --- RÉCONCILIATION AVEC JOUEURS PERSISTÉS (REDIS) ---
    // Si la room a été restaurée depuis Redis, vérifier si ce pseudo correspond à un joueur persisté
    let initialScore = 0;
    let wasAdmin = false;
    if (room._persistedPlayers && Array.isArray(room._persistedPlayers)) {
      const persistedIndex = room._persistedPlayers.findIndex(p => p.pseudo === pseudo);
      if (persistedIndex !== -1) {
        const persistedPlayer = room._persistedPlayers[persistedIndex];
        initialScore = persistedPlayer.score || 0;
        wasAdmin = persistedPlayer.isAdmin || false;
        // Retirer ce joueur de la liste des joueurs persistés
        room._persistedPlayers.splice(persistedIndex, 1);
        logger.info('ROOM', `Joueur ${pseudo} réconcilié depuis Redis avec score ${initialScore}`, { roomCode });
      }
    }

    // --- LOGIQUE POUR NOUVEAU JOUEUR ---
    // Ajouter le joueur à la salle (avec le score restauré si disponible)
    Room.addPlayer(roomCode, socket.id, {
      pseudo,
      score: initialScore, // Utiliser le score persisté ou 0
      buzzed: false,
      isAdmin: !!isAdmin || wasAdmin, // Prendre en compte si le joueur était admin
      disconnected: false
    });

    socket.join(roomCode);
    io.to(roomCode).emit('update_players', room.players);

    // Démarrer le polling si Spotify est activé ET connecté pour cette salle
    if (room.options?.spotifyEnabled && require('../../services/spotifyService').isRoomConnected(roomCode)) {
        startSpotifyPolling(roomCode);
    }

    logger.info('ROOM', 'Joueur a rejoint la salle', {
      socketId: socket.id,
      roomCode,
      pseudo,
      isAdmin: !!isAdmin
    });

    // La réponse pour un joueur normal (nouveau ou reconnecté) utilise getClientState
    const clientState = Room.getClientState(roomCode);
    if (clientState) {
        //logger.info('JOIN_ROOM_DEBUG', `Préparation de la réponse pour client standard ${socket.id} dans ${roomCode}`, {
        //    clientStatePayload: JSON.stringify(clientState) // Logguer le payload complet
        //});
        callback(clientState); // Envoyer l'état complet
    } else {
        //logger.error('JOIN_ROOM_DEBUG', `Erreur: clientState est null pour ${roomCode} lors de la réponse à ${socket.id}`);
        callback({ error: 'Erreur interne lors de la récupération de l\'état de la salle' }); // Sécurité
    }
    
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
    // Pas besoin d'un argument 'saveRoom' ici, on utilise l'option stockée
    const verifyResult = verifyRoomAndAdmin(roomCode, socket.id, callback);
    if (!verifyResult.success) return;
    
    const room = verifyResult.room;
    const shouldSave = room.options?.saveRoom ?? true; // Utiliser l'option de la salle, défaut à true

    // Arrêter le polling Spotify avant de fermer la salle
    stopSpotifyPolling(roomCode);

    // Utiliser le service commun en passant l'option de sauvegarde
    roomService.closeRoom(roomCode, io, shouldSave)
      .then(result => {
        if (!result.success) {
          // Renvoyer l'erreur et si les données ont été sauvegardées (probablement false ici)
          return callback({ error: result.error, dataSaved: result.dataSaved });
        }
        
        logger.info('ROOM', 'Salle fermée via socket', { roomCode, saved: result.dataSaved });
        // Confirmer le succès et si les données ont été sauvegardées
        callback({ success: true, dataSaved: result.dataSaved });
      })
      .catch(error => {
        logger.error('ROOM', 'Erreur lors de l\'appel à roomService.closeRoom via socket', error);
        callback({ error: 'Erreur interne lors de la fermeture de la salle', dataSaved: false });
      });
  } catch (error) {
    logger.error('ROOM', 'Erreur inattendue lors de la fermeture de la salle', error);
    callback({ error: 'Erreur interne lors de la fermeture de la salle', dataSaved: false });
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
    
    let adminDisconnectedRoom = null;

    // Vérifier toutes les salles où le joueur pourrait être
    for (const roomCode in Room.getAll()) {
      const room = Room.get(roomCode);
      
      // Si le joueur déconnecté est l'admin
      if (room.adminId === socket.id) {
        adminDisconnectedRoom = roomCode; // Marquer la salle pour traitement différé
        // Ne pas arrêter le polling ici tout de suite, attendre le timeout
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

    // Traitement différé pour la déconnexion de l'admin
    if (adminDisconnectedRoom) {
      const code = adminDisconnectedRoom; // Copier la variable pour le scope du timeout
      setTimeout(() => {
        const currentRoom = Room.get(code);
        // Vérifier si la salle existe toujours et si l'admin n'a pas été remplacé entre temps
        if (currentRoom && currentRoom.adminId === socket.id) {
          currentRoom.adminId = null; // Marquer l'admin comme absent
          Room.setPaused(code, true); // Mettre en pause
          io.to(code).emit('admin_disconnected');
          io.to(code).emit('game_paused', { paused: true });
          logger.info('ROOM', `Admin ${socket.id} déconnecté après délai pour ${code}, partie mise en pause.`); // Mettre à jour le log
        } else if (currentRoom) {
             logger.info('ROOM', `Admin ${socket.id} s'est reconnecté ou a été remplacé dans ${code} avant timeout.`);
        }
      }, 1500); // Délai existant
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