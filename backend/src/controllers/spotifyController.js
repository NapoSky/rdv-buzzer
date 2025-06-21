// backend/src/controllers/spotifyController.js
const spotifyService = require('../services/spotifyService');
const { Room } = require('../models/Room');
const logger = require('../utils/logger');
const SpotifyWebApi = require('spotify-web-api-node'); // Assurez-vous que c'est importé
const spotifyConfig = require('../config/spotify').config; // Assurez-vous que c'est importé
const { getIO } = require('../socket/index'); // Assurez-vous que c'est importé

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
  
  const room = Room.get(roomCode); // Récupérer la salle
  if (!code || !roomCode || !room) { // Vérifier aussi l'existence de la salle ici
    return res.status(400).json({ error: 'Paramètres invalides ou salle inexistante' });
  }
  
  try {
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
    await spotifyService.storeTokenForRoom(roomCode, { // Assurez-vous que c'est await si storeTokenForRoom est async
      accessToken: access_token,
      RefreshToken: refresh_token
    });

    // Mettre à jour l'option de la salle pour indiquer que Spotify est activé
    if (room.options) { // Vérification de sécurité
        room.options.spotifyEnabled = true;
        logger.info('SPOTIFY', `Option spotifyEnabled mise à true pour ${roomCode} après callback.`);
        
        // *** AJOUTER : Notifier tous les clients de la mise à jour des options ***
        const io = getIO();
        io.to(roomCode).emit('room_options_updated', room.options);
        logger.info('SPOTIFY', `Options mises à jour émises pour ${roomCode}`, room.options);
    } else {
        logger.warn('SPOTIFY', `Impossible de mettre à jour spotifyEnabled pour ${roomCode}: options non trouvées.`);
    }

    // --- AJOUT : Récupération et Initialisation de l'État Spotify ---
    try {
        logger.info('SPOTIFY_INIT', `Tentative de récupération de l'état initial pour ${roomCode}`);
        const initialPlayback = await spotifyService.getCurrentPlayback(roomCode); // Maintenant enrichi !
        const initialTrack = initialPlayback?.item ? {
            id: initialPlayback.item.id,
            artist: initialPlayback.item.artists.map(a => a.name).join(', '),
            title: initialPlayback.item.name,
            artworkUrl: initialPlayback.item.album.images?.[0]?.url,
            // NOUVEAU : Inclure les infos de playlist dès l'initialisation
            playlistInfo: initialPlayback.playlistInfo || null
        } : null;

        // Mettre à jour l'état initial dans la Room
        Room.resetSpotifyState(roomCode, initialTrack);

        if (initialTrack) {
            logger.info('SPOTIFY_INIT', `État initial avec piste défini pour ${roomCode}`, {
                track: `${initialTrack.artist} - ${initialTrack.title}`,
                hasPlaylist: !!initialTrack.playlistInfo,
                playlistPosition: initialTrack.playlistInfo ? `${initialTrack.playlistInfo.position}/${initialTrack.playlistInfo.total}` : 'N/A'
            });
        }
    } catch (initError) {
        logger.error('SPOTIFY_INIT', `Erreur lors de la récupération de l'état initial pour ${roomCode}`, initError);
        // Continuer même si l'état initial échoue, le polling prendra le relais
    }
    // --- FIN AJOUT ---

    spotifyService.startSpotifyPolling(roomCode);
    
    // Notifier les clients de la salle
    const io = getIO();
    io.to(roomCode).emit('spotify_connected', { connected: true });
    // Envoyer aussi la mise à jour des options si le client en a besoin
    io.to(roomCode).emit('room_options_updated', room.options); 
    
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
  
  // *** AJOUTER : Mettre à jour l'option de la salle ***
  const room = Room.get(roomCode);
  if (room && room.options) {
    room.options.spotifyEnabled = false;
    logger.info('SPOTIFY', `Option spotifyEnabled mise à false pour ${roomCode} après déconnexion.`);
  }
  
  // Notifier les clients
  const io = getIO();
  io.to(roomCode).emit('spotify_disconnected', { roomCode });
  
  // *** AJOUTER : Notifier aussi la mise à jour des options ***
  if (room && room.options) {
    io.to(roomCode).emit('room_options_updated', room.options);
    logger.info('SPOTIFY', `Options mises à jour émises après déconnexion pour ${roomCode}`, room.options);
  }
  
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
