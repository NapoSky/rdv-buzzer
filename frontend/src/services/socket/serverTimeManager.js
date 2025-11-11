// src/services/socket/serverTimeManager.js

/**
 * Gestionnaire de temps serveur synchronisé (Singleton)
 * 
 * Ce module maintient une fonction getServerTime() accessible
 * sans dépendre du contexte React, utilisable dans les services.
 * 
 * Il doit être initialisé par le composant racine via setGetServerTime()
 */

let getServerTimeFn = null;
let timeOffset = 0;
let isSynced = false;

/**
 * Définit la fonction de récupération du temps serveur
 * Appelé par le ServerTimeProvider au démarrage
 * 
 * @param {Function} fn - Fonction getServerTime du hook useServerTime
 * @param {number} offset - Offset temporel actuel
 * @param {boolean} synced - État de synchronisation
 */
export function setGetServerTime(fn, offset, synced) {
  getServerTimeFn = fn;
  timeOffset = offset;
  isSynced = synced;
}

/**
 * Obtient le timestamp serveur actuel
 * À utiliser partout à la place de Date.now()
 * 
 * @returns {number} - Timestamp serveur en millisecondes
 */
export function getServerTime() {
  if (getServerTimeFn) {
    return getServerTimeFn();
  }
  
  // Fallback : si pas encore initialisé, utiliser Date.now()
  // (cela peut arriver pendant les premiers instants de l'application)
  return Date.now();
}

/**
 * Retourne l'offset temporel actuel
 * 
 * @returns {number} - Offset en millisecondes (serveur - client)
 */
export function getTimeOffset() {
  return timeOffset;
}

/**
 * Retourne l'état de synchronisation
 * 
 * @returns {boolean} - true si synchronisé
 */
export function getIsSynced() {
  return isSynced;
}

/**
 * Réinitialise le gestionnaire (pour tests ou déconnexion)
 */
export function resetServerTime() {
  getServerTimeFn = null;
  timeOffset = 0;
  isSynced = false;
  console.log('[serverTimeManager] Réinitialisation du gestionnaire de temps');
}

export default {
  setGetServerTime,
  getServerTime,
  getTimeOffset,
  getIsSynced,
  resetServerTime
};
