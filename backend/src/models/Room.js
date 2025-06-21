// Structure en mémoire pour les salles
let rooms = {};

// Options par défaut pour une salle
const defaultRoomOptions = {
  roomType: 'Standard', // Ajouté pour correspondre à l'usage
  pointsCorrect: 10,
  pointsWrong: 5,
  penaltyDelay: 3,
  saveRoom: true,
  // --- Ajout pour Spotify ---
  spotifyEnabled: false, // Désactivé par défaut
  // --- Fin Ajout ---
};

class Room {
  static create(roomCode, adminId, options = {}) {
    const roomOptions = {
      ...defaultRoomOptions,
      ...options,
      spotifyEnabled: typeof options?.spotifyEnabled === 'boolean' ? options.spotifyEnabled : defaultRoomOptions.spotifyEnabled,
      roomType: ['Standard', 'Titre/Artiste'].includes(options?.roomType)
                ? options.roomType
                : defaultRoomOptions.roomType,
    };

    rooms[roomCode] = {
      adminId,
      players: {}, // { socketId: { pseudo, score, isAdmin, disconnected, buzzed } }
      paused: false,
      firstBuzz: null, // Utiliser firstBuzz comme vu dans buzzHandlers.js
      lastBuzz: null,
      options: roomOptions, // Stocker les options ici

      // --- LOGIQUE GÉNÉRIQUE (fonctionne avec ou sans Spotify) ---
      currentTrack: null, // Peut être une piste Spotify ou une question manuelle
      artistFound: false,
      titleFound: false,
      trackIsFullyFound: false, // Calculé selon le roomType et les états found

      // --- OPTIONNEL : Métadonnées Spotify ---
      spotifyConnected: roomOptions.spotifyEnabled,
    };

    return rooms[roomCode];
  }

  static get(roomCode) {
    return rooms[roomCode];
  }

  static getAll() {
    return rooms;
  }

  static delete(roomCode) {
    const room = rooms[roomCode];
    delete rooms[roomCode];
    return room;
  }

  static addPlayer(roomCode, socketId, playerData) {
    if (!rooms[roomCode]) return null;
    rooms[roomCode].players[socketId] = playerData;
    return rooms[roomCode].players[socketId];
  }

  static removePlayer(roomCode, socketId) {
    if (!rooms[roomCode] || !rooms[roomCode].players[socketId]) return false;
    delete rooms[roomCode].players[socketId];
    return true;
  }

  static updatePlayerStatus(roomCode, socketId, status) {
    if (!rooms[roomCode] || !rooms[roomCode].players[socketId]) return false;
    rooms[roomCode].players[socketId] = { ...rooms[roomCode].players[socketId], ...status };
    return rooms[roomCode].players[socketId];
  }

  static setAdminId(roomCode, socketId) {
    if (!rooms[roomCode]) return false;
    rooms[roomCode].adminId = socketId;
    return true;
  }

  static setPaused(roomCode, isPaused) {
    if (!rooms[roomCode]) return false;
    rooms[roomCode].paused = isPaused;
    return true;
  }

  // Modifier setBuzz pour potentiellement stocker plus d'infos si nécessaire
  static setBuzz(roomCode, buzzData) { // Renommé pour clarté, correspond à setLastBuzz ?
    if (!rooms[roomCode]) return false;
    rooms[roomCode].lastBuzz = buzzData; // Stocke les infos du dernier buzz traité
    return true;
  }

  // Modifier resetBuzz/clearBuzz pour correspondre à l'usage dans buzzHandlers.js
  static resetBuzz(roomCode) { // Appelé par clearBuzz
    if (!rooms[roomCode]) return false;
    const room = rooms[roomCode];
    room.firstBuzz = null; // Réinitialise qui a buzzé en premier
    room.lastBuzz = null; // Réinitialise les infos du dernier buzz traité
    // Ne réinitialise PAS l'état buzzed des joueurs ici, c'est fait dans handleResetBuzzer
    return true;
  }

  static clearBuzz(roomCode) { // Utilisé dans handleResetBuzzer
    return this.resetBuzz(roomCode);
  }

  // Garder setFirstBuzz et setLastBuzz tels quels car utilisés dans buzzHandlers
  static setFirstBuzz(roomCode, socketId) {
    if (!rooms[roomCode]) return false;
    rooms[roomCode].firstBuzz = socketId;
    return true;
  }

  static setLastBuzz(roomCode, buzzData) { // Utilisé dans processBuzzers
    if (!rooms[roomCode]) return false;
    rooms[roomCode].lastBuzz = buzzData;
    return true;
  }

  static getOptions(roomCode) {
    return rooms[roomCode]?.options;
  }

  // --- Méthodes ajoutées pour Spotify et logique générique ---

  /**
   * Met à jour l'état trouvé de la piste/question de manière générique
   * @param {string} roomCode
   * @param {boolean} artistFound
   * @param {boolean} titleFound
   */
  static updateTrackFoundStatus(roomCode, artistFound, titleFound) {
    const room = this.get(roomCode);
    if (!room) return false;

    room.artistFound = artistFound;
    room.titleFound = titleFound;

    const roomType = room.options?.roomType || 'Standard';
    room.trackIsFullyFound = (roomType === 'Standard' && (room.artistFound || room.titleFound)) ||
                             (roomType === 'Titre/Artiste' && room.artistFound && room.titleFound);
    return true;
  }

  /**
   * Réinitialise l'état pour une nouvelle piste/question (générique)
   * @param {string} roomCode
   * @param {object | null} newQuestionInfo - Peut être null pour une question manuelle
   */
  static resetQuestionState(roomCode, newQuestionInfo = null) {
    const room = this.get(roomCode);
    if (!room) return false;

    room.currentTrack = newQuestionInfo;
    room.artistFound = false;
    room.titleFound = false;
    room.trackIsFullyFound = false;
    room.firstBuzz = null;
    room.lastBuzz = null;

    // Réinitialiser l'état buzzed de tous les joueurs
    Object.values(room.players).forEach(p => p.buzzed = false);
    return true;
  }

  /**
   * Réinitialise l'état Spotify pour une nouvelle piste
   * @param {string} roomCode 
   * @param {object|null} newTrack - Nouvelle piste Spotify ou null
   * @returns {boolean}
   */
  static resetSpotifyState(roomCode, newTrack = null) {
    const room = this.get(roomCode);
    if (!room) return false;
    
    // Mettre à jour la piste actuelle
    room.currentTrack = newTrack;
    
    // Réinitialiser les états de découverte
    room.artistFound = false;
    room.titleFound = false;
    room.trackIsFullyFound = false;
    
    // Réinitialiser les buzzers
    room.firstBuzz = null;
    room.lastBuzz = null;
    
    // Réinitialiser l'état buzzed de tous les joueurs
    Object.values(room.players).forEach(player => {
      if (player.buzzed) {
        player.buzzed = false;
      }
    });
    
    return true;
  }

  /**
   * Retourne un état simplifié de la salle pour l'envoi au client.
   * @param {string} roomCode
   * @returns {object | null}
   */
  static getClientState(roomCode) {
    const room = this.get(roomCode);
    if (!room) return null;
    return {
      options: room.options,
      paused: room.paused,
      players: room.players,
      adminPresent: !!Object.values(room.players).find(p => p.isAdmin && !p.disconnected),
      // --- Champs Buzz ---
      firstBuzzPlayer: room.players[room.firstBuzz]?.pseudo || null, // Envoyer pseudo basé sur firstBuzz (socketId)
      // lastBuzz: room.lastBuzz, // Envoyer si le client en a besoin
      // --- Champs Spotify ---
      currentTrack: room.currentTrack,
      artistFound: room.artistFound,
      titleFound: room.titleFound,
      // trackIsFullyFound: room.trackIsFullyFound, // Le client le recalcule ? Non, envoyons-le.
    };
  }
  // --- Fin Méthodes ajoutées ---
}

module.exports = {
  Room,
  defaultRoomOptions, // Exporter les options par défaut
  // Ne pas exporter buzzerGracePeriods ici, c'est géré dans buzzHandlers.js
};

// src/socket/handlers/roomHandlers.js

function handleJoinRoom(socket, io, data, callback) {
  const { roomCode, pseudo, isAdmin, forceOwnership } = data;

  try {
    // ... (vérifications initiales roomCode, pseudo) ...
    const room = Room.get(roomCode);
    if (!room) return callback({ closed: true });

    if (isAdmin) {
      // CAS 1: Admin actuel se reconnecte
      if (room.adminId === socket.id) {
        // ... (logique de mise à jour disconnected, join, emit) ...
        room.players[socket.id].disconnected = false;
        socket.join(roomCode);
        io.to(roomCode).emit('admin_connected');
        io.to(roomCode).emit('update_players', room.players);

        // --- MODIFICATION : Utiliser getClientState ---
        const clientState = Room.getClientState(roomCode);
        if (clientState) {
            logger.info('JOIN_ROOM_DEBUG', `Préparation de la réponse pour ADMIN RECONNECTÉ ${socket.id} dans ${roomCode}`);
            return callback(clientState); // Envoyer l'état complet
        } else {
            logger.error('JOIN_ROOM_DEBUG', `Erreur: clientState null pour ADMIN RECONNECTÉ ${socket.id}`);
            return callback({ error: 'Erreur interne (admin reconnect)' });
        }
        // --- FIN MODIFICATION ---
        /* ANCIEN CODE:
        return callback({
          success: true, roomCode, pseudo, paused: room.paused, isAdmin: true, roomOptions: room.options
        });
        */
      }
      // CAS 2: Pas d'admin ou prise de contrôle forcée
      else if (!room.adminId || forceOwnership) {
        // ... (logique de setAdminId, removePlayer, addPlayer, join, emit) ...
        const oldAdminId = room.adminId;
        Room.setAdminId(roomCode, socket.id);
        if (oldAdminId) Room.removePlayer(roomCode, oldAdminId);
        Room.removePlayer(roomCode, socket.id); // Nettoyer au cas où
        Room.addPlayer(roomCode, socket.id, { pseudo, score: 0, buzzed: false, isAdmin: true, disconnected: false });
        socket.join(roomCode);
        io.to(roomCode).emit('admin_connected');
        io.to(roomCode).emit('update_players', room.players);

        // --- MODIFICATION : Utiliser getClientState ---
        const clientState = Room.getClientState(roomCode);
        if (clientState) {
            logger.info('JOIN_ROOM_DEBUG', `Préparation de la réponse pour NOUVEL ADMIN ${socket.id} dans ${roomCode}`);
            return callback(clientState); // Envoyer l'état complet
        } else {
            logger.error('JOIN_ROOM_DEBUG', `Erreur: clientState null pour NOUVEL ADMIN ${socket.id}`);
            return callback({ error: 'Erreur interne (new admin)' });
        }
        // --- FIN MODIFICATION ---
        /* ANCIEN CODE:
        return callback({
          success: true, roomCode, pseudo, paused: room.paused, isAdmin: true, roomOptions: room.options
        });
        */
      }
      // CAS 3: Admin déjà présent (inchangé)
      else {
        logger.info('ROOM', `Tentative connexion admin ${socket.id} refusée pour ${roomCode}, admin ${room.adminId} déjà présent.`);
        return callback({
          error: 'Un autre administrateur est déjà actif dans cette salle.',
          roomOptions: room.options // Garder les options ici
        });
      }
    }

    // --- LOGIQUE POUR JOUEUR NORMAL (utilise déjà getClientState) ---
    // ... (vérification unicité pseudo, reconnexion joueur, ajout nouveau joueur) ...
    // ... (le code existant appelle déjà getClientState à la fin) ...
    const clientState = Room.getClientState(roomCode);
    if (clientState) {
        // ... (log existant)
        callback(clientState);
    } else {
        // ... (log erreur existant)
        callback({ error: 'Erreur interne lors de la récupération de l\'état de la salle' });
    }

  } catch (error) {
    logger.error('ROOM', 'Erreur lors de l\'inscription', error);
    callback({ error: 'Erreur interne lors de l\'inscription dans la salle' });
  }
}