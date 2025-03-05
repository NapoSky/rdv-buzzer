// backend/src/controllers/spotifyController.js
const spotifyService = require('../services/spotifyService');
const { Room } = require('../models/Room');
const logger = require('../utils/logger');

function getAuthUrl(req, res) {
  const { roomCode } = req.params;
  
  if (!Room.get(roomCode)) {
    return res.status(404).json({ error: 'Salle inexistante' });
  }
  
  const authUrl = spotifyService.getAuthorizationUrl(roomCode);
  res.json({ url: authUrl });
}

async function handleCallback(req, res) {
  const { code, state } = req.query;
  const roomCode = state; // Le roomCode est passé dans state
  
  if (!code || !roomCode || !Room.get(roomCode)) {
    return res.status(400).json({ error: 'Paramètres invalides ou salle inexistante' });
  }
  
  try {
    const SpotifyWebApi = require('spotify-web-api-node');
    const spotifyConfig = require('../config/spotify').config;
    
    // Créer une instance pour cette requête spécifique
    const spotifyApi = new SpotifyWebApi({
      clientId: spotifyConfig.clientId,
      clientSecret: spotifyConfig.clientSecret,
      redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3001/api/spotify/callback'
    });
    
    // Échanger le code contre des tokens
    const data = await spotifyApi.authorizationCodeGrant(code);
    const { access_token, refresh_token } = data.body;
    
    // Stocker les tokens pour cette salle
    spotifyService.storeTokenForRoom(roomCode, {
      accessToken: access_token,
      refreshToken: refresh_token
    });
    
    // Notifier les clients de la salle
    const io = require('../socket').getIO();
    io.to(roomCode).emit('spotify_connected', { connected: true });
    
    // Rediriger vers le frontend avec le roomCode
    const frontendURL = process.env.FRONTEND_URL || 'http://localhost';
    res.redirect(`${frontendURL}/spotify-callback?code=${code}&state=${roomCode}`);
  } catch (error) {
    logger.error('SPOTIFY', 'Erreur d\'authentification Spotify', error);
    const frontendURL = process.env.FRONTEND_URL || 'http://localhost';
    res.redirect(`${frontendURL}/spotify-callback?error=auth_failed`);
  }
}

function getStatus(req, res) {
  const { roomCode } = req.params;
  
  if (!Room.get(roomCode)) {
    return res.status(404).json({ error: 'Salle inexistante' });
  }
  
  const connected = spotifyService.isRoomConnected(roomCode);
  res.json({ connected });
}

function disconnectSpotify(req, res) {
  const { roomCode } = req.params;
  
  if (!Room.get(roomCode)) {
    return res.status(404).json({ error: 'Salle inexistante' });
  }
  
  // Supprimer les tokens
  spotifyService.removeTokenForRoom(roomCode);
  
  // Notifier les clients
  const io = require('../socket').getIO();
  io.to(roomCode).emit('spotify_connected', { connected: false });
  
  res.json({ success: true });
}

async function getDevices(req, res) {
  if (!verifyRoomAndSpotify(req, res)) return;
  
  const { roomCode } = req.params;
  
  try {
    const devicesResult = await spotifyService.getAvailableDevices(roomCode);
    if (devicesResult.success) {
      res.json({ devices: devicesResult.devices });
    } else {
      res.status(500).json({ error: devicesResult.error });
    }
  } catch (error) {
    logger.error('SPOTIFY', 'Erreur lors de la récupération des appareils', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des appareils' });
  }
}

async function pausePlayback(req, res) {
  if (!verifyRoomAndSpotify(req, res)) return;
  
  const { roomCode } = req.params;
  
  try {
    const result = await spotifyService.pausePlayback(roomCode);
    res.json(result);
  } catch (error) {
    logger.error('SPOTIFY', 'Erreur lors de la mise en pause', error);
    res.status(500).json({ error: 'Erreur lors de la mise en pause', message: error.message });
  }
}

async function resumePlayback(req, res) {
  if (!verifyRoomAndSpotify(req, res)) return;
  
  const { roomCode } = req.params;
  
  try {
    const result = await spotifyService.resumePlayback(roomCode);
    res.json(result);
  } catch (error) {
    logger.error('SPOTIFY', 'Erreur lors de la reprise de lecture', error);
    res.status(500).json({ error: 'Erreur lors de la reprise de lecture', message: error.message });
  }
}

// Exporter toutes les fonctions du contrôleur
module.exports = {
  getAuthUrl,
  handleCallback,
  getStatus,
  disconnectSpotify,
  getDevices,
  pausePlayback,
  resumePlayback
};

/**
 * Vérifie l'existence d'une salle et sa connexion à Spotify
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 * @returns {Object|null} L'objet room si tout est valide, null sinon (gère aussi res.status)
 */
function verifyRoomAndSpotify(req, res) {
  const { roomCode } = req.params;
  
  if (!Room.get(roomCode)) {
    res.status(404).json({ error: 'Salle inexistante' });
    return null;
  }
  
  if (!spotifyService.isRoomConnected(roomCode)) {
    res.status(400).json({ error: 'Spotify non connecté pour cette salle' });
    return null;
  }
  
  return Room.get(roomCode);
}
