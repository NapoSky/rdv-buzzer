const { createClient } = require('redis');
const logger = require('../utils/logger');

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379',
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 3000)
  }
});

redisClient.on('error', (err) => logger.error('REDIS', 'Erreur Redis', err));
redisClient.on('reconnecting', () => logger.info('REDIS', 'Reconnexion à Redis...'));
redisClient.on('connect', () => logger.info('REDIS', 'Connecté à Redis'));

const connectRedis = async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    logger.error('REDIS', 'Impossible de se connecter à Redis', err);
  }
};

module.exports = {
  client: redisClient,
  connectRedis
};