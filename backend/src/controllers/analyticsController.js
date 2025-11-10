// src/controllers/analyticsController.js
const analyticsService = require('../services/analyticsService');
const { Room } = require('../models/Room');
const { playerLatencies } = require('../socket/handlers/buzzHandlers');
const logger = require('../utils/logger');

/**
 * Controller pour les endpoints d'analytics
 * Toutes les routes sont protégées par le middleware auth admin
 */

/**
 * GET /api/admin/rooms/:roomCode/analytics/sync
 * Récupère les données de synchronisation des clients
 */
async function getSyncAnalytics(req, res) {
  try {
    const { roomCode } = req.params;
    
    const room = Room.get(roomCode);
    if (!room) {
      return res.status(404).json({ error: 'Salle non trouvée' });
    }
    
    const syncData = analyticsService.getSyncAnalytics(room, playerLatencies);
    
    res.json(syncData);
  } catch (error) {
    logger.error('ANALYTICS', 'Erreur récupération sync analytics', { 
      roomCode: req.params.roomCode,
      error: error.message 
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/admin/rooms/:roomCode/analytics/buzz-history
 * Récupère l'historique des buzz events
 */
async function getBuzzHistory(req, res) {
  try {
    const { roomCode } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const room = Room.get(roomCode);
    if (!room) {
      return res.status(404).json({ error: 'Salle non trouvée' });
    }
    
    const history = analyticsService.getBuzzHistory(roomCode, limit);
    
    res.json(history);
  } catch (error) {
    logger.error('ANALYTICS', 'Erreur récupération buzz history', { 
      roomCode: req.params.roomCode,
      error: error.message 
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/admin/rooms/:roomCode/analytics/summary
 * Récupère le résumé statistique de la room
 */
async function getStatsSummary(req, res) {
  try {
    const { roomCode } = req.params;
    
    const room = Room.get(roomCode);
    if (!room) {
      return res.status(404).json({ error: 'Salle non trouvée' });
    }
    
    const summary = analyticsService.getStatsSummary(roomCode);
    
    res.json(summary);
  } catch (error) {
    logger.error('ANALYTICS', 'Erreur récupération stats summary', { 
      roomCode: req.params.roomCode,
      error: error.message 
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

/**
 * GET /api/admin/rooms/:roomCode/analytics
 * Récupère toutes les analytics d'un coup (combiné)
 */
async function getFullAnalytics(req, res) {
  try {
    const { roomCode } = req.params;
    
    const room = Room.get(roomCode);
    if (!room) {
      return res.status(404).json({ error: 'Salle non trouvée' });
    }
    
    const analytics = analyticsService.getFullAnalytics(room, playerLatencies);
    
    res.json(analytics);
  } catch (error) {
    logger.error('ANALYTICS', 'Erreur récupération full analytics', { 
      roomCode: req.params.roomCode,
      error: error.message || error.toString(),
      stack: error.stack
    });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

module.exports = {
  getSyncAnalytics,
  getBuzzHistory,
  getStatsSummary,
  getFullAnalytics
};
