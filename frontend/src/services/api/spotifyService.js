// frontend/src/services/api/spotifyService.js

const BASE_URL = import.meta.env.VITE_BACKEND_URL;
const APP_SECRET = import.meta.env.VITE_APP_SECRET;

// Remplacer les anciennes méthodes par une approche cohérente
const getAuthHeaders = () => {
  return {
    'Authorization': `Bearer ${APP_SECRET}`,
    'Content-Type': 'application/json'
  };
};

// Nouvelle méthode d'authentification qui redirige vers l'endpoint backend
export const authenticateSpotify = (roomCode) => {
  const roomCodeToUse = roomCode || new URLSearchParams(window.location.search).get('roomCode');
  localStorage.setItem('spotify_redirect', window.location.pathname + window.location.search);
  
  // Récupérer l'URL d'authentification du backend
  fetch(`${BASE_URL}/api/spotify/auth-url/${roomCodeToUse}`, {
    headers: getAuthHeaders()
  })
    .then(response => response.json())
    .then(data => {
      if (data.url) {
        window.location.href = data.url;
      }
    })
    .catch(error => console.error('Erreur lors de la récupération de l\'URL d\'authentification:', error));
};

// Stockage du token reçu du serveur d'autorisation Spotify
export const storeSpotifyToken = (token) => {
  localStorage.setItem('spotify_token', token);
};

// Fonction utilitaire pour les requêtes Spotify
const makeSpotifyRequest = async (endpoint, method = 'GET', body = null, roomCode = null) => {
  let apiUrl;
  
  // Construction correcte de l'URL selon le format attendu par l'API
  if (roomCode) {
    // Format: /api/spotify/{endpoint}/{roomCode}
    apiUrl = `${BASE_URL}/api/spotify${endpoint}/${roomCode}`;
  } else {
    apiUrl = `${BASE_URL}/api/spotify${endpoint}`;
  }
  
  console.log(`Requête à ${apiUrl} avec méthode ${method}`);
  
  // Configuration de la requête
  const options = {
    method,
    headers: getAuthHeaders()
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(apiUrl, options);
    
    // Vérifier si la réponse est OK
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status} - ${response.statusText}`);
    }
    
    // Essayer de parser la réponse JSON
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Erreur lors de la requête Spotify:', error);
    return { error: error.message, success: false };
  }
};

// Vérifier statut de connexion Spotify
export const checkSpotifyStatus = async (roomCode) => {
  return makeSpotifyRequest('/status', 'GET', null, roomCode);
};

// Vérifier si Spotify est authentifié
export const isSpotifyAuthenticated = async (roomCode = null) => {
  if (!roomCode) {
    roomCode = new URLSearchParams(window.location.search).get('roomCode');
  }
  
  try {
    const status = await checkSpotifyStatus(roomCode);
    return status.connected || false;
  } catch (error) {
    console.error('Erreur lors de la vérification du statut Spotify:', error);
    return false;
  }
};

// Mettre en pause la lecture
export const pausePlayback = async (roomCode) => {
  if (!roomCode) {
    roomCode = new URLSearchParams(window.location.search).get('roomCode');
  }
  return makeSpotifyRequest('/pause', 'POST', null, roomCode);
};

// Reprendre la lecture 
export const resumePlayback = async (roomCode) => {
  if (!roomCode) {
    roomCode = new URLSearchParams(window.location.search).get('roomCode');
  }
  return makeSpotifyRequest('/play', 'POST', null, roomCode);
};

// Déconnecter Spotify
export const disconnectSpotify = async (roomCode) => {
  if (!roomCode) {
    roomCode = new URLSearchParams(window.location.search).get('roomCode');
  }
  return makeSpotifyRequest('/disconnect', 'POST', null, roomCode);
};

// Récupération des appareils disponibles
export const getAvailableDevices = async (roomCode = null) => {
  if (!roomCode) {
    roomCode = new URLSearchParams(window.location.search).get('roomCode');
  }
  
  return makeSpotifyRequest('/devices', 'GET', null, roomCode);
};
