// src/socket/handlers/playerHandlers.js
const { Room, defaultRoomOptions } = require('../../models/Room');
const logger = require('../../utils/logger');
const { handleDisableBuzzer, handleResetBuzzer } = require('./buzzHandlers'); // Garder ces imports
const { syncSpectatorsAfterScoreUpdate } = require('./spectatorHandlers'); // NOUVEAU: Import pour sync spectateurs
const analyticsService = require('../../services/analyticsService'); // NOUVEAU: Import pour analytics

/**
 * Gère l'ajustement manuel du score par l'admin
 */
function handleAdjustScore(socket, io, data) {
  try {
    const { roomCode, playerId, adjustment } = data; // adjustment peut être positif ou négatif
    const room = Room.get(roomCode);

    if (!room) return logger.warn('PLAYERS', 'Salle non trouvée pour ajustement score', { roomCode });
    if (room.adminId !== socket.id) return logger.warn('PLAYERS', 'Tentative ajustement score non-admin', { roomCode, socketId: socket.id });
    if (!room.players[playerId]) return logger.warn('PLAYERS', 'Joueur non trouvé pour ajustement score', { roomCode, playerId });

    const player = room.players[playerId];
    const currentScore = player.score || 0;
    const newScore = Math.max(0, currentScore + adjustment); // S'assurer que le score ne descend pas sous 0

    if (newScore !== currentScore) {
      player.score = newScore;
      logger.info('PLAYERS', 'Score ajusté manuellement par admin', {
        roomCode, playerId, pseudo: player.pseudo, adjustment, newScore
      });
      // Émettre la mise à jour des joueurs
      io.to(roomCode).emit('update_players', room.players);
      // NOUVEAU: Synchroniser les spectateurs après mise à jour score
      syncSpectatorsAfterScoreUpdate(io, roomCode, room);
      
      // Persister dans Redis après mise à jour du score
      Room.persistToRedis(roomCode).catch(err => {
        logger.error('ROOM_PERSIST', 'Erreur persistence après ajustement score', err);
      });
    } else {
       logger.info('PLAYERS', 'Ajustement manuel sans changement de score', {
         roomCode, playerId, pseudo: player.pseudo, adjustment, currentScore
       });
    }

  } catch (error) {
    logger.error('PLAYERS', 'Erreur lors de l\'ajustement manuel du score', error);
  }
}

/**
 * Gère le jugement d'une réponse par l'admin et met à jour le score, l'état Spotify ET le buzzer
 */
function handleJudgeAnswer(socket, io, data) {
  try {
    console.log('REÇU handleJudgeAnswer, data:', JSON.stringify(data));
    // CORRECTION: Extraire directement 'judgment' (sans e) qui est envoyé par le client
    const { roomCode, playerId, judgment } = data;
    
    const room = Room.get(roomCode);

    if (!room) return logger.warn('PLAYERS', 'Salle non trouvée pour jugement', { roomCode });
    if (room.adminId !== socket.id) return logger.warn('PLAYERS', 'Tentative de jugement non-admin', { roomCode, socketId: socket.id });
    if (!room.players[playerId]) return logger.warn('PLAYERS', 'Joueur non trouvé pour jugement', { roomCode, playerId });

    // ✅ SYNCHRONISATION : Activer le flag de jugement pour bloquer les nouveaux buzzs
    // (Après toutes les vérifications pour éviter les flags orphelins)
    Room.setJudgmentInProgress(roomCode, true);
    logger.info('PLAYERS', 'Début du jugement - buzzs bloqués', { roomCode, playerId });

    const player = room.players[playerId];
    const options = room.options || defaultRoomOptions;
    const isCorrectJudgment = judgment !== 'incorrect'; // Utiliser la variable normalisée

    // --- 1. Mise à jour Score ---
    let scoreChange = 0;
    if (isCorrectJudgment) {
      // Vérifier si le jugement est 'correct_both' ou 'all_good'
      if (judgment === 'correct_both' || judgment === 'all_good') {
        // Attribuer le double des points
        scoreChange = options.pointsCorrect * 2;
      } else {
        // Attribuer les points normaux pour les autres jugements corrects
        scoreChange = options.pointsCorrect;
      }
    } else {
      // Appliquer la pénalité pour jugement incorrect
      scoreChange = options.pointsWrong > 0 ? -options.pointsWrong : 0;
    }
    const newScore = Math.max(0, (player.score || 0) + scoreChange);
    player.score = newScore;
    // --- FIN MODIFICATION SCORE ---

    // --- 2. Mise à jour État Spotify ---
    let newArtistFound = room.artistFound || false;
    let newTitleFound = room.titleFound || false;
    const roomType = room.options?.roomType || 'Standard';

    switch (judgment) {
        // Ajouter aussi les cas avec 'correct_' pour prendre en charge ce qu'envoie le frontend
        case 'correct':
            if (roomType === 'Standard') {
                 if (!newArtistFound && !newTitleFound) { newArtistFound = true; newTitleFound = true; }
                 else if (!newArtistFound) { newArtistFound = true; }
                 else if (!newTitleFound) { newTitleFound = true; }
            } else { newArtistFound = true; newTitleFound = true; }
            break;
        case 'correct_artist':
        case 'good_artist': 
            newArtistFound = true; 
            break;
        case 'correct_title':
        case 'good_title': 
            newTitleFound = true; 
            break;
        case 'correct_both':
        case 'all_good': 
            newArtistFound = true; 
            newTitleFound = true; 
            break;
        // case 'incorrect': // Ne change rien
    }
    
    // Vérifier si Room.updateTrackFoundStatus existe, sinon mettre à jour directement
    if (typeof Room.updateTrackFoundStatus === 'function') {
        Room.updateTrackFoundStatus(roomCode, newArtistFound, newTitleFound);
    } else {
        // Mettre à jour directement dans l'objet room si la méthode n'existe pas
        room.artistFound = newArtistFound;
        room.titleFound = newTitleFound;
        // Calculer si la piste est entièrement trouvée selon le type de salle
        room.trackIsFullyFound = (roomType === 'Standard' && (newArtistFound || newTitleFound)) || 
                               (roomType === 'Titre/Artiste' && newArtistFound && newTitleFound);
    }

    // --- 3. Émissions Socket ---
    // Émettre la mise à jour des joueurs (inclut nouveau score et potentiellement état buzzed)
    io.to(roomCode).emit('update_players', room.players);
    // NOUVEAU: Synchroniser les spectateurs après mise à jour score
    syncSpectatorsAfterScoreUpdate(io, roomCode, room);
    
    // 📊 ANALYTICS: Mettre à jour le verdict du buzz dans l'historique
    analyticsService.updateBuzzVerdict(roomCode, playerId, judgment);
    
    logger.info('PLAYERS', 'Score mis à jour après jugement', { // Ce log reflète maintenant le scoreChange correct
      roomCode, playerId, pseudo: player.pseudo, judgment, isCorrect: isCorrectJudgment, scoreChange, newScore
    });

    // Persister dans Redis après mise à jour du score
    Room.persistToRedis(roomCode).catch(err => {
      logger.error('ROOM_PERSIST', 'Erreur persistence après jugement', err);
    });

        // ---> AJOUTER CE BLOC DE LOG <---
    // Préparer le payload explicitement pour le log et l'émission
    const judgeAnswerPayload = {
      trackInfo: room.currentTrack, // Envoyer l'info de la piste ACTUELLE dans la room
      artistFound: room.artistFound, // Envoyer l'état trouvé MIS A JOUR
      titleFound: room.titleFound  // Envoyer l'état trouvé MIS A JOUR
  };
  console.log('[Backend][handleJudgeAnswer] Émission judge_answer AVEC PAYLOAD:', JSON.stringify(judgeAnswerPayload));
  // ---------------------------------

    // Avant l'émission de judge_answer
console.log('Envoi judge_answer avec:', { 
  roomCode, 
  judgment, 
  artistFound: room.artistFound, 
  titleFound: room.titleFound,
  newArtistFound, 
  newTitleFound
});
    
    // Émettre l'événement spécifique au jugement avec l'état Spotify
    io.to(roomCode).emit('judge_answer', {
        // judgment: judgment, // Le client n'en a peut-être pas besoin directement ici
        trackInfo: room.currentTrack, // Envoyer l'info de la piste
        artistFound: room.artistFound,
        titleFound: room.titleFound
    });
    logger.info('PLAYERS', 'Événement judge_answer émis avec état Spotify', {
        roomCode, artistFound: room.artistFound, titleFound: room.titleFound, judgment
    });


    // --- 4. Gestion Buzzer (Reset/Disable - Logique existante adaptée) ---
    // Si la piste est maintenant entièrement trouvée OU si la réponse était correcte, reset général.
    if (room.trackIsFullyFound || isCorrectJudgment) {
      logger.info('PLAYERS', `Réponse correcte ou piste trouvée (${room.trackIsFullyFound}), réinitialisation générale des buzzers`, { roomCode });
      // handleResetBuzzer met à jour l'état buzzed des joueurs et émet update_players + reset_buzzer
      handleResetBuzzer(socket, io, { roomCode });
      
      // ✅ SYNCHRONISATION : Désactiver le flag de jugement APRÈS le reset complet
      Room.setJudgmentInProgress(roomCode, false);
      logger.info('PLAYERS', 'Fin du jugement (piste trouvée/correcte) - buzzs débloqués', { roomCode, playerId });
    }
    // Si la réponse était incorrecte ET que la piste n'est PAS encore trouvée
    else if (!isCorrectJudgment && !room.trackIsFullyFound) {
      // Appliquer la pénalité seulement si incorrect ET piste non trouvée
      logger.info('PLAYERS', 'Réponse incorrecte et piste non trouvée, application de la pénalité', { roomCode });
      
      // ✅ FIX: Débloquer tous les joueurs SAUF le pénalisé AVANT d'appliquer la pénalité
      logger.info('PLAYERS', 'Déblocage des autres joueurs avant pénalité', { roomCode });
      for (let id in room.players) {
        if (id !== playerId && room.players[id]) {
          room.players[id].buzzed = false;
        }
      }
      Room.clearBuzz(roomCode); // Réinitialiser firstBuzz et lastBuzz
      
      // Appliquer la pénalité au joueur fautif (met buzzed=true, émet update_players et buzzer_disabled)
      handleDisableBuzzer(socket, io, { roomCode, playerId });
      
      // Émettre reset_buzzer pour débloquer l'UI des autres clients
      logger.info('PLAYERS', 'Émission reset_buzzer pour débloquer UI des autres clients', { roomCode });
      io.to(roomCode).emit('reset_buzzer');
      
      // ✅ SYNCHRONISATION : Désactiver le flag de jugement APRÈS la pénalité
      Room.setJudgmentInProgress(roomCode, false);
      logger.info('PLAYERS', 'Fin du jugement (incorrect/pénalité) - buzzs débloqués', { roomCode, playerId });
    }
    // Si la réponse est incorrecte MAIS que la piste est trouvée (cas rare ?), on a déjà fait le reset général plus haut.

  } catch (error) {
    logger.error('PLAYERS', 'Erreur lors du jugement de la réponse', error);
    // ✅ SYNCHRONISATION : S'assurer que le flag est désactivé même en cas d'erreur
    try {
      const { roomCode } = data;
      if (roomCode) {
        Room.setJudgmentInProgress(roomCode, false);
        logger.warn('PLAYERS', 'Flag de jugement désactivé après erreur', { roomCode });
      }
    } catch (cleanupError) {
      logger.error('PLAYERS', 'Erreur lors du nettoyage du flag de jugement', cleanupError);
    }
  }
}

// ---> NOUVELLE FONCTION HANDLER POUR FORCE_SHOW_TITLE <---
/**
 * Gère la demande de l'admin pour forcer l'affichage du titre.
 */
function handleForceShowTitle(socket, io, data) {
  try {
    const { roomCode } = data;
    const room = Room.get(roomCode);

    if (!room) return logger.warn('PLAYERS', 'Salle non trouvée pour force_show_title', { roomCode });
    // Vérifier si l'émetteur est l'admin de la salle
    if (room.adminId !== socket.id) return logger.warn('PLAYERS', 'Tentative non-admin de force_show_title', { roomCode, socketId: socket.id });

    // Si le titre n'est pas déjà trouvé
    if (!room.titleFound) {
      logger.info('PLAYERS', `Admin force l'affichage du titre pour la salle ${roomCode}`);
      room.titleFound = true; // Mettre à jour l'état

      // Recalculer si la piste est entièrement trouvée
      const roomType = room.options?.roomType || 'Standard';
      room.trackIsFullyFound = (roomType === 'Standard' && (room.artistFound || room.titleFound)) ||
                               (roomType === 'Titre/Artiste' && room.artistFound && room.titleFound);

      // Émettre l'événement 'judge_answer' pour notifier tous les clients du nouvel état
      io.to(roomCode).emit('judge_answer', {
        // judgment: 'admin_reveal_title', // Optionnel: pour info côté client si besoin
        trackInfo: room.currentTrack,
        artistFound: room.artistFound,
        titleFound: room.titleFound // L'état mis à jour
      });

      // Si la piste est maintenant entièrement trouvée à cause de cette action, reset les buzzers
      if (room.trackIsFullyFound) {
          logger.info('PLAYERS', `Piste entièrement trouvée après force_show_title, reset général des buzzers`, { roomCode });
          handleResetBuzzer(socket, io, { roomCode }); // Utiliser la fonction existante
      }

    } else {
      logger.info('PLAYERS', `Titre déjà trouvé pour la salle ${roomCode}, force_show_title ignoré.`);
    }
  } catch (error) {
    logger.error('PLAYERS', 'Erreur lors de force_show_title', error);
  }
}

// ---> NOUVELLE FONCTION HANDLER POUR FORCE_SHOW_ARTIST <---
/**
 * Gère la demande de l'admin pour forcer l'affichage de l'artiste.
 */
function handleForceShowArtist(socket, io, data) {
  try {
    const { roomCode } = data;
    const room = Room.get(roomCode);

    if (!room) return logger.warn('PLAYERS', 'Salle non trouvée pour force_show_artist', { roomCode });
    // Vérifier si l'émetteur est l'admin de la salle
    if (room.adminId !== socket.id) return logger.warn('PLAYERS', 'Tentative non-admin de force_show_artist', { roomCode, socketId: socket.id });

    // Si l'artiste n'est pas déjà trouvé
    if (!room.artistFound) {
      logger.info('PLAYERS', `Admin force l'affichage de l'artiste pour la salle ${roomCode}`);
      room.artistFound = true; // Mettre à jour l'état

      // Recalculer si la piste est entièrement trouvée
      const roomType = room.options?.roomType || 'Standard';
      room.trackIsFullyFound = (roomType === 'Standard' && (room.artistFound || room.titleFound)) ||
                               (roomType === 'Titre/Artiste' && room.artistFound && room.titleFound);

      // Émettre l'événement 'judge_answer' pour notifier tous les clients du nouvel état
      io.to(roomCode).emit('judge_answer', {
        // judgment: 'admin_reveal_artist', // Optionnel
        trackInfo: room.currentTrack,
        artistFound: room.artistFound, // L'état mis à jour
        titleFound: room.titleFound
      });

       // Si la piste est maintenant entièrement trouvée à cause de cette action, reset les buzzers
       if (room.trackIsFullyFound) {
          logger.info('PLAYERS', `Piste entièrement trouvée après force_show_artist, reset général des buzzers`, { roomCode });
          handleResetBuzzer(socket, io, { roomCode }); // Utiliser la fonction existante
      }

    } else {
      logger.info('PLAYERS', `Artiste déjà trouvé pour la salle ${roomCode}, force_show_artist ignoré.`);
    }
  } catch (error) {
    logger.error('PLAYERS', 'Erreur lors de force_show_artist', error);
  }
}

// ---> NOUVELLE FONCTION HANDLER POUR FORCE_HIDE_TITLE <---
function handleForceHideTitle(socket, io, data) {
  try {
    const { roomCode } = data;
    const room = Room.get(roomCode);

    if (!room) return logger.warn('PLAYERS', 'Salle non trouvée pour force_hide_title', { roomCode });
    if (room.adminId !== socket.id) return logger.warn('PLAYERS', 'Tentative non-admin de force_hide_title', { roomCode, socketId: socket.id });

    // Si le titre est actuellement trouvé
    if (room.titleFound) {
      logger.info('PLAYERS', `Admin force le masquage du titre pour la salle ${roomCode}`);
      const wasFullyFound = room.trackIsFullyFound; // Sauvegarder l'état avant modif
      room.titleFound = false; // Mettre à jour l'état

      // Recalculer si la piste est entièrement trouvée
      const roomType = room.options?.roomType || 'Standard';
      room.trackIsFullyFound = (roomType === 'Standard' && (room.artistFound || room.titleFound)) ||
                               (roomType === 'Titre/Artiste' && room.artistFound && room.titleFound);

      // Émettre l'événement 'judge_answer' pour notifier tous les clients du nouvel état
      io.to(roomCode).emit('judge_answer', {
        trackInfo: room.currentTrack,
        artistFound: room.artistFound,
        titleFound: room.titleFound // L'état mis à jour
      });

      // Si la piste N'EST PLUS entièrement trouvée à cause de cette action, reset les buzzers pour permettre de re-buzzer
      if (wasFullyFound && !room.trackIsFullyFound) {
          logger.info('PLAYERS', `Piste n'est plus entièrement trouvée après force_hide_title, reset général des buzzers`, { roomCode });
          handleResetBuzzer(socket, io, { roomCode });
      }

    } else {
      logger.info('PLAYERS', `Titre déjà masqué pour la salle ${roomCode}, force_hide_title ignoré.`);
    }
  } catch (error) {
    logger.error('PLAYERS', 'Erreur lors de force_hide_title', error);
  }
}

// ---> NOUVELLE FONCTION HANDLER POUR FORCE_HIDE_ARTIST <---
function handleForceHideArtist(socket, io, data) {
  try {
    const { roomCode } = data;
    const room = Room.get(roomCode);

    if (!room) return logger.warn('PLAYERS', 'Salle non trouvée pour force_hide_artist', { roomCode });
    if (room.adminId !== socket.id) return logger.warn('PLAYERS', 'Tentative non-admin de force_hide_artist', { roomCode, socketId: socket.id });

    // Si l'artiste est actuellement trouvé
    if (room.artistFound) {
      logger.info('PLAYERS', `Admin force le masquage de l'artiste pour la salle ${roomCode}`);
       const wasFullyFound = room.trackIsFullyFound; // Sauvegarder l'état avant modif
      room.artistFound = false; // Mettre à jour l'état

      // Recalculer si la piste est entièrement trouvée
      const roomType = room.options?.roomType || 'Standard';
      room.trackIsFullyFound = (roomType === 'Standard' && (room.artistFound || room.titleFound)) ||
                               (roomType === 'Titre/Artiste' && room.artistFound && room.titleFound);

      // Émettre l'événement 'judge_answer' pour notifier tous les clients du nouvel état
      io.to(roomCode).emit('judge_answer', {
        trackInfo: room.currentTrack,
        artistFound: room.artistFound, // L'état mis à jour
        titleFound: room.titleFound
      });

      // Si la piste N'EST PLUS entièrement trouvée à cause de cette action, reset les buzzers
      if (wasFullyFound && !room.trackIsFullyFound) {
          logger.info('PLAYERS', `Piste n'est plus entièrement trouvée après force_hide_artist, reset général des buzzers`, { roomCode });
          handleResetBuzzer(socket, io, { roomCode });
      }

    } else {
      logger.info('PLAYERS', `Artiste déjà masqué pour la salle ${roomCode}, force_hide_artist ignoré.`);
    }
  } catch (error) {
    logger.error('PLAYERS', 'Erreur lors de force_hide_artist', error);
  }
}

// ---> NOUVELLE FONCTION HANDLER POUR NEXT_QUESTION <---
/**
 * Gère le passage à la question suivante (mode manuel sans Spotify)
 */
function handleNextQuestion(socket, io, data) {
  try {
    const { roomCode } = data;
    const room = Room.get(roomCode);

    if (!room) {
      return logger.warn('PLAYERS', 'Salle non trouvée pour next_question', { roomCode });
    }

    if (room.adminId !== socket.id) {
      return logger.warn('PLAYERS', 'Tentative non-admin de next_question', { roomCode, socketId: socket.id });
    }

    logger.info('PLAYERS', 'Admin passe à la question suivante', { roomCode });
    
    // Réinitialiser complètement l'état de la question/piste
    Room.resetQuestionState(roomCode, null); // null = pas de piste Spotify
    
    // Informer tous les clients du changement
    io.to(roomCode).emit('next_question', { roomCode });
    io.to(roomCode).emit('update_players', room.players);
    // NOUVEAU: Synchroniser les spectateurs après reset
    syncSpectatorsAfterScoreUpdate(io, roomCode, room);

    logger.info('PLAYERS', 'Question suivante activée', { roomCode });

  } catch (error) {
    logger.error('PLAYERS', 'Erreur lors du passage à la question suivante', error);
  }
}

/**
 * Attache les événements de joueur au socket
 * @param {Socket} socket - Socket client
 * @param {Server} io - Instance Socket.IO
 */
function attachEvents(socket, io) {
  // Événement pour le jugement d'un buzz (affecte score ET buzzer)
  socket.on('judge_response', (data) => handleJudgeAnswer(socket, io, data));

  // Événement pour l'ajustement manuel (affecte score SEULEMENT)
  socket.on('adjust_score', (data) => handleAdjustScore(socket, io, data));

  // ---> AJOUT DES NOUVEAUX ÉCOUTEURS <---
  socket.on('force_show_title', (data) => handleForceShowTitle(socket, io, data));
  socket.on('force_show_artist', (data) => handleForceShowArtist(socket, io, data));
  socket.on('force_hide_title', (data) => handleForceHideTitle(socket, io, data));
  socket.on('force_hide_artist', (data) => handleForceHideArtist(socket, io, data));
  socket.on('next_question', (data) => handleNextQuestion(socket, io, data));
  // ------------------------------------

  // Garder l'ancien 'update_score' commenté ou le supprimer
  // socket.on('update_score', (data) => handleUpdateScore(socket, io, data));
}

module.exports = {
  attachEvents,
  handleNextQuestion
};