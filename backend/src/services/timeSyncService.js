// src/services/timeSyncService.js
const logger = require('../utils/logger');

/**
 * Service de synchronisation temporelle client-serveur
 * 
 * Résout le problème des horloges client désynchronisées en permettant
 * aux clients de calculer l'offset entre leur horloge locale et l'horloge serveur.
 * 
 * Algorithme :
 * 1. Client envoie t0 (son timestamp)
 * 2. Serveur reçoit à T1 (son timestamp), répond avec T1
 * 3. Client reçoit à t1 (son timestamp)
 * 4. RTT = t1 - t0
 * 5. Offset estimé = T1 - (t0 + RTT/2)
 * 
 * Le client peut ensuite obtenir le "temps serveur" via : Date.now() + offset
 */

/**
 * Stockage des statistiques de synchronisation par socket
 * Structure : { socketId: { offsets: [], averageOffset: number, lastSync: timestamp } }
 */
const syncStats = {};

/**
 * Traite une demande de synchronisation temporelle
 * 
 * @param {string} socketId - ID du socket client
 * @param {number} clientTimestamp - Timestamp d'envoi du client (t0)
 * @returns {object} - { serverTimestamp, clientTimestamp }
 */
function handleTimeSync(socketId, clientTimestamp) {
  const serverTimestamp = Date.now();
  
  // Validation du timestamp client
  if (!clientTimestamp || typeof clientTimestamp !== 'number') {
    return { serverTimestamp, clientTimestamp: serverTimestamp };
  }
  
  return {
    serverTimestamp,
    clientTimestamp // Renvoyer pour que le client puisse calculer RTT
  };
}

/**
 * Enregistre une mesure d'offset calculée par le client
 * (Optionnel, pour monitoring côté serveur)
 * 
 * @param {string} socketId - ID du socket
 * @param {number} offset - Offset calculé (ms)
 * @param {number} rtt - Round-trip time (ms)
 */
function recordOffset(socketId, offset, rtt) {
  if (!syncStats[socketId]) {
    syncStats[socketId] = {
      offsets: [],
      rtts: [],
      lastSync: Date.now()
    };
  }
  
  const stats = syncStats[socketId];
  stats.offsets.push(offset);
  stats.rtts.push(rtt);
  stats.lastSync = Date.now();
  
  // Garder seulement les 10 dernières mesures
  if (stats.offsets.length > 10) {
    stats.offsets.shift();
    stats.rtts.shift();
  }
  
  // Calculer la médiane de l'offset (filtre les outliers)
  const sortedOffsets = [...stats.offsets].sort((a, b) => a - b);
  const medianOffset = sortedOffsets[Math.floor(sortedOffsets.length / 2)];
  stats.medianOffset = medianOffset;
  
  // Calculer la moyenne du RTT
  const avgRtt = stats.rtts.reduce((a, b) => a + b, 0) / stats.rtts.length;
  stats.averageRtt = avgRtt;
  
  // ✅ Calculer le jitter (écart-type du RTT)
  const rttVariance = stats.rtts.reduce((sum, r) => sum + Math.pow(r - avgRtt, 2), 0) / stats.rtts.length;
  const jitter = Math.sqrt(rttVariance);
  stats.jitter = jitter;
  
  return { medianOffset, averageRtt: avgRtt, jitter };
}

/**
 * Nettoie les statistiques d'un socket déconnecté
 * 
 * @param {string} socketId - ID du socket
 */
function cleanupSocket(socketId) {
  if (syncStats[socketId]) {
    delete syncStats[socketId];
  }
}

/**
 * Obtient les statistiques de synchronisation d'un socket
 * 
 * @param {string} socketId - ID du socket
 * @returns {object|null} - Stats ou null
 */
function getStats(socketId) {
  return syncStats[socketId] || null;
}

/**
 * Obtient toutes les statistiques (pour monitoring/debug)
 * 
 * @returns {object} - Toutes les stats
 */
function getAllStats() {
  return { ...syncStats };
}

module.exports = {
  handleTimeSync,
  recordOffset,
  cleanupSocket,
  getStats,
  getAllStats
};
