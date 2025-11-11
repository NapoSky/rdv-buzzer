const SpotifyWebApi = require('spotify-web-api-node');
const spotifyConfig = require('../config/spotify');
const logger = require('../utils/logger');
const { Room } = require('../models/Room'); // Importer Room pour accéder à l'état
const spotifyRecovery = require('../middlewares/spotifyRecovery'); // NOUVEAU: Middleware de récupération

// Stockage des tokens par salle (en mémoire) - existant
const roomTokens = {};
// Stockage des ID utilisateur Spotify associés à l'admin d'une salle
const roomAdminUserIds = {}; // { roomCode: spotifyUserId }

// NOUVEAU : Cache des informations de playlist par salle
// TODO FUTUR : Implémenter une vérification périodique pour détecter les modifications de playlist
const playlistCache = {}; // { roomCode: { id, name, total, tracks: [...] } }

// Dead queue : Playlists inaccessibles par room (ne plus essayer de les récupérer)
const playlistDeadQueue = {}; // { roomCode: Set<playlistId> }

// Initialiser l'API Spotify avec le token de la salle - existant
const initSpotifyApiForRoom = async (roomCode) => {
  if (!roomTokens[roomCode]) {
    return null; // Retourner null si pas de token
  }

  // Vérifier et rafraîchir le token si nécessaire AVANT de créer l'API
  const tokenValid = await ensureValidToken(roomCode);
  if (!tokenValid) {
    logger.warn('SPOTIFY', `Impossible de s'assurer de la validité du token pour ${roomCode}`);
    return null;
  }

  const spotifyApi = spotifyConfig.createApi(); // Utilise la config pour créer une instance
  spotifyApi.setAccessToken(roomTokens[roomCode].accessToken);
  spotifyApi.setRefreshToken(roomTokens[roomCode].refreshToken);
  return spotifyApi;
};

// Pause de la lecture
const pausePlayback = async (roomCode) => {
  const spotifyApi = await initSpotifyApiForRoom(roomCode);
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
  const spotifyApi = await initSpotifyApiForRoom(roomCode);
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

// Stocker les tokens pour une salle - Modifier pour stocker aussi l'ID utilisateur
const storeTokenForRoom = async (roomCode, { accessToken, refreshToken, expiresIn = 3600 }) => { // Rendre async
  // Stocker avec expiration
  roomTokens[roomCode] = { 
    accessToken, 
    refreshToken,
    expiresAt: Date.now() + (expiresIn * 1000) // Ajouter l'expiration dès le stockage initial
  };
  // Essayer de récupérer et stocker l'ID utilisateur immédiatement
  const spotifyApi = await initSpotifyApiForRoom(roomCode);
  if (spotifyApi) {
      try {
          const data = await spotifyApi.getMe();
          if (data.body?.id) {
              roomAdminUserIds[roomCode] = data.body.id;
              logger.info('SPOTIFY', `ID Utilisateur ${data.body.id} stocké pour admin de ${roomCode}`);
          }
      } catch (error) {
          logger.error('SPOTIFY', `Impossible de récupérer l'ID utilisateur pour ${roomCode} après auth`, error);
      }
  }
  return true;
};

// Vérifier si une salle est connectée à Spotify
const isRoomConnected = (roomCode) => {
  return !!roomTokens[roomCode];
};

// Récupérer le profil utilisateur
const getUserProfile = async (roomCode) => {
  const spotifyApi = await initSpotifyApiForRoom(roomCode);
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

/**
 * Récupère les détails d'une playlist Spotify et les met en cache
 * @param {string} roomCode - Code de la salle
 * @param {string} playlistId - ID de la playlist Spotify
 * @returns {Promise<object|null>} Informations de la playlist ou null
 */
async function getPlaylistDetails(roomCode, playlistId) {
    // Initialiser la dead queue pour cette room si nécessaire
    if (!playlistDeadQueue[roomCode]) {
        playlistDeadQueue[roomCode] = new Set();
    }

    // Vérifier si la playlist est dans la dead queue (inaccessible)
    if (playlistDeadQueue[roomCode].has(playlistId)) {
        // Ne plus essayer, ne plus logger : skip silencieux
        return null;
    }

    const spotifyApi = await initSpotifyApiForRoom(roomCode);
    if (!spotifyApi) return null;

    try {
        const playlistData = await spotifyApi.getPlaylist(playlistId);
        const playlist = {
            id: playlistId,
            name: playlistData.body.name,
            artworkUrl: playlistData.body.images?.[0]?.url || null, // AJOUT : Artwork de la playlist
            total: playlistData.body.tracks.total,
            tracks: playlistData.body.tracks.items.map((item, index) => ({
                id: item.track.id,
                position: index + 1, // Position 1-based
                name: item.track.name,
                artist: item.track.artists.map(a => a.name).join(', ')
            }))
        };

        // Mise en cache
        playlistCache[roomCode] = playlist;
        logger.info('SPOTIFY_PLAYLIST', `Playlist "${playlist.name}" mise en cache pour ${roomCode}`, {
            total: playlist.total,
            playlistId,
            hasArtwork: !!playlist.artworkUrl // DEBUG: Vérifier si l'artwork est présent
        });

        return playlist;
    } catch (error) {
        // Log l'erreur UNE SEULE FOIS puis mettre en dead queue
        logger.warn('SPOTIFY_PLAYLIST', `Playlist ${playlistId} inaccessible pour ${roomCode} (mise en dead queue)`, {
            error: error.message || error.toString()
        });
        
        // Ajouter à la dead queue pour ne plus réessayer
        playlistDeadQueue[roomCode].add(playlistId);
        
        return null;
    }
}

/**
 * Calcule la position d'une piste dans une playlist
 * @param {string} trackId - ID de la piste
 * @param {object} playlist - Objet playlist du cache
 * @returns {object|null} { position, total } ou null si non trouvé
 */
function calculateTrackPosition(trackId, playlist) {
    if (!playlist || !trackId) return null;

    const track = playlist.tracks.find(t => t.id === trackId);
    if (!track) return null;

    return {
        position: track.position,
        total: playlist.total,
        playlistName: playlist.name
    };
}

/**
 * Extrait l'ID de playlist depuis l'URI du contexte Spotify
 * @param {string} contextUri - URI du contexte (ex: "spotify:playlist:37i9dQZF1DX0XUsuxWHRQd")
 * @returns {string|null} ID de la playlist ou null
 */
function extractPlaylistId(contextUri) {
    if (!contextUri || !contextUri.startsWith('spotify:playlist:')) {
        return null;
    }
    return contextUri.split(':')[2];
}

/**
 * Récupère l'état de lecture actuel pour l'admin de la salle, y compris la piste chargée (même si en pause).
 * ENRICHI : Détecte et gère les informations de playlist
 * @param {string} roomCode
 * @returns {object | null} L'objet playback state enrichi avec les infos de playlist
 */
async function getCurrentPlayback(roomCode) {
    let spotifyApi = await initSpotifyApiForRoom(roomCode);
    if (!spotifyApi) return null;

    try {
        // Utiliser getMyCurrentPlaybackState pour obtenir l'état, même si en pause
        const data = await spotifyApi.getMyCurrentPlaybackState();

        // Vérifier si un 'item' (piste) est présent dans la réponse.
        if (data.body && data.body.item) {
            // S'assurer que 'item' est bien une piste
            if (data.body.currently_playing_type === 'track' || !data.body.currently_playing_type) {
                
                // NOUVEAU : Enrichir avec les informations de playlist
                const enrichedPlayback = { ...data.body };
                
                // Vérifier si on joue depuis une playlist
                const contextUri = data.body.context?.uri;
                const playlistId = extractPlaylistId(contextUri);
                
                if (playlistId) {
                    // Initialiser la dead queue pour cette room si nécessaire
                    if (!playlistDeadQueue[roomCode]) {
                        playlistDeadQueue[roomCode] = new Set();
                    }
                    
                    // Vérifier si la playlist est dans la dead queue AVANT tout
                    if (playlistDeadQueue[roomCode].has(playlistId)) {
                        // Skip silencieux : playlist déjà connue comme inaccessible
                        // Ne pas logger, ne pas essayer de récupérer
                    } else {
                        // Vérifier le cache
                        let playlist = playlistCache[roomCode];
                        
                        // Si pas en cache OU playlist différente, récupérer les détails
                        if (!playlist || playlist.id !== playlistId) {
                            logger.info('SPOTIFY_PLAYLIST', `Nouvelle playlist détectée pour ${roomCode}`, { playlistId });
                            playlist = await getPlaylistDetails(roomCode, playlistId);
                            
                            // DEBUG: Log seulement quand une NOUVELLE playlist est chargée avec succès
                            if (playlist) {
                                logger.info('SPOTIFY_PLAYLIST_INFO', `PlaylistInfo créé pour ${roomCode}`, {
                                    playlistId: playlist.id,
                                    hasArtwork: !!playlist.artworkUrl,
                                    artworkUrl: playlist.artworkUrl
                                });
                            }
                        }
                        
                        // Calculer la position dans la playlist (seulement si playlist valide)
                        if (playlist) {
                            const positionInfo = calculateTrackPosition(data.body.item.id, playlist);
                            if (positionInfo) {
                                enrichedPlayback.playlistInfo = {
                                    id: playlist.id,
                                    name: playlist.name,
                                    artworkUrl: playlist.artworkUrl || null, // AJOUT : Artwork de la playlist
                                    position: positionInfo.position,
                                    total: positionInfo.total,
                                    remaining: positionInfo.total - positionInfo.position
                                };
                            }
                        }
                    }
                } else {
                    // Pas de playlist, effacer le cache si nécessaire
                    if (playlistCache[roomCode]) {
                        logger.info('SPOTIFY_PLAYLIST', `Sortie de playlist détectée pour ${roomCode}`);
                        delete playlistCache[roomCode];
                    }
                }
                
                return enrichedPlayback;
            } else {
                logger.info('SPOTIFY', `Élément en cours (${data.body.currently_playing_type}) ignoré pour ${roomCode}`);
                return null;
            }
        }
        return null;

    } catch (error) {
        if (error.statusCode === 401) {
            logger.warn('SPOTIFY', `Token expiré pour ${roomCode}, tentative de rafraîchissement.`);
            const refreshed = await refreshAccessTokenIfNeeded(roomCode);
            if (refreshed) {
                spotifyApi = await initSpotifyApiForRoom(roomCode);
                if (!spotifyApi) return null;
                try {
                    // Réessayer après refresh - même logique enrichie
                    const data = await spotifyApi.getMyCurrentPlaybackState();
                    if (data.body && data.body.item) {
                        if (data.body.currently_playing_type === 'track' || !data.body.currently_playing_type) {
                            // Répéter la logique d'enrichissement (à factoriser si nécessaire)
                            const enrichedPlayback = { ...data.body };
                            const contextUri = data.body.context?.uri;
                            const playlistId = extractPlaylistId(contextUri);
                            
                            if (playlistId) {
                                // Initialiser la dead queue pour cette room si nécessaire
                                if (!playlistDeadQueue[roomCode]) {
                                    playlistDeadQueue[roomCode] = new Set();
                                }
                                
                                // Vérifier si la playlist est dans la dead queue
                                if (!playlistDeadQueue[roomCode].has(playlistId)) {
                                    let playlist = playlistCache[roomCode];
                                    if (!playlist || playlist.id !== playlistId) {
                                        playlist = await getPlaylistDetails(roomCode, playlistId);
                                    }
                                    
                                    if (playlist) {
                                        const positionInfo = calculateTrackPosition(data.body.item.id, playlist);
                                        if (positionInfo) {
                                            enrichedPlayback.playlistInfo = {
                                                id: playlist.id,
                                                name: playlist.name,
                                                artworkUrl: playlist.artworkUrl || null, // AJOUT : Artwork de la playlist
                                                position: positionInfo.position,
                                                total: positionInfo.total,
                                                remaining: positionInfo.total - positionInfo.position
                                            };
                                        }
                                    }
                                }
                            }
                            
                            return enrichedPlayback;
                        }
                        return null;
                    }
                    return null;
                } catch (retryError) {
                    logger.error('SPOTIFY', `Erreur API Spotify même après refresh pour ${roomCode}`, retryError);
                    return null;
                }
            } else {
                logger.error('SPOTIFY', `Échec du refresh token pour ${roomCode}`);
                return null;
            }
        } else {
            logger.error('SPOTIFY', `Erreur API Spotify inattendue pour ${roomCode}`, error);
            return null;
        }
    }
}

// Méthode pour supprimer les tokens ET l'ID utilisateur d'une salle
function removeTokenForRoom(roomCode) { // Existant, modifier
  let removed = false;
  if (roomTokens[roomCode]) {
    delete roomTokens[roomCode];
    removed = true;
  }
  if (roomAdminUserIds[roomCode]) {
      delete roomAdminUserIds[roomCode];
      removed = true; // Assurer que c'est true si l'un ou l'autre est supprimé
  }
  // NOUVEAU : Nettoyer le cache de playlist
  clearPlaylistCache(roomCode);
  if (removed) {
      stopSpotifyPolling(roomCode); // Arrêter le polling si on déconnecte Spotify
  }
  return removed;
}

// NOUVEAU : Fonction de nettoyage du cache (à appeler lors de la déconnexion)
function clearPlaylistCache(roomCode) {
    if (playlistCache[roomCode]) {
        const playlistId = playlistCache[roomCode].id;
        delete playlistCache[roomCode];
        logger.info('SPOTIFY_PLAYLIST', `Cache playlist effacé pour ${roomCode}`, { playlistId });
    }
    
    // Nettoyer la dead queue de cette room
    if (playlistDeadQueue[roomCode]) {
        const deadCount = playlistDeadQueue[roomCode].size;
        delete playlistDeadQueue[roomCode];
        if (deadCount > 0) {
            logger.info('SPOTIFY_PLAYLIST', `Dead queue purgée pour ${roomCode}`, { deadPlaylistsCount: deadCount });
        }
    }
}

// Récupérer les appareils disponibles
const getAvailableDevices = async (roomCode) => {
  const spotifyApi = await initSpotifyApiForRoom(roomCode);
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

/**
 * Rafraîchit le token d'accès si nécessaire.
 * @param {string} roomCode
 * @returns {boolean} true si le refresh a réussi ou n'était pas nécessaire, false sinon.
 */
async function refreshAccessTokenIfNeeded(roomCode) {
    // Ne pas utiliser initSpotifyApiForRoom ici car ça créerait une récursion infinie
    // On crée l'API directement avec les tokens existants
    if (!roomTokens[roomCode]?.refreshToken) {
        logger.warn('SPOTIFY_REFRESH', `Pas de refresh token pour ${roomCode}`);
        return false;
    }

    const spotifyApi = spotifyConfig.createApi();
    spotifyApi.setAccessToken(roomTokens[roomCode].accessToken);
    spotifyApi.setRefreshToken(roomTokens[roomCode].refreshToken);

    try {
        logger.info('SPOTIFY_REFRESH', `Tentative de rafraîchissement du token pour ${roomCode}`);
        const data = await spotifyApi.refreshAccessToken();
        const newAccessToken = data.body['access_token'];
        const newRefreshToken = data.body['refresh_token'] || roomTokens[roomCode].refreshToken; // Garde l'ancien si pas de nouveau
        
        // Mettre à jour l'API Spotify
        spotifyApi.setAccessToken(newAccessToken);
        if (newRefreshToken !== roomTokens[roomCode].refreshToken) {
            spotifyApi.setRefreshToken(newRefreshToken);
        }
        
        // Mettre à jour le token stocké avec expiration
        roomTokens[roomCode] = {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            expiresAt: Date.now() + ((data.body['expires_in'] || 3600) * 1000)
        };
        
        logger.info('SPOTIFY_REFRESH', `Token rafraîchi avec succès pour ${roomCode}`);
        return true;
    } catch (error) {
        logger.error('SPOTIFY', `Échec du refresh token pour ${roomCode}`, error);
        
        // NOUVEAU: Enregistrer l'échec dans le middleware de récupération
        spotifyRecovery.recordFailure(roomCode, 'token_refresh_failed');
        
        // Notifier les clients de l'échec
        try {
            const io = require('../socket/index').getIO();
            if (io) {
                // Envoyer un état Spotify déconnecté
                io.to(roomCode).emit('spotify_connected', { 
                    connected: false, 
                    error: 'refresh_failed',
                    message: 'Token Spotify expiré. Veuillez vous reconnecter.' 
                });
                
                // Envoyer un événement track_changed avec null pour nettoyer l'interface
                io.to(roomCode).emit('spotify_track_changed', {
                    roomCode,
                    track: null,
                    newTrack: null
                });
            }
        } catch (ioError) {
             logger.error('SPOTIFY_REFRESH', `Erreur lors de l'émission des événements de déconnexion`, ioError);
        }
        return false;
    }
}

// Vérifier et rafraîchir le token si proche de l'expiration (avant qu'il expire)
const ensureValidToken = async (roomCode) => {
  if (!roomTokens[roomCode]) {
    return false;
  }
  
  const tokenData = roomTokens[roomCode];
  const now = Date.now();
  const timeUntilExpiry = tokenData.expiresAt - now;
  
  // Rafraîchir si le token expire dans moins de 5 minutes (300 000 ms)
  if (timeUntilExpiry < 300000) {
    logger.info('SPOTIFY_REFRESH', `Token expire bientôt pour ${roomCode}, rafraîchissement préventif`);
    return await refreshAccessTokenIfNeeded(roomCode);
  }
  
  return true; // Token encore valide
};

/**
 * Vérifie si la piste Spotify a changé et notifie les clients.
 * @param {string} roomCode
 */
async function checkAndNotifyTrackChange(roomCode) {

    let io; // Déclarer io ici
    try { // <--- ENCADRER TOUT LE CORPS DE LA FONCTION ---

        const room = Room.get(roomCode);
        io = require('../socket/index').getIO(); // <-- MODIFIÉ: Appel direct

        // --- Vérifications initiales ---
        if (!io) {
             logger.error('SPOTIFY_POLL_FAIL', `require('../socket/index').getIO() a retourné null/undefined pour ${roomCode}. Arrêt de la vérification.`);
             stopSpotifyPolling(roomCode); // Arrêter le polling pour cette salle si io est invalide
             return;
        }
        if (!room) {
             logger.warn('SPOTIFY_POLL_FAIL', `Room.get a retourné null/undefined pour ${roomCode}. Arrêt de la vérification.`);
             stopSpotifyPolling(roomCode); // La salle n'existe plus
             return;
        }

        const connectedCheck = isRoomConnected(roomCode);
        // Vérifier les conditions après s'être assuré que room et io sont valides
        if (!room.options?.spotifyEnabled || !connectedCheck) {
            logger.warn('SPOTIFY_POLL_CHECK', `Conditions non remplies dans checkAndNotify pour ${roomCode}`, {
                roomExists: true, // On sait que la room existe
                spotifyEnabled: room.options?.spotifyEnabled,
                isConnected: connectedCheck
            });
            if (!connectedCheck) { // Arrêter seulement si la connexion Spotify est perdue
                 logger.warn('SPOTIFY_POLL_CHECK', `Appel à stopSpotifyPolling depuis checkAndNotify pour ${roomCode} car connexion invalide.`);
                stopSpotifyPolling(roomCode);
            }
            return; // Sortir si les conditions ne sont pas remplies
        }

        // --- Logique principale ---
        const currentPlayback = await getCurrentPlayback(roomCode); // Maintenant enrichi !
        const newTrack = currentPlayback?.item ? {
            id: currentPlayback.item.id,
            artist: currentPlayback.item.artists.map(a => a.name).join(', '),
            title: currentPlayback.item.name,
            artworkUrl: currentPlayback.item.album.images?.[0]?.url,
            // NOUVEAU : Ajouter les infos de playlist si disponibles
            playlistInfo: currentPlayback.playlistInfo || null
        } : null;

        const trackIdChanged = newTrack?.id !== room.currentTrack?.id;

        if (trackIdChanged) {
            // Log du changement de musique détecté
            logger.info('SPOTIFY_TRACK_CHANGE', `🎵 Changement de musique détecté pour ${roomCode}`, {
                previousTrack: room.currentTrack ? `${room.currentTrack.artist} - ${room.currentTrack.title}` : 'Aucune',
                newTrack: newTrack ? `${newTrack.artist} - ${newTrack.title}` : 'Aucune',
                trackId: newTrack?.id,
                hasPlaylist: !!newTrack?.playlistInfo,
                playlistPosition: newTrack?.playlistInfo ? `${newTrack.playlistInfo.position}/${newTrack.playlistInfo.total}` : 'N/A'
            });
            
            Room.resetSpotifyState(roomCode, newTrack);
            const updatedRoom = Room.get(roomCode);
            
            // ENRICHIR le payload avec les infos de playlist
            const payload = { 
                roomCode,
                track: updatedRoom.currentTrack,
                newTrack: updatedRoom.currentTrack // Compatibilité
            };
            
            try {
                io.to(roomCode).emit('spotify_track_changed', payload);
                io.to(roomCode).emit('update_players', updatedRoom.players);
                
                // NOUVEAU: Marquer le succès de récupération si applicable
                if (spotifyRecovery.isInFailureState(roomCode)) {
                    spotifyRecovery.markRecoverySuccess(roomCode);
                }
                
            } catch (emitError) {
                logger.error('SPOTIFY_EMIT', `Erreur lors de l'émission pour ${roomCode}`, emitError);
                spotifyRecovery.recordFailure(roomCode, 'emit_failed');
            }
        } else {
             // logger.info('SPOTIFY_POLL_INFO', `Aucun changement d'ID de piste détecté pour ${roomCode}.`);
        }

    } catch (error) { // <--- Bloc catch pour toute erreur dans la fonction ---
        // S'assurer que io est défini avant de l'utiliser dans le catch (peu probable mais par sécurité)
        if (error instanceof TypeError && error.message.includes('getIO is not a function')) {
             logger.error('SPOTIFY_POLL_GLOBAL_ERROR', `Erreur getIO persistante dans checkAndNotify pour ${roomCode}`, { message: error.message, stack: error.stack });
             // Arrêter le polling si l'erreur persiste même avec require direct
             stopSpotifyPolling(roomCode);
        } else {
            logger.error('SPOTIFY_POLL_GLOBAL_ERROR', `Erreur globale dans checkAndNotifyTrackChange pour ${roomCode}`, { message: error.message, stack: error.stack });
        }
        // Optionnel: arrêter le polling pour cette salle si une erreur inattendue survient
        // stopSpotifyPolling(roomCode);
    }
}

// --- Mécanisme de Polling ---
const activeSpotifyRooms = new Set();
let pollingIntervalId = null;
const POLLING_INTERVAL_MS = 1500; // Vérifier toutes les 2,5 secondes (ajuster)

function startSpotifyPolling(roomCode) {
    const room = Room.get(roomCode);

    if (!room || !room.options?.spotifyEnabled || !isRoomConnected(roomCode)) {
        logger.warn('SPOTIFY_POLL', `Ne démarre pas le polling pour ${roomCode} (conditions non remplies)`);
        return;
    }
    if (activeSpotifyRooms.has(roomCode)) {
        logger.info('SPOTIFY_POLL_LIFECYCLE', `Polling déjà actif pour ${roomCode}, skip start.`);
        return; // Déjà en cours pour cette salle
    }

    activeSpotifyRooms.add(roomCode);
    logger.info('SPOTIFY_POLL', `Polling démarré pour ${roomCode}. Salles actives: ${Array.from(activeSpotifyRooms)}`); // Log salles actives
    // Démarrer l'intervalle global s'il n'est pas déjà lancé
    if (!pollingIntervalId) {
        // --- LOG AJOUTÉ ---
        logger.info('SPOTIFY_POLL_LIFECYCLE', `Démarrage de setInterval (${POLLING_INTERVAL_MS}ms)`);
        // --- FIN LOG ---
        pollingIntervalId = setInterval(pollActiveRooms, POLLING_INTERVAL_MS);
    } else {
        // --- LOG AJOUTÉ ---
        logger.info('SPOTIFY_POLL_LIFECYCLE', `setInterval déjà actif (ID: ${pollingIntervalId})`);
        // --- FIN LOG ---
    }
}

function stopSpotifyPolling(roomCode) {
    if (activeSpotifyRooms.has(roomCode)) {
        activeSpotifyRooms.delete(roomCode);
        // Arrêter l'intervalle global si plus aucune salle n'est active
        if (activeSpotifyRooms.size === 0 && pollingIntervalId) {
            // --- LOG AJOUTÉ ---
            logger.info('SPOTIFY_POLL_LIFECYCLE', `Arrêt de setInterval (ID: ${pollingIntervalId}) car plus de salles actives.`);
            // --- FIN LOG ---
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
        }
    }
}

async function pollActiveRooms() {
    if (activeSpotifyRooms.size === 0) {
        // Sécurité: si l'intervalle tourne mais qu'il n'y a plus de salles, on l'arrête.
        if (pollingIntervalId) {
            logger.warn('SPOTIFY_POLL_LIFECYCLE', `Arrêt de setInterval (ID: ${pollingIntervalId}) depuis pollActiveRooms car activeSpotifyRooms est vide.`);
            clearInterval(pollingIntervalId);
            pollingIntervalId = null;
        }
        return;
    }

    // Utiliser Promise.allSettled pour lancer les vérifications en parallèle
    await Promise.allSettled(
        Array.from(activeSpotifyRooms).map(roomCode => checkAndNotifyTrackChange(roomCode))
    );
}

module.exports = {
  pausePlayback,
  resumePlayback,
  getAuthorizationUrl,
  storeTokenForRoom,
  isRoomConnected,
  getUserProfile,
  removeTokenForRoom,
  getAvailableDevices,
  getCurrentPlayback,
  checkAndNotifyTrackChange,
  startSpotifyPolling,
  stopSpotifyPolling,
  // NOUVEAUX EXPORTS
  clearPlaylistCache,
  getPlaylistDetails, // Pour utilisation externe si besoin
};
