//src/services/roomService.js
const { Room } = require('../models/Room');
const Ranking = require('../models/Ranking');
const { getFormattedTimestamp } = require('../utils/helpers');
const logger = require('../utils/logger');
const spotifyService = require('./spotifyService'); // <-- AJOUTER L'IMPORT
const analyticsService = require('./analyticsService');

/**
 * Ferme une salle et sauvegarde les scores des joueurs si demandé
 * @param {string} roomCode Code de la salle à fermer
 * @param {Object} io Instance Socket.io (optionnel)
 * @param {boolean} saveScores Indique si les scores doivent être sauvegardés
 * @returns {Promise<Object>} Résultat de l'opération { success, playerCount, dataSaved, error }
 */
async function closeRoom(roomCode, io, saveScores = true) { // Ajout du paramètre saveScores
  let dataSaved = false;
  try {
    const room = Room.get(roomCode);
    
    if (!room) {
      return { success: false, error: 'Salle inexistante', dataSaved };
    }
    
    // Extraire les joueurs non-admin de la salle
    const players = Object.values(room.players).filter(player => !player.isAdmin);
    
    // Sauvegarder les scores uniquement si saveScores est true
    if (saveScores) {
      // Charger le classement global actuel depuis Redis
      let currentRanking = await Ranking.load();
      
      // Ajouter les scores des joueurs au classement global
      for (const player of players) {
        // Ne sauvegarder que si le score est > 0 ? Ou toujours ? Pour l'instant, toujours.
        currentRanking.push({
          pseudo: player.pseudo,
          score: player.score,
          isAdmin: false,
          timestamp: getFormattedTimestamp()
        });
      }
      
      // Sauvegarder le classement global mis à jour dans Redis
      const saved = await Ranking.save(currentRanking);
      if (saved) {
          dataSaved = true;
          logger.info('ROOMS', 'Scores des joueurs sauvegardés', { 
            roomCode, 
            playerCount: players.length 
          });
      } else {
          logger.error('ROOMS', 'Échec de la sauvegarde des scores dans Redis', { roomCode });
      }
    } else {
        logger.info('ROOMS', 'Fermeture de salle sans sauvegarde des scores (option désactivée)', { roomCode });
    }
    
    // Notifier les clients si io est fourni
    if (io) {
      // Envoyer l'info de sauvegarde aux clients
      io.to(roomCode).emit('room_closed', { dataSaved }); 
    }

    // Arrêter le polling Spotify pour cette salle avant de la supprimer
    spotifyService.stopSpotifyPolling(roomCode);

    // Nettoyer les analytics de la salle
    analyticsService.cleanupRoomAnalytics(roomCode);
    
    // Supprimer la room de Redis (backup)
    const RedisService = require('./redisService');
    await RedisService.delete(`room:${roomCode}`);
    
    // Supprimer la salle de la mémoire
    Room.delete(roomCode);
    
    return { success: true, playerCount: players.length, dataSaved };
  } catch (error) {
    logger.error('ROOMS', 'Erreur lors de la fermeture de la salle', error);
    return { success: false, error: 'Erreur interne du serveur', dataSaved };
  }
}

module.exports = {
  closeRoom
};