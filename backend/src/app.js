// src/app.js
const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { errorHandler } = require('./middlewares/logger');
const logger = require('./utils/logger');

const validateEnv = () => {
  const required = [
    'APP_SECRET',
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('Variables d\'environnement manquantes:', missing.join(', '));
    process.exit(1);
  }
};

// Appeler cette fonction au démarrage
validateEnv();

// Création de l'application Express
const app = express();

// Désactiver le header X-Powered-By pour des raisons de sécurité
app.disable('x-powered-by');

// Configuration CORS
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Application des middlewares
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Point d'entrée pour les routes API
app.use('/api', routes);

// Route de base pour vérifier l'état de l'API
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Middleware global de gestion des erreurs
app.use(errorHandler);

module.exports = app;