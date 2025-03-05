// src/middlewares/logger.js
const logger = require('../utils/logger');

function loggerMiddleware(req, res, next) {
  logger.info('HTTP', `${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  next();
}

function errorHandler(err, req, res, next) {
  logger.error('HTTP', 'Erreur non gérée', err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
}

module.exports = {
  loggerMiddleware,
  errorHandler
};