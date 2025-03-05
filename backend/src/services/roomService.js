//src/services/roomService.js
const { Room } = require('../models/Room');
const Ranking = require('../models/Ranking');
const { getFormattedTimestamp } = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * Ferme une salle et sauvegarde les scores des joueurs
 * @param {string} roomCode Code de la salle à fermer
 * @param {Object} io Instance Socket.io (optionnel)
 * @returns {Promise<Object>} Résultat de l'opération
 */
async function closeRoom(roomCode, io) {
  try {
    const room = Room.get(roomCode);
    
    if (!room) {
      return { success: false, error: 'Salle inexistante' };
    }
    
    // Extraire les joueurs non-admin de la salle
    const players = Object.values(room.players).filter(player => !player.isAdmin);
    
    // Charger le classement global actuel depuis Redis
    let currentRanking = await Ranking.load();
    
    // Ajouter les scores des joueurs au classement global
    for (const player of players) {
      currentRanking.push({
        pseudo: player.pseudo,
        score: player.score,
        isAdmin: false,
        timestamp: getFormattedTimestamp()
      });
    }
    
    // Sauvegarder le classement global mis à jour dans Redis
    await Ranking.save(currentRanking);
    
    logger.info('ROOMS', 'Scores des joueurs sauvegardés', { 
      roomCode, 
      playerCount: players.length 
    });
    
    // Notifier les clients si io est fourni
    if (io) {
      io.to(roomCode).emit('room_closed');
    }
    
    // Supprimer la salle
    Room.delete(roomCode);
    
    return { success: true, playerCount: players.length };
  } catch (error) {
    logger.error('ROOMS', 'Erreur lors de la fermeture de la salle', error);
    return { success: false, error: 'Erreur interne du serveur' };
  }
}

module.exports = {
  closeRoom
};