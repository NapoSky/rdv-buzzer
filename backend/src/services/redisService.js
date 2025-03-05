// src/services/redisService.js
const { client: redisClient } = require('../config/db');
const logger = require('../utils/logger');

/**
 * Service pour interagir avec Redis
 */
class RedisService {
  /**
   * Sauvegarde une valeur dans Redis
   * @param {string} key - Clé Redis
   * @param {object|string|number} value - Valeur à sauvegarder
   * @returns {Promise<boolean>} - Succès de l'opération
   */
  static async set(key, value) {
    try {
      if (!redisClient.isOpen) {
        logger.warn('REDIS', 'Redis non connecté lors de l\'écriture', { key });
        return false;
      }
      // Si la valeur est un objet, on la convertit en JSON
      const valueToStore = typeof value === 'object' ? JSON.stringify(value) : String(value);
      await redisClient.set(key, valueToStore);
      return true;
    } catch (error) {
      logger.error('REDIS', 'Erreur lors de l\'écriture', error);
      return false;
    }
  }

  /**
   * Récupère une valeur depuis Redis
   * @param {string} key - Clé Redis
   * @param {boolean} parseJson - Si true, tente de parser la réponse comme du JSON
   * @returns {Promise<any>} - La valeur récupérée
   */
  static async get(key, parseJson = false) {
    try {
      if (!redisClient.isOpen) {
        logger.warn('REDIS', 'Redis non connecté lors de la lecture', { key });
        return null;
      }

      const data = await redisClient.get(key);
      if (!data) return null;

      return parseJson ? JSON.parse(data) : data;
    } catch (error) {
      logger.error('REDIS', 'Erreur lors de la lecture', error);
      return null;
    }
  }

  /**
   * Supprime une clé de Redis
   * @param {string} key - Clé à supprimer
   * @returns {Promise<boolean>} - Succès de l'opération
   */
  static async delete(key) {
    try {
      if (!redisClient.isOpen) {
        logger.warn('REDIS', 'Redis non connecté lors de la suppression', { key });
        return false;
      }
      await redisClient.del(key);
      return true;
    } catch (error) {
      logger.error('REDIS', 'Erreur lors de la suppression', error);
      return false;
    }
  }
}

module.exports = RedisService;