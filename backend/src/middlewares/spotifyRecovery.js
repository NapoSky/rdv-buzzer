const logger = require('../utils/logger');

/**
 * Middleware pour gérer automatiquement les problèmes de synchronisation Spotify
 */
class SpotifyRecoveryMiddleware {
  constructor() {
    this.failureCount = new Map(); // roomCode -> count
    this.lastFailureTime = new Map(); // roomCode -> timestamp
    this.recoveryAttempts = new Map(); // roomCode -> attempts
  }

  /**
   * Enregistre un échec Spotify pour une salle
   * @param {string} roomCode - Code de la salle
   * @param {string} errorType - Type d'erreur (token_expired, api_error, etc.)
   */
  recordFailure(roomCode, errorType) {
    const currentCount = this.failureCount.get(roomCode) || 0;
    this.failureCount.set(roomCode, currentCount + 1);
    this.lastFailureTime.set(roomCode, Date.now());

    logger.warn('SPOTIFY_RECOVERY', `Échec Spotify enregistré pour ${roomCode}`, {
      roomCode,
      errorType,
      failureCount: currentCount + 1,
      timestamp: Date.now()
    });

    // Si trop d'échecs récents, déclencher une récupération automatique
    if (currentCount >= 3) {
      this.attemptRecovery(roomCode);
    }
  }

  /**
   * Tente une récupération automatique
   * @param {string} roomCode - Code de la salle
   */
  async attemptRecovery(roomCode) {
    const attempts = this.recoveryAttempts.get(roomCode) || 0;
    
    if (attempts >= 2) {
      logger.warn('SPOTIFY_RECOVERY', `Trop de tentatives de récupération pour ${roomCode}, abandon`);
      return;
    }

    this.recoveryAttempts.set(roomCode, attempts + 1);
    
    logger.info('SPOTIFY_RECOVERY', `Tentative de récupération automatique pour ${roomCode}`, {
      roomCode,
      attempt: attempts + 1
    });

    try {
      // Nettoyer l'état Spotify de la salle
      this.cleanSpotifyState(roomCode);
      
      // Notifier les clients de déconnecter/reconnecter Spotify
      const io = require('../socket/index').getIO();
      if (io) {
        io.to(roomCode).emit('spotify_recovery_needed', {
          message: 'Problème de connexion Spotify détecté. Veuillez vous reconnecter.',
          shouldReconnect: true
        });
      }

    } catch (error) {
      logger.error('SPOTIFY_RECOVERY', `Erreur lors de la récupération pour ${roomCode}`, error);
    }
  }

  /**
   * Nettoie l'état Spotify corrompu pour une salle
   * @param {string} roomCode - Code de la salle
   */
  cleanSpotifyState(roomCode) {
    try {
      const spotifyService = require('../services/spotifyService');
      if (spotifyService && spotifyService.removeTokenForRoom) {
        spotifyService.removeTokenForRoom(roomCode);
        logger.info('SPOTIFY_RECOVERY', `État Spotify nettoyé pour ${roomCode}`);
      }
    } catch (error) {
      logger.error('SPOTIFY_RECOVERY', `Erreur lors du nettoyage pour ${roomCode}`, error);
    }
  }

  /**
   * Marque une récupération comme réussie
   * @param {string} roomCode - Code de la salle
   */
  markRecoverySuccess(roomCode) {
    this.failureCount.delete(roomCode);
    this.lastFailureTime.delete(roomCode);
    this.recoveryAttempts.delete(roomCode);
    
    logger.info('SPOTIFY_RECOVERY', `Récupération réussie pour ${roomCode}`);
  }

  /**
   * Vérifie si une salle est en état d'échec
   * @param {string} roomCode - Code de la salle
   * @returns {boolean}
   */
  isInFailureState(roomCode) {
    const failureCount = this.failureCount.get(roomCode) || 0;
    const lastFailure = this.lastFailureTime.get(roomCode);
    
    if (failureCount === 0) return false;
    
    // Considérer comme échec si plus de 2 échecs dans les 5 dernières minutes
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    return failureCount >= 2 && lastFailure && lastFailure > fiveMinutesAgo;
  }
}

// Instance singleton
const spotifyRecovery = new SpotifyRecoveryMiddleware();

module.exports = spotifyRecovery;
