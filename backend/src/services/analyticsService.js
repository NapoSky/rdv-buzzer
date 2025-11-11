// src/services/analyticsService.js
const logger = require('../utils/logger');
const timeSyncService = require('./timeSyncService');

/**
 * Service d'analytics pour les salles
 * 
 * Collecte et stocke en mémoire les données analytiques des buzz events
 * - Synchronisation des clients (latence, offset, jitter)
 * - Historique des buzz avec détails des candidats
 * - Statistiques globales par salle
 * 
 * Stockage en RAM uniquement (pas de persistance)
 * Conservation des 50 derniers buzz events par room
 */

/**
 * Stockage des analytics par room
 * Structure : {
 *   roomCode: {
 *     buzzHistory: [...],      // 50 derniers buzz events
 *     stats: { ... }            // Statistiques agrégées
 *   }
 * }
 */
const roomAnalytics = {};

// Configuration
const MAX_BUZZ_HISTORY = 50;  // Nombre max d'events buzz conservés

/**
 * Initialise les analytics pour une room
 */
function initRoomAnalytics(roomCode) {
  if (!roomAnalytics[roomCode]) {
    roomAnalytics[roomCode] = {
      buzzHistory: [],
      stats: {
        totalBuzzes: 0,
        totalWithEquality: 0,
        totalRandomTiebreak: 0,
        avgGracePeriod: 0,
        avgEqualityThreshold: 0,
        avgCandidatesPerBuzz: 0,
        syncedClientsCount: 0
      }
    };
  }
}

/**
 * Enregistre un événement de buzz
 * @param {string} roomCode - Code de la salle
 * @param {object} buzzEvent - Données du buzz event
 */
function recordBuzzEvent(roomCode, buzzEvent) {
  initRoomAnalytics(roomCode);
  
  const analytics = roomAnalytics[roomCode];
  
  // Ajouter l'event à l'historique
  const buzzEventData = {
    timestamp: Date.now(),
    winner: buzzEvent.winner,
    winnerSocketId: buzzEvent.winnerSocketId || buzzEvent.candidates[0]?.socketId, // ✅ Utiliser le winnerSocketId passé explicitement (fallback sur candidates[0] pour rétrocompatibilité)
    gracePeriod: buzzEvent.gracePeriod,
    equalityThreshold: buzzEvent.equalityThreshold,
    candidates: buzzEvent.candidates.map(c => ({
      pseudo: c.pseudo,
      socketId: c.socketId,
      clientTimestamp: c.clientTimestamp,
      serverTimestamp: c.serverTimestamp,
      compensatedTime: c.compensatedTime,
      latency: c.latency,
      isSynced: c.isSynced,
      delta: c.delta || 0,
      wasEqual: c.wasEqual || false
    })),
    hadEquality: buzzEvent.hadEquality || false,
    hadRandomTiebreak: buzzEvent.hadRandomTiebreak || false,
    syncedCount: buzzEvent.syncedCount || 0,
    totalCandidates: buzzEvent.candidates.length,
    // Verdict de l'admin (sera mis à jour après le jugement)
    verdict: 'pending', // 'pending' | 'correct' | 'correct_artist' | 'correct_title' | 'correct_both' | 'all_good' | 'incorrect' | 'skipped'
    judgedAt: null
  };
  
  analytics.buzzHistory.unshift(buzzEventData);
  
  // Limiter la taille de l'historique
  if (analytics.buzzHistory.length > MAX_BUZZ_HISTORY) {
    analytics.buzzHistory.pop();
  }
  
  // Mettre à jour les stats
  analytics.stats.totalBuzzes++;
  if (buzzEvent.hadEquality) analytics.stats.totalWithEquality++;
  if (buzzEvent.hadRandomTiebreak) analytics.stats.totalRandomTiebreak++;
  
  // Calculer les moyennes glissantes
  const n = analytics.stats.totalBuzzes;
  analytics.stats.avgGracePeriod = 
    ((analytics.stats.avgGracePeriod * (n - 1)) + buzzEvent.gracePeriod) / n;
  analytics.stats.avgEqualityThreshold = 
    ((analytics.stats.avgEqualityThreshold * (n - 1)) + buzzEvent.equalityThreshold) / n;
  analytics.stats.avgCandidatesPerBuzz = 
    ((analytics.stats.avgCandidatesPerBuzz * (n - 1)) + buzzEvent.candidates.length) / n;
}

/**
 * Récupère les données de synchronisation des clients d'une room
 * 
 * @param {object} room - Objet Room depuis le model
 * @param {object} playerLatencies - Objet des latences (depuis buzzHandlers)
 * @returns {object} - Données de sync par joueur
 */
function getSyncAnalytics(room, playerLatencies) {
  try {
    const players = [];
    
    // Vérifier que room et room.players existent
    if (!room || !room.players) {
      logger.error('ANALYTICS', 'Room ou room.players invalide', { 
        hasRoom: !!room,
        hasPlayers: room ? !!room.players : false
      });
      throw new Error('Room invalide');
    }
    
    // Récupérer les stats de time sync pour chaque joueur
    Object.entries(room.players).forEach(([socketId, player]) => {
      // Ignorer l'admin
      if (player.isAdmin) return;
      
      const syncData = timeSyncService.getStats(socketId);
      const latencyData = playerLatencies[socketId] || { values: [], average: null };
      
      // Calculer le jitter (écart-type des latences)
      let jitter = null;
      if (latencyData.values && latencyData.values.length > 1) {
        // Filtrer les valeurs nulles/invalides
        const validValues = latencyData.values.filter(v => 
          v != null && typeof v === 'number' && !isNaN(v) && v >= 0
        );
        
        if (validValues.length > 1 && latencyData.average != null) {
          const avg = latencyData.average;
          const variance = validValues.reduce((sum, lat) => 
            sum + Math.pow(lat - avg, 2), 0) / validValues.length;
          jitter = Math.sqrt(variance); // Peut être 0 si toutes les valeurs sont identiques
        }
      }
      
      players.push({
        pseudo: player.pseudo,
        socketId: socketId,
        score: player.score,
        // Time sync data
        timeOffset: syncData?.medianOffset ?? null,
        lastSync: syncData?.lastSync ?? null,
        isSynced: syncData !== null && syncData.offsets && syncData.offsets.length > 0,
        // Latency data
        averageLatency: latencyData.average ?? null,
        latencyJitter: typeof jitter === 'number' ? Math.round(jitter) : null, // Accepte 0
        latencySamples: latencyData.values?.length || 0,
        // Connection quality indicator
        connectionQuality: getConnectionQuality(latencyData.average ?? 0, jitter ?? 0)
      });
    });
    
    return {
      roomCode: room.code,
      totalPlayers: players.length,
      syncedPlayers: players.filter(p => p.isSynced).length,
      players: players.sort((a, b) => a.pseudo.localeCompare(b.pseudo))
    };
  } catch (error) {
    logger.error('ANALYTICS', 'Erreur dans getSyncAnalytics', { 
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Détermine la qualité de connexion basée sur latence et jitter
 */
function getConnectionQuality(avgLatency, jitter) {
  if (!avgLatency) return 'unknown';
  
  if (avgLatency < 50 && jitter < 10) return 'excellent';
  if (avgLatency < 100 && jitter < 20) return 'good';
  if (avgLatency < 200 && jitter < 50) return 'fair';
  return 'poor';
}

/**
 * Récupère l'historique des buzz d'une room
 */
function getBuzzHistory(roomCode, limit = 50) {
  const analytics = roomAnalytics[roomCode];
  
  if (!analytics) {
    return {
      roomCode,
      events: [],
      totalEvents: 0
    };
  }
  
  return {
    roomCode,
    events: analytics.buzzHistory.slice(0, limit),
    totalEvents: analytics.stats.totalBuzzes
  };
}

/**
 * Récupère le résumé statistique d'une room
 */
function getStatsSummary(roomCode) {
  const analytics = roomAnalytics[roomCode];
  
  if (!analytics) {
    return {
      roomCode,
      stats: null
    };
  }
  
  // Calculer les pourcentages
  const total = analytics.stats.totalBuzzes || 1; // Éviter division par 0
  
  return {
    roomCode,
    stats: {
      ...analytics.stats,
      equalityRate: Math.round((analytics.stats.totalWithEquality / total) * 100),
      randomTiebreakRate: Math.round((analytics.stats.totalRandomTiebreak / total) * 100),
      avgGracePeriod: Math.round(analytics.stats.avgGracePeriod),
      avgEqualityThreshold: Math.round(analytics.stats.avgEqualityThreshold),
      avgCandidatesPerBuzz: Math.round(analytics.stats.avgCandidatesPerBuzz * 10) / 10
    },
    historySize: analytics.buzzHistory.length
  };
}

/**
 * Met à jour le verdict d'un buzz dans l'historique
 * @param {string} roomCode - Code de la salle
 * @param {string} winnerSocketId - Socket ID du gagnant du buzz
 * @param {string} verdict - Verdict de l'admin ('correct', 'incorrect', 'correct_artist', etc.)
 */
function updateBuzzVerdict(roomCode, winnerSocketId, verdict) {
  if (!roomAnalytics[roomCode]) {
    logger.warn('ANALYTICS', 'Room analytics non trouvées pour mise à jour verdict', { roomCode });
    return;
  }
  
  const analytics = roomAnalytics[roomCode];
  
  // 🔍 Log de debug pour diagnostiquer les problèmes de matching
  logger.info('ANALYTICS', 'Tentative de mise à jour verdict', {
    roomCode,
    winnerSocketId,
    verdict,
    pendingBuzzCount: analytics.buzzHistory.filter(e => e.verdict === 'pending').length,
    totalBuzzCount: analytics.buzzHistory.length
  });
  
  // Trouver le buzz le plus récent de ce joueur
  const buzzEvent = analytics.buzzHistory.find(event => 
    event.winnerSocketId === winnerSocketId && event.verdict === 'pending'
  );
  
  if (buzzEvent) {
    buzzEvent.verdict = verdict;
    buzzEvent.judgedAt = Date.now();
    logger.info('ANALYTICS', 'Verdict mis à jour avec succès', {
      roomCode,
      winnerSocketId,
      verdict,
      winner: buzzEvent.winner,
      timestamp: buzzEvent.timestamp
    });
  } else {
    logger.warn('ANALYTICS', 'Aucun buzz event pending trouvé pour ce joueur', {
      roomCode,
      winnerSocketId,
      verdict,
      recentBuzzEvents: analytics.buzzHistory.slice(0, 3).map(e => ({
        winner: e.winner,
        winnerSocketId: e.winnerSocketId,
        verdict: e.verdict,
        timestamp: e.timestamp
      }))
    });
  }
}

/**
 * Nettoie les analytics d'une room (quand elle est fermée)
 */
function cleanupRoomAnalytics(roomCode) {
  if (roomAnalytics[roomCode]) {
    delete roomAnalytics[roomCode];
  }
}

/**
 * Récupère les analytics complètes d'une room
 * (combinaison de toutes les données)
 */
function getFullAnalytics(room, playerLatencies) {
  return {
    sync: getSyncAnalytics(room, playerLatencies),
    history: getBuzzHistory(room.code),
    summary: getStatsSummary(room.code)
  };
}

module.exports = {
  recordBuzzEvent,
  updateBuzzVerdict,
  getSyncAnalytics,
  getBuzzHistory,
  getStatsSummary,
  getFullAnalytics,
  initRoomAnalytics,
  cleanupRoomAnalytics
};
