// server.js (à la racine)
require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const socketInit = require('./src/socket');
const { connectRedis } = require('./src/config/db');
const logger = require('./src/utils/logger');

// Création du serveur HTTP
const server = http.createServer(app);

// Initialisation de Socket.IO
socketInit(server);

// Connexion à Redis
connectRedis().catch(err => {
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