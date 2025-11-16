// src/socket/handlers/buzzHandlers.js
const { Room, defaultRoomOptions } = require('../../models/Room'); // Importer defaultRoomOptions
const logger = require('../../utils/logger');
const timeSyncService = require('../../services/timeSyncService');
const analyticsService = require('../../services/analyticsService');

// Stockage des périodes de grâce pour les buzzers
const buzzerGracePeriods = {};

// Stockage des latences moyennes par joueur
const playerLatencies = {};

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

  // Ping pour mesurer la latence
  socket.on('ping', (timestamp, callback) => handlePing(socket, timestamp, callback));

  // Synchronisation temporelle (time_sync)
  socket.on('time_sync', (clientTimestamp, callback) => handleTimeSync(socket, clientTimestamp, callback));

  // Réception de l'offset calculé par le client (pour analytics)
  socket.on('time_sync_offset', (data) => {
    if (data && typeof data.offset === 'number' && typeof data.rtt === 'number') {
      timeSyncService.recordOffset(socket.id, data.offset, data.rtt);
    }
  });

  // Nettoyage lors de la déconnexion
  socket.on('disconnect', () => {
    cleanupPlayerData(socket.id);
  });
}

/**
 * Nettoyage complet des données d'un joueur déconnecté
 */
function cleanupPlayerData(socketId) {
  // Nettoyer les données de latence
  if (playerLatencies[socketId]) {
    delete playerLatencies[socketId];
  }

  // Nettoyer les données de synchronisation temporelle
  timeSyncService.cleanupSocket(socketId);

  // Nettoyer des périodes de grâce en cours
  for (const roomCode in buzzerGracePeriods) {
    if (buzzerGracePeriods[roomCode] && buzzerGracePeriods[roomCode].candidates) {
      buzzerGracePeriods[roomCode].candidates = buzzerGracePeriods[roomCode].candidates.filter(
        candidate => candidate.socketId !== socketId
      );
      
      // Si plus de candidats, nettoyer complètement
      if (buzzerGracePeriods[roomCode].candidates.length === 0) {
        delete buzzerGracePeriods[roomCode];
        logger.info('CLEANUP', 'Période de grâce nettoyée après déconnexion', { socketId, roomCode });
      }
    }
  }
}

/**
 * Gère le ping pour mesurer la latence
 */
function handlePing(socket, clientTimestamp, callback) {
  const serverTimestamp = Date.now();
  
  // Gérer les deux formats : timestamp direct OU objet { clientTime: timestamp }
  const actualTimestamp = typeof clientTimestamp === 'object' && clientTimestamp.clientTime 
    ? clientTimestamp.clientTime 
    : clientTimestamp;
  
  // Valider le timestamp
  if (!actualTimestamp || typeof actualTimestamp !== 'number' || actualTimestamp <= 0) {
    logger.warn('PING', 'Timestamp invalide reçu', {
      socketId: socket.id,
      receivedData: clientTimestamp,
      type: typeof clientTimestamp
    });
    if (callback) callback({ serverTimestamp, latency: null, ignored: true, reason: 'invalid_timestamp' });
    return;
  }
  
  const latency = Math.max(0, serverTimestamp - actualTimestamp);
  
  // 🚀 FILTRER LES PINGS ABERRANTS
  // Ignorer les latences impossibles (>2000ms = connexion morte)
  if (latency > 2000) {
    logger.warn('PING', 'Latence aberrante ignorée', {
      socketId: socket.id,
      latency,
      clientTimestamp,
      serverTimestamp
    });
    callback({ serverTimestamp, latency, ignored: true });
    return;
  }
  
  // 🚀 AMÉLIORATION 7: Gestion des pics de latence temporaires
  let shouldIgnoreSpike = false;
  
  // Si on a déjà des données de latence, vérifier les pics
  if (playerLatencies[socket.id] && playerLatencies[socket.id].average) {
    const currentAverage = playerLatencies[socket.id].average;
    const deviation = Math.abs(latency - currentAverage);
    const isSignificantSpike = deviation > (currentAverage * 1.5) && latency > 500;
    
    // Ignorer les pics isolés significatifs
    if (isSignificantSpike) {
      shouldIgnoreSpike = true;
      logger.warn('PING', 'Pic de latence temporaire ignoré', {
        socketId: socket.id,
        latency,
        currentAverage,
        deviation,
        spikeThreshold: currentAverage * 1.5
      });
      
      callback({ serverTimestamp, latency, ignored: true, reason: 'spike' });
      return;
    }
  }
  
  // Initialiser ou mettre à jour la latence moyenne (moyenne mobile sur 3 valeurs)
  if (!playerLatencies[socket.id]) {
    playerLatencies[socket.id] = {
      values: [latency],
      average: latency,
      spikeCount: 0 // Compteur de pics pour statistiques
    };
  } else {
    const values = playerLatencies[socket.id].values;
    values.push(latency);
    if (values.length > 3) values.shift(); // Garder seulement les 3 dernières
    
    // Filtrer les valeurs null/undefined avant de calculer la moyenne
    const validValues = values.filter(v => v != null && typeof v === 'number' && !isNaN(v));
    
    if (validValues.length > 0) {
      playerLatencies[socket.id].average = validValues.reduce((a, b) => a + b, 0) / validValues.length;
    } else {
      playerLatencies[socket.id].average = null;
    }

    
    // Incrémenter le compteur de pics si c'était un pic ignoré
    if (shouldIgnoreSpike) {
      playerLatencies[socket.id].spikeCount = (playerLatencies[socket.id].spikeCount || 0) + 1;
    }
  }

  callback({ serverTimestamp, latency });
}

/**
 * Gère la synchronisation temporelle pour éliminer les désynchronisations d'horloge client
 * Le client utilise cette réponse pour calculer son offset temporel
 */
function handleTimeSync(socket, clientTimestamp, callback) {
  const response = timeSyncService.handleTimeSync(socket.id, clientTimestamp);
  
  if (callback && typeof callback === 'function') {
    callback(response);
  }
}

/**
 * Calcule la période de grâce adaptative basée sur les RTT réels de la salle
 */
function calculateGracePeriod(roomCode) {
  const room = Room.get(roomCode);
  if (!room) return 300; // Fallback par défaut

  const roomRTTs = [];
  
  // ✅ CORRECTION: Collecter les VRAIS RTT depuis timeSyncService (pas les pings bidon)
  for (const socketId in room.players) {
    const syncStats = timeSyncService.getStats(socketId);
    // Utiliser le vrai RTT de time_sync si disponible
    if (syncStats && syncStats.averageRtt != null && !isNaN(syncStats.averageRtt)) {
      roomRTTs.push(syncStats.averageRtt);
    }
    // Sinon fallback sur une valeur par défaut (le joueur n'est pas synchronisé)
    else {
      roomRTTs.push(150); // Valeur conservative pour joueurs non-sync
    }
  }

  if (roomRTTs.length === 0) return 300; // Pas de données de latence

  // 🚀 FILTRAGE DES RTT ABERRANTS
  // Éliminer les connexions non viables (> 1000ms) et négatives
  const validRTTs = roomRTTs.filter(rtt => rtt >= 0 && rtt <= 1000);
  
  // Si tous les RTT sont aberrants, fallback
  if (validRTTs.length === 0) {
    return 300;
  }

  // Si on a éliminé des RTT aberrants, le signaler
  if (validRTTs.length < roomRTTs.length) {
    const filteredOut = roomRTTs.filter(rtt => rtt < 0 || rtt > 1000);
    logger.info('GRACE_PERIOD', 'RTT aberrants filtrés', {
      roomCode,
      filteredOut,
      validCount: validRTTs.length,
      totalCount: roomRTTs.length
    });
  }

  const maxRTT = Math.max(...validRTTs);
  const minRTT = Math.min(...validRTTs);
  const spread = maxRTT - minRTT;

  // 🚀 AMÉLIORATION 3: Période de grâce adaptée au nombre de joueurs
  const playerCount = Object.keys(room.players).filter(id => !room.players[id].isAdmin).length;
  
  // Base adaptée au nombre de joueurs
  let basePeriod;
  if (playerCount <= 2) basePeriod = 150;      // Peu de joueurs = période courte
  else if (playerCount <= 4) basePeriod = 200; // Nombre moyen
  else if (playerCount <= 6) basePeriod = 250; // Beaucoup de joueurs
  else basePeriod = 300;                       // Très grande salle

  // Plafond adapté aussi
  const maxPeriod = playerCount > 6 ? 600 : 500;
  
  // Calcul final : base + spread/2, plafonnée selon le nombre de joueurs
  const gracePeriod = Math.min(basePeriod + (spread / 2), maxPeriod);
  
  logger.info('GRACE_PERIOD', 'Période de grâce calculée', {
    roomCode,
    gracePeriod,
    basePeriod,
    maxPeriod,
    spread,
    minRTT,
    maxRTT,
    playerCount,
    validPlayerCount: validRTTs.length,
    totalPlayerCount: roomRTTs.length,
    wasFiltered: validRTTs.length < roomRTTs.length
  });

  return gracePeriod;
}

/**
 * Calcule le seuil d'égalité adaptatif selon la qualité des connexions
 */
function calculateEqualityThreshold(validLatencies) {
  if (validLatencies.length === 0) return 50; // Fallback par défaut
  
  const averageLatency = validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length;
  
  // Seuil adaptatif : connexions rapides = seuil strict, connexions lentes = seuil plus permissif
  if (averageLatency < 50) return 30;      // Connexions très rapides
  if (averageLatency < 150) return 50;     // Connexions normales
  if (averageLatency < 300) return 75;     // Connexions moyennes
  return 100;                              // Connexions lentes
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

    // --- LOGIQUE GÉNÉRIQUE : Vérifier si la piste/question est déjà résolue ---
    // Cette logique fonctionne avec ou sans Spotify
    if (room.trackIsFullyFound) {
        logger.info('BUZZ', `Buzz rejeté pour ${socket.id} dans ${roomCode}: piste/question déjà résolue.`);
        const firstBuzzerPseudo = room.players[room.firstBuzz]?.pseudo;
        return callback({ error: 'La piste/question a déjà été trouvée.', lateAttempt: true, buzzedBy: firstBuzzerPseudo });
    }
    // --- Fin Vérification ---

    // Vérifier si la partie est en pause
    if (room.paused) {
      return callback({ error: 'La partie est en pause' });
    }

    // ✅ VALIDATION SERVEUR : Vérifier le délai de 3 secondes après changement de track Spotify
    const TRACK_CHANGE_DELAY = 3000; // 3 secondes
    if (room.trackChangedAt && room.options?.spotifyEnabled) {
      const timeSinceChange = Date.now() - room.trackChangedAt;
      if (timeSinceChange < TRACK_CHANGE_DELAY) {
        const remainingMs = TRACK_CHANGE_DELAY - timeSinceChange;
        logger.info('BUZZ', `Buzz rejeté pour ${socket.id}: délai de sécurité en cours`, {
          roomCode,
          timeSinceChange,
          remainingMs
        });
        return callback({ 
          error: 'Délai de sécurité en cours, veuillez patienter',
          remainingMs 
        });
      }
    }

    // ✅ SYNCHRONISATION : Vérifier si un jugement est en cours
    if (Room.isJudgmentInProgress(roomCode)) {
      return callback({ error: 'Jugement en cours, veuillez patienter' });
    }

    // Si un buzz est déjà validé, traiter normalement
    if (room.firstBuzz) {
      // *** VÉRIFIER que le joueur qui a firstBuzz n'est pas en pénalité ***
      const firstBuzzer = room.players[room.firstBuzz];
      if (firstBuzzer && firstBuzzer.buzzed) {
        // Le premier buzzer est toujours actif (pas encore jugé ou en pénalité)
        const buzzingPlayer = firstBuzzer.pseudo || 'Quelqu\'un';
        return callback({
          error: `${buzzingPlayer} a été plus rapide !`,
          buzzedBy: buzzingPlayer,
          lateAttempt: true
        });
      } else {
        // Le premier buzzer n'est plus actif, réinitialiser firstBuzz
        logger.info('BUZZ', 'Premier buzzer inactif, réinitialisation', { 
          roomCode, 
          previousFirstBuzz: room.firstBuzz 
        });
        Room.resetBuzz(roomCode);
        // Continuer le traitement normal du buzz
      }
    }

    // Vérification du joueur
    if (!room.players[socket.id]) {
      return callback({ error: 'Joueur introuvable dans la salle' });
    }

    // 🚀 CORRECTION: Utiliser UNIQUEMENT le vrai RTT depuis time_sync
    // NE JAMAIS utiliser playerLatencies qui contient des données bidon (offset déguisé en ping)
    const syncStats = timeSyncService.getStats(socket.id);
    const isClientSynced = syncStats !== null && syncStats.offsets && syncStats.offsets.length > 0;
    
    // ⚠️ IMPORTANT: Pour les clients non-synchronisés, on utilise un fallback de 150ms
    // On ne peut PAS utiliser playerLatencies car le ping calcule mal la latence (mélange avec l'offset)
    const playerRTT = syncStats?.averageRtt || 150;
    
    // 🚀 AMÉLIORATION TIME SYNC: Utiliser le timestamp client synchronisé comme base
    // Le clientTimestamp est maintenant synchronisé avec l'horloge serveur (via getServerTime())
    // On ne l'utilise donc plus comme "timestamp d'envoi" mais comme "timestamp de référence serveur"
    const serverTimestamp = Date.now(); // Timestamp de réception serveur
    
    // ⏱️ CALCUL DU TEMPS COMPENSÉ:
    // Vérifier si le client est synchronisé via timeSyncService (source de vérité unique)
    
    let compensatedTime;
    if (isClientSynced) {
      // ✅ CLIENT SYNCHRONISÉ: Le clientTimestamp EST DÉJÀ le temps compensé
      // Le client a envoyé Date.now() + offset, qui donne le moment du clic en temps serveur
      // ⚠️ NE PAS ajouter de latence ici, sinon on pénalise les joueurs avec haute latence !
      compensatedTime = clientTimestamp;
      
      logger.info('BUZZ', 'Utilisation timestamp client synchronisé', {
        socketId: socket.id,
        clientTimestamp,
        serverTimestamp,
        timeDifference: Math.abs(clientTimestamp - serverTimestamp),
        playerRTT,
        compensatedTime,
        medianOffset: syncStats.medianOffset
      });
    } else {
      // ⚠️ CLIENT NON SYNCHRONISÉ: Fallback sur méthode classique
      // Utiliser le timestamp serveur et soustraire la demi-latence
      // Note: playerRTT ici est le VRAI RTT (pas l'offset déguisé)
      compensatedTime = serverTimestamp - (playerRTT / 2);
      const timeDifference = Math.abs(clientTimestamp - serverTimestamp);
      
      logger.warn('BUZZ', 'Client non synchronisé, fallback méthode classique', {
        socketId: socket.id,
        clientTimestamp,
        serverTimestamp,
        timeDifference,
        playerRTT,
        compensatedTime
      });
    }

    // PÉRIODE DE GRÂCE: si c'est le premier buzz, ouvrir une fenêtre d'opportunité
    if (!buzzerGracePeriods[roomCode]) {
      // 🚀 AMÉLIORATION 4: Recalculer à chaque nouveau buzz
      const gracePeriod = calculateGracePeriod(roomCode);
      
      // Premier buzz reçu - créer une période de grâce
      buzzerGracePeriods[roomCode] = {
        candidates: [{
          socketId: socket.id,
          pseudo: room.players[socket.id].pseudo,
          timestamp: clientTimestamp,
          serverTimestamp: serverTimestamp,
          latency: playerRTT, // ✅ CORRECTION: Renommé de 'rtt' en 'latency' pour cohérence avec analytics
          compensatedTime: compensatedTime, // ⏱️ Utiliser le temps compensé calculé
          isSynced: isClientSynced // ℹ️ Indiquer si le client était synchronisé
        }],
        gracePeriod: gracePeriod,
        startTime: serverTimestamp // Pour debugging
      };

      // Confirmer réception sans désigner de gagnant encore
      callback({ received: true });

      logger.info('BUZZ', 'Période de grâce démarrée', {
        socketId: socket.id,
        roomCode,
        pseudo: room.players[socket.id].pseudo,
        latency: playerRTT, // ✅ CORRECTION: 'latency' au lieu de 'rtt' pour cohérence
        gracePeriod: gracePeriod,
        compensatedTime: compensatedTime,
        clientTimestamp,
        serverTimestamp,
        isClientSynced
      });

      // Démarrer un timer adaptatif avant de déterminer le gagnant
      setTimeout(() => {
        processBuzzers(roomCode, io);
      }, gracePeriod);

      return;
    }

    // Si on est déjà dans une période de grâce, ajouter ce buzz à la liste
    const existingCandidate = buzzerGracePeriods[roomCode].candidates.find(c => c.socketId === socket.id);
    
    // ✅ ANTISPAM SERVEUR : Ignorer les buzz multiples du même joueur
    if (existingCandidate) {
      logger.info('BUZZ', 'Buzz multiple ignoré (antispam)', {
        socketId: socket.id,
        roomCode,
        pseudo: room.players[socket.id].pseudo,
        originalTime: existingCandidate.compensatedTime,
        newTime: compensatedTime
      });
      return callback({ received: true, duplicate: true });
    }
    
    buzzerGracePeriods[roomCode].candidates.push({
      socketId: socket.id,
      pseudo: room.players[socket.id].pseudo,
      timestamp: clientTimestamp,
      serverTimestamp: serverTimestamp,
      latency: playerRTT, // ✅ CORRECTION: Renommé de 'rtt' en 'latency' pour cohérence avec analytics
      compensatedTime: compensatedTime, // ⏱️ Utiliser le temps compensé calculé
      isSynced: isClientSynced // ℹ️ Indiquer si le client était synchronisé
    });

    logger.info('BUZZ', 'Buzz ajouté pendant la période de grâce', {
      socketId: socket.id,
      roomCode,
      pseudo: room.players[socket.id].pseudo,
      candidateCount: buzzerGracePeriods[roomCode].candidates.length,
      latency: playerRTT, // ✅ CORRECTION: 'latency' au lieu de 'rtt' pour cohérence
      compensatedTime: compensatedTime,
      isClientSynced
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
 * Traite les buzzers après la période de grâce avec compensation de latence
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

    const candidates = buzzerGracePeriods[roomCode].candidates;
    const gracePeriod = buzzerGracePeriods[roomCode].gracePeriod;

    logger.info('BUZZ_PROCESS', 'Traitement des buzzers après période de grâce', {
      roomCode,
      candidateCount: candidates.length,
      candidates: candidates.map(c => ({
        pseudo: c.pseudo,
        latency: c.latency,
        compensatedTime: c.compensatedTime,
        isSynced: c.isSynced
      }))
    });

    if (candidates.length === 0) {
      delete buzzerGracePeriods[roomCode];
      return;
    }

    // Filtrer les candidats encore valides (joueurs toujours connectés)
    const validCandidates = candidates.filter(c => room.players[c.socketId]);

    if (validCandidates.length === 0) {
      logger.info('BUZZ_PROCESS', 'Aucun candidat valide pour le buzz', { roomCode });
      delete buzzerGracePeriods[roomCode];
      return;
    }

    // Trier par temps compensé (calculé selon la synchronisation du client)
    // - Client synchronisé : clientTimestamp (déjà en temps serveur grâce à l'offset NTP)
    // - Client non synchronisé : serverTimestamp - (latency / 2)
    validCandidates.sort((a, b) => a.compensatedTime - b.compensatedTime);

    let winner = validCandidates[0];
    let tied = null; // Déclaration pour usage ultérieur

    // 🚀 AMÉLIORATION 5: Seuil d'égalité adaptatif
    const roomLatencies = validCandidates.map(c => c.latency);
    const equalityThreshold = calculateEqualityThreshold(roomLatencies);

    // Vérifier s'il y a égalité avec seuil adaptatif
    // ⚠️ IMPORTANT: Le départage aléatoire ne s'applique QUE si au moins un joueur n'est PAS synchronisé
    // Si tous les joueurs sont synchronisés, leur temps est précis et on respecte l'ordre réel
    const second = validCandidates[1];
    const allSynced = validCandidates.every(c => c.isSynced);
    
    if (second && Math.abs(winner.compensatedTime - second.compensatedTime) < equalityThreshold && !allSynced) {
      
      // Départage aléatoire entre les ex-aequo (uniquement si des joueurs ne sont pas synchronisés)
      tied = validCandidates.filter(c => 
        Math.abs(c.compensatedTime - winner.compensatedTime) < equalityThreshold
      );
      
      winner = tied[Math.floor(Math.random() * tied.length)];
      
      logger.info('BUZZ_PROCESS', 'Départage aléatoire appliqué (joueurs non synchronisés)', {
        roomCode,
        tiedCount: tied.length,
        winner: winner.pseudo,
        equalityThreshold,
        timeDifference: second ? Math.abs(winner.compensatedTime - second.compensatedTime) : 'N/A',
        allSynced: false,
        syncedCount: validCandidates.filter(c => c.isSynced).length
      });
    } else if (second && Math.abs(winner.compensatedTime - second.compensatedTime) < equalityThreshold && allSynced) {
      // Tous synchronisés mais très proche : on garde le premier (pas de départage aléatoire)
      logger.info('BUZZ_PROCESS', 'Pas de départage aléatoire (tous synchronisés)', {
        roomCode,
        winner: winner.pseudo,
        timeDifference: Math.abs(winner.compensatedTime - second.compensatedTime),
        equalityThreshold,
        allSynced: true
      });
    }

    // Désigner le gagnant
    Room.setFirstBuzz(roomCode, winner.socketId);
    room.players[winner.socketId].buzzed = true;

    const hadEquality = second && Math.abs(winner.compensatedTime - second.compensatedTime) < equalityThreshold;
    const hadRandomTiebreak = tied && tied.length > 1;

    const buzzData = {
      buzzedBy: winner.pseudo,
      playerId: winner.socketId,
      roomCode,
      _debug: {
        latency: winner.latency,
        compensatedTime: winner.compensatedTime,
        candidateCount: validCandidates.length,
        equalityThreshold,
        wasRandomTieBreak: hadRandomTiebreak,
        isSynced: winner.isSynced, // ℹ️ Indiquer si le gagnant était synchronisé
        syncedCount: validCandidates.filter(c => c.isSynced).length // 📊 Combien de clients étaient synchronisés
      }
    };

    Room.setLastBuzz(roomCode, buzzData);
    io.to(roomCode).emit('buzzed', buzzData);

    // 📊 Enregistrer l'event dans les analytics
    analyticsService.recordBuzzEvent(roomCode, {
      winner: winner.pseudo,
      winnerSocketId: winner.socketId, // ✅ Passer explicitement le socketId du gagnant
      gracePeriod: gracePeriod,
      equalityThreshold: equalityThreshold,
      candidates: validCandidates.map((c, idx) => ({
        pseudo: c.pseudo,
        socketId: c.socketId,
        clientTimestamp: c.clientTimestamp,
        serverTimestamp: c.serverTimestamp,
        compensatedTime: c.compensatedTime,
        latency: c.latency,
        isSynced: c.isSynced,
        delta: c.compensatedTime - winner.compensatedTime,
        wasEqual: idx > 0 && Math.abs(c.compensatedTime - winner.compensatedTime) < equalityThreshold
      })),
      hadEquality: hadEquality,
      hadRandomTiebreak: hadRandomTiebreak,
      syncedCount: validCandidates.filter(c => c.isSynced).length
    });

    // --- NOUVEAU : Émettre un événement générique pour les intégrations externes ---
    io.to(roomCode).emit('player_buzzed', {
      roomCode,
      playerId: winner.socketId,
      pseudo: winner.pseudo
    });

    logger.info('BUZZ_PROCESS', 'Gagnant désigné après période de grâce', {
      roomCode,
      winner: winner.pseudo,
      socketId: winner.socketId,
      latency: winner.latency,
      compensatedTime: winner.compensatedTime,
      candidateCount: validCandidates.length,
      equalityThreshold,
      isSynced: winner.isSynced,
      syncedCount: validCandidates.filter(c => c.isSynced).length,
      totalCount: validCandidates.length
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
 * Gère la réinitialisation des buzzers
 */
function handleResetBuzzer(socket, io, data) {
  try {
    const { roomCode } = data;
    const room = Room.get(roomCode);

    if (!room) {
      //logger.warn('RESET_BUZZER', 'Salle non trouvée pour réinitialisation', { roomCode });
      return;
    }
    // Vérifier que c'est bien l'admin qui demande la réinitialisation
    if (room.adminId !== socket.id) {
      //logger.warn('RESET_BUZZER', 'Tentative de réinitialisation non-admin', { roomCode, socketId: socket.id });
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
    //logger.info('RESET_BUZZER', 'Nettoyage des données de buzz de la salle', { roomCode });
    Room.clearBuzz(roomCode); // Réinitialise firstBuzz et lastBuzz

    // Nettoyer les périodes de grâce en cours
    if (buzzerGracePeriods[roomCode]) {
      delete buzzerGracePeriods[roomCode];
    }

    // *** AJOUT IMPORTANT ***
    // Émettre à nouveau l'état des joueurs après avoir mis buzzed=false
    logger.info('RESET_BUZZER', 'Émission de update_players après réinitialisation des flags buzzed', { roomCode });
    io.to(roomCode).emit('update_players', room.players);

    // Émettre l'événement spécifique de réinitialisation pour l'UI client
    //logger.info('RESET_BUZZER', 'Émission de l\'événement reset_buzzer', { roomCode });
    io.to(roomCode).emit('reset_buzzer'); // Garder cet événement

    logger.info('RESET_BUZZER', 'Buzzers réinitialisés avec succès', { roomCode });
  } catch (error) {
    logger.error('RESET_BUZZER', 'Erreur lors de la réinitialisation des buzzers', error);
  }
}

/**
 * Gère la désactivation temporaire du buzzer pour un joueur (après mauvaise réponse)
 * @param {Object} socket - Socket de l'admin
 * @param {Object} io - Instance Socket.IO
 * @param {Object} data - { roomCode, playerId, customDelay? }
 *   - customDelay: Délai personnalisé en secondes (optionnel, sinon utilise penaltyDelay)
 */
function handleDisableBuzzer(socket, io, data) {
  try {
    // On attend juste roomCode et playerId, la durée vient des options de la salle
    const { roomCode, playerId, customDelay } = data;
    const room = Room.get(roomCode);
    
    if (!room) return logger.warn('DISABLE_BUZZER', 'Salle non trouvée', { roomCode });
    if (room.adminId !== socket.id) return logger.warn('DISABLE_BUZZER', 'Tentative non-admin', { roomCode, socketId: socket.id });
    if (!room.players[playerId]) return logger.warn('DISABLE_BUZZER', 'Joueur non trouvé', { roomCode, playerId });
    
    const options = room.options || defaultRoomOptions;
    // Utiliser customDelay si fourni, sinon penaltyDelay des options
    const penaltyDurationSeconds = customDelay !== undefined ? customDelay : options.penaltyDelay;
    
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
  playerLatencies // Exporter pour les analytics
};