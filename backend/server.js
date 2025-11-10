// server.js (à la racine)
require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const socketInit = require('./src/socket');
const { connectRedis, client: redisClient } = require('./src/config/db');
const { Room } = require('./src/models/Room');
const RedisService = require('./src/services/redisService');
const logger = require('./src/utils/logger');

/**
 * Charge toutes les rooms persistées dans Redis au démarrage
 */
async function loadRoomsFromRedis() {
  try {
    if (!redisClient.isOpen) {
      logger.warn('STARTUP', 'Redis non connecté, impossible de charger les rooms');
      return;
    }

    const keys = await redisClient.keys('room:*');
    logger.info('STARTUP', `Tentative de chargement de ${keys.length} room(s) depuis Redis`);

    let restored = 0;
    for (const key of keys) {
      try {
        const roomCode = key.replace('room:', '');
        const data = await RedisService.get(key, true);
        
        if (data && data.code) {
          Room.fromRedis(roomCode, data);
          restored++;
          logger.info('STARTUP', `Room ${roomCode} restaurée depuis Redis`, {
            playersCount: data.players?.length || 0,
            paused: data.paused
          });
        }
      } catch (err) {
        logger.error('STARTUP', `Erreur lors de la restauration de ${key}`, err);
      }
    }

    logger.info('STARTUP', `${restored} room(s) restaurée(s) depuis Redis`);
  } catch (error) {
    logger.error('STARTUP', 'Erreur lors du chargement des rooms depuis Redis', error);
  }
}

// Création du serveur HTTP
const server = http.createServer(app);

// Initialisation de Socket.IO
socketInit(server);

// Connexion à Redis et chargement des rooms
connectRedis()
  .then(() => loadRoomsFromRedis())
  .catch(err => {
    logger.error('SERVER', 'Erreur de connexion à Redis', err);
  });

// Démarrage du serveur
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  logger.info('SERVER', `Serveur démarré sur le port ${PORT}`, {
    node_env: process.env.NODE_ENV,
    redis: process.env.REDIS_URL ? 'configuré' : 'par défaut'
  });
});

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
  logger.error('PROCESS', 'Exception non gérée', error);
  setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason) => {
  logger.error('PROCESS', 'Rejet de promesse non géré', 
    reason instanceof Error ? reason : new Error(String(reason))
  );
});