const SpotifyWebApi = require('spotify-web-api-node');
const spotifyConfig = require('../config/spotify');
const logger = require('../utils/logger');

// Stockage des tokens par salle (en mémoire)
const roomTokens = {};

// Initialiser l'API Spotify avec le token de la salle
const initSpotifyApiForRoom = (roomCode) => {
  if (!roomTokens[roomCode]) {
    return false;
  }
  
  const spotifyApi = spotifyConfig.createApi();
  spotifyApi.setAccessToken(roomTokens[roomCode].accessToken);
  spotifyApi.setRefreshToken(roomTokens[roomCode].refreshToken);
  return spotifyApi;
};

// Pause de la lecture
const pausePlayback = async (roomCode) => {
  const spotifyApi = initSpotifyApiForRoom(roomCode);
  if (!spotifyApi) {
    return { success: false, error: 'NOT_AUTHENTICATED' };
  }
  
  try {
    await spotifyApi.pause();
    return { success: true };
  } catch (error) {
    logger.error('SPOTIFY', 'Erreur lors de la mise en pause Spotify', error);
    
    if (error.statusCode === 403) {
      return { success: true, warning: 'NON_PREMIUM_USER', message: 'Compte non-premium, fonctionnalités limitées.' };
    } else if (error.statusCode === 404) {
      return { success: false, error: 'NO_ACTIVE_DEVICE', message: 'Aucun appareil actif trouvé.' };
    }
    
    return { success: false, error: error.message || 'Erreur Spotify inconnue' };
  }
};

// Reprise de la lecture
const resumePlayback = async (roomCode) => {
  const spotifyApi = initSpotifyApiForRoom(roomCode);
  if (!spotifyApi) {
    return { success: false, error: 'NOT_AUTHENTICATED' };
  }
  
  try {
    // Petit délai pour éviter les problèmes de timing
    await new Promise(resolve => setTimeout(resolve, 300));
    
    await spotifyApi.play();
    return { success: true };
  } catch (error) {
    logger.error('SPOTIFY', 'Erreur lors de la reprise de lecture Spotify', error);
    
    if (error.statusCode === 403) {
      return { success: true, error: 'NON_PREMIUM_USER', message: 'Compte non-premium, fonctionnalités limitées' };
    } else if (error.statusCode === 404) {
      return { success: false, error: 'NO_ACTIVE_DEVICE', message: 'Aucun appareil actif' };
    }
    
    return { success: false, error: error.message || 'Erreur Spotify inconnue' };
  }
};

// Générer l'URL d'authentification
const getAuthorizationUrl = (roomCode) => {
  const scopes = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'app-remote-control'
  ];
  
  const spotifyApi = spotifyConfig.createApi();
  // Ajouter show_dialog: true pour forcer la sélection du compte
  return spotifyApi.createAuthorizeURL(scopes, roomCode, true);
};

// Stocker les tokens pour une salle
const storeTokenForRoom = (roomCode, { accessToken, refreshToken }) => {
  roomTokens[roomCode] = { accessToken, refreshToken };
  return true;
};

// Vérifier si une salle est connectée à Spotify
const isRoomConnected = (roomCode) => {
  return !!roomTokens[roomCode];
};

// Récupérer le profil utilisateur
const getUserProfile = async (roomCode) => {
  const spotifyApi = initSpotifyApiForRoom(roomCode);
  if (!spotifyApi) {
    return { success: false, error: 'NOT_AUTHENTICATED' };
  }
  
  try {
    const data = await spotifyApi.getMe();
    return { 
      success: true, 
      user: {
        id: data.body.id,
        name: data.body.display_name,
        email: data.body.email,
        image: data.body.images?.[0]?.url
      }
    };
  } catch (error) {
    logger.error('SPOTIFY', 'Erreur lors de la récupération du profil', error);
    return { success: false, error: error.message || 'Erreur Spotify inconnue' };
  }
};

// Méthode pour supprimer les tokens d'une salle
function removeTokenForRoom(roomCode) {
  if (roomTokens[roomCode]) {
    delete roomTokens[roomCode];
    return true;
  }
  return false;
}

// Récupérer les appareils disponibles
const getAvailableDevices = async (roomCode) => {
  const spotifyApi = initSpotifyApiForRoom(roomCode);
  if (!spotifyApi) {
    return { success: false, error: 'NOT_AUTHENTICATED' };
  }
  
  try {
    const response = await spotifyApi.getMyDevices();
    return { 
      success: true, 
      devices: response.body.devices 
    };
  } catch (error) {
    logger.error('SPOTIFY', 'Erreur lors de la récupération des appareils', error);
    return { success: false, error: error.message || 'Erreur Spotify inconnue' };
  }
};

module.exports = {
  pausePlayback,
  resumePlayback,
  getAuthorizationUrl,
  storeTokenForRoom,
  isRoomConnected,
  getUserProfile,
  removeTokenForRoom,
  getAvailableDevices
};