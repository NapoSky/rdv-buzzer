// src/components/admin/AdminRoomView/AdminRoomView.js
import React, { useState, useEffect, useRef, useContext, useCallback } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { ThemeContext } from '../../../contexts/ThemeContext';
import './AdminRoomView.css';
import { pausePlayback, resumePlayback, authenticateSpotify, disconnectSpotify } from '../../../services/api/spotifyService';
import { useSpotify } from '../../../hooks/useSpotify';
import { getSocket, createRoom, joinRoom, on, off, resetBuzzer, togglePause, kickPlayer, closeRoom, judgeResponse, adjustScore, forceShowTitle, forceShowArtist, forceHideTitle, forceHideArtist } from '../../../services/socket/socketService';
import { ExclamationTriangleIcon, CheckIcon } from '@radix-ui/react-icons'; 

// Import des composants modaux
import CloseRoomModal from '../../shared/modals/admin/CloseRoomModal';
import PostCloseModal from '../../shared/modals/admin/PostCloseModal';
import KickPlayerModal from '../../shared/modals/admin/KickPlayerModal';
import SpotifyModal from '../../shared/modals/admin/SpotifyModal';
import BuzzReceivedModal from '../../shared/modals/admin/BuzzReceivedModal';
import UpdateScoreModal from '../../shared/modals/admin/UpdateScoreModal';
// Import des SVG
import SpotifyConnectedIcon from '../../../assets/icons/spotify-connected.svg';
import SpotifyDisconnectedIcon from '../../../assets/icons/spotify-disconnected.svg';

// Définir les options par défaut au cas où elles ne seraient pas passées
const DEFAULT_ROOM_OPTIONS = {
  roomType: 'Standard',
  pointsCorrect: 10,
  pointsWrong: 5,
  penaltyDelay: 3,
  saveRoom: true,
};

function AdminRoomView() {
  const { isDarkMode } = useContext(ThemeContext);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Utiliser useLocation pour obtenir l'état de navigation
  const location = useLocation();
  const urlRoomCode = searchParams.get('roomCode');
  const forceOwnership = searchParams.get('forceOwnership') === 'true';

  // État pour stocker les options de la salle
  const [currentRoomOptions, setCurrentRoomOptions] = useState(
    // Initialiser uniquement avec les défauts
    location.state?.roomOptions || DEFAULT_ROOM_OPTIONS
  );

  const [roomCode, setRoomCode] = useState(urlRoomCode || '');
  const [players, setPlayers] = useState({});
  const [paused, setPaused] = useState(false);
  const [scoreUpdates, setScoreUpdates] = useState({});
  const [buzzedPlayer, setBuzzedPlayer] = useState(null);
  const [showKickList, setShowKickList] = useState(false);
  const [showUpdateScoreList, setShowUpdateScoreList] = useState(false);
  const [showCloseRoomModal, setShowCloseRoomModal] = useState(false);
  const [showPostCloseModal, setShowPostCloseModal] = useState(false);
  const [closeStatus, setCloseStatus] = useState({ roomClosed: false, dataSaved: false });
  const [sortDescending, setSortDescending] = useState(true);
  const [sortByScore, setSortByScore] = useState(true);
  const { isConnected: spotifyConnected, hasDevices, spotifyUser, refreshStatus } = useSpotify();
  const audioRef = useRef(null);
  const [showSpotifyModal, setShowSpotifyModal] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isConnectedToRoom, setIsConnectedToRoom] = useState(false);
  const initializationAttempted = useRef(false);
  const [foundArtist, setFoundArtist] = useState(false);
  const [foundTitle, setFoundTitle] = useState(false);

  // Fonction pour créer une nouvelle salle
  const handleCreateRoom = async () => {
    try {
      // Attendez que la socket soit bien connectée avant de créer une salle
      const socket = getSocket();
      if (!socket.connected) {
        await new Promise(resolve => {
          const onConnect = () => {
            socket.off('connect', onConnect);
            resolve();
          };
          socket.on('connect', onConnect);
          // Timeout de sécurité
          setTimeout(resolve, 300);
        });
      }
      
      const response = await createRoom(currentRoomOptions); // Passer les options ici
      if (response && response.roomCode) {
        const createdRoom = response.roomCode;
        
        const joinResponse = await joinRoom(createdRoom, 'Admin', true);
        if (joinResponse.error) {
          alert(joinResponse.error);
        } else {
          // Mettre à jour l'URL sans recharger le composant
          window.history.replaceState(null, '', `/admin-room?roomCode=${createdRoom}`);
          setRoomCode(createdRoom);
        }
      } else {
        alert("Erreur: Impossible de créer une salle");
      }
    } catch (error) {
      console.error("Erreur lors de la création de salle:", error);
      alert("Erreur de connexion au serveur");
    }
  };

  // Fonction pour rejoindre une salle existante
  const handleJoinExistingRoom = async () => {
    if (!roomCode || isConnectedToRoom) return;

    try {
      setIsConnectedToRoom(true); // Marquer comme tentative en cours
      // ---> MODIFICATION ICI <---
      // Toujours forcer la prise de contrôle lors de la jointure en tant qu'admin.
      const joinResponse = await joinRoom(roomCode, 'Admin', true, true); // forceOwnership = true
      // --------------------------
      if (joinResponse.error) {
        alert(joinResponse.error);
        setIsConnectedToRoom(false); // Réinitialiser en cas d'erreur
      } else {
        setPaused(joinResponse.paused);
// !! IMPORTANT !! : Le backend devrait renvoyer les options de la salle
        // lors du join pour les récupérer en cas de reconnexion ou accès direct.
        if (joinResponse.options) {
           setCurrentRoomOptions(joinResponse.options);
           console.log("Options de salle récupérées du serveur :", joinResponse.options);
        } else {
// Fallback si le backend ne renvoie pas encore les options
           console.warn("Les options de la salle n'ont pas été récupérées du serveur lors de la jointure. Utilisation des options par défaut.");
           setCurrentRoomOptions(DEFAULT_ROOM_OPTIONS);
        }
      }
    } catch (error) {
      console.error("Erreur lors de la jointure de salle:", error);
      setIsConnectedToRoom(false); // Réinitialiser en cas d'erreur
    }
  };

  // Configuration des écouteurs d'événements
  useEffect(() => {
    // Fonctions de gestion des événements
    const handleUpdatePlayers = (players) => {
      setPlayers(players);
    };
    
    const handleGamePaused = ({ paused }) => {
      setPaused(paused);
    };
    
    const handleRoomClosed = () => {
      setCloseStatus({ roomClosed: true, dataSaved: true });
      setShowPostCloseModal(true);
    };
    
    const handleBuzzed = async (data) => {
      setBuzzedPlayer({ pseudo: data.buzzedBy, playerId: data.playerId });
      
      // Gérer Spotify si connecté
      const currentlyConnected = await refreshStatus();
      if (currentlyConnected) {
        try {
          await pausePlayback();
        } catch (error) {
          console.error('Erreur pause Spotify:', error);
        }
      }
      
      if (audioRef.current) audioRef.current.play();
      if (navigator.vibrate) navigator.vibrate(300);
    };
    
    const handleConnect = () => {
      console.log('Reconnexion admin détectée');
      // Uniquement se reconnecter si la socket a été déconnectée
      if (roomCode && !isConnectedToRoom) {
        setIsConnectedToRoom(true);
        joinRoom(roomCode, 'Admin', true, true).then((response) => {
          console.log('Réponse complète de joinRoom:', response);
          // À la reconnexion, synchroniser l'état de pause avec le serveur
          if (response && response.paused !== undefined) {
            setPaused(response.paused);
            console.log(`État de pause synchronisé: ${response.paused}`);
          }
          // ---> AJOUT: Synchroniser aussi les options de la salle <---
          if (response && response.options) {
            setCurrentRoomOptions(response.options);
            console.log("Options de salle synchronisées lors de la reconnexion:", response.options);
          } else {
            console.warn("Les options de la salle n'ont pas été récupérées lors de la reconnexion.");
            // Optionnel: Tenter de recharger depuis location.state ou défauts ?
            // setCurrentRoomOptions(location.state?.roomOptions || DEFAULT_ROOM_OPTIONS);
          }
          // ---------------------------------------------------------
        }).catch(error => {
          console.error("Erreur lors de la reconnexion admin:", error);
        });
      }
    };


    const handlePlayerKicked = (data) => {
      console.log('Joueur kické:', data);
      // Si vous gérez manuellement la liste des joueurs, vous pourriez faire:
      if (data.playerId) {
        setPlayers(prev => {
          const updatedPlayers = {...prev};
          delete updatedPlayers[data.playerId];
          return updatedPlayers;
        });
      }
    };

    // ---> GESTIONNAIRE MODIFIÉ <---
    const handleRoomOptionsUpdated = (options) => {
      console.log("[AdminRoomView] Événement room_options_updated REÇU (stringifié):", JSON.stringify(options)); // Log stringifié

      if (options) {
        // ---> AJOUTER LOG AVANT SET <---
        console.log("[AdminRoomView] AVANT setCurrentRoomOptions, options reçu:", JSON.stringify(options));
        // -----------------------------

        setCurrentRoomOptions(options); // Met à jour l'état local

        // ---> AJOUTER LOG APRÈS SET (via callback pour voir la valeur appliquée) <---
        // Note: setCurrentRoomOptions est asynchrone, pour voir la valeur *après* mise à jour,
        // il faudrait logguer dans un autre useEffect dépendant de currentRoomOptions,
        // ou utiliser le log avant le rendu de BuzzReceivedModal comme point de contrôle.
        // Le log avant le rendu (ligne 741) est déjà en place et montre 'undefined'.
        // --------------------------------------------------------------------------
      } else {
        console.warn("[AdminRoomView] Événement room_options_updated reçu avec payload vide ou falsy.");
      }
    };
    // -----------------------------

    // ---> NOUVEAU GESTIONNAIRE POUR LE CHANGEMENT DE PISTE SPOTIFY <---
    const handleSpotifyTrackChanged = (/* data */) => {
      // Vérifier si Spotify est connecté au moment où l'événement est reçu
      if (spotifyConnected) {
        console.log("[AdminRoomView] Nouvelle piste Spotify détectée, réinitialisation de foundArtist/Title.");
        setFoundArtist(false);
        setFoundTitle(false);
        // Optionnel: Réinitialiser aussi le joueur ayant buzzé si nécessaire pour votre logique
        // setBuzzedPlayer(null);
      } else {
        console.log("[AdminRoomView] Événement spotify_track_changed reçu, mais ignoré car Spotify n'est pas connecté.");
      }
    };
    // --------------------------------------------------------------------

    const handleJudgeAnswerUpdate = (data) => {
      if (data && data.artistFound !== undefined && data.titleFound !== undefined) {
        console.log(`[AdminRoomView] Mise à jour locale via judge_answer: artist=${data.artistFound}, title=${data.titleFound}`);
        setFoundArtist(data.artistFound);
        setFoundTitle(data.titleFound);
      }
    };

    // Abonnement aux événements
    on('update_players', handleUpdatePlayers);
    on('game_paused', handleGamePaused);
    on('room_closed', handleRoomClosed);
    on('buzzed', handleBuzzed);
    on('connect', handleConnect);
    on('player_kicked', handlePlayerKicked);
    on('room_options_updated', handleRoomOptionsUpdated);
    on('spotify_track_changed', handleSpotifyTrackChanged); 
    on('judge_answer', handleJudgeAnswerUpdate);

    // Nettoyage des abonnements
    return () => {
      off('update_players', handleUpdatePlayers);
      off('game_paused', handleGamePaused);
      off('room_closed', handleRoomClosed);
      off('buzzed', handleBuzzed);
      off('connect', handleConnect);
      off('player_kicked', handlePlayerKicked);
      off('room_options_updated', handleRoomOptionsUpdated); 
      off('spotify_track_changed', handleSpotifyTrackChanged);
      off('judge_answer', handleJudgeAnswerUpdate);
    };
  }, [roomCode, refreshStatus, spotifyConnected]);

  // Vérification de l'authentification admin
  useEffect(() => {
    const adminAuth = localStorage.getItem("localAdminAuthenticated") === "true";
    if (!adminAuth) {
      alert("Accès refusé. Veuillez revenir sur l'accueil.");
      navigate('/');
    }
  }, [navigate]);

  // Initialisation Spotify
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Gestion de l'événement Spotify connecté
  useEffect(() => {
    const messageHandler = (event) => {
      if (event.origin === window.location.origin && 
          event.data && 
          event.data.type === 'SPOTIFY_CONNECTED') {
        refreshStatus();
      }
    };
    
    window.addEventListener('message', messageHandler);
    return () => window.removeEventListener('message', messageHandler);
  }, [refreshStatus]);

  // Logique de création ou jointure de salle
  useEffect(() => {
    // Éviter les multiples tentatives d'initialisation
    if (initializationAttempted.current) {
      return; // Sortir immédiatement si une tentative a déjà été faite
    }
    
    // Marquer qu'une tentative d'initialisation a été faite
    initializationAttempted.current = true;
    
    const initializeRoom = async () => {
      if (isCreatingRoom) return;
      
      if (urlRoomCode) {
        if (!roomCode) {
          setRoomCode(urlRoomCode);
        }
        setIsCreatingRoom(true);
        try {
          await handleJoinExistingRoom();
        } finally {
          setIsCreatingRoom(false);
        }
      } else if (!roomCode) {
        setIsCreatingRoom(true);
        try {
          await handleCreateRoom();
        } finally {
          setIsCreatingRoom(false);
        }
      }
    };
    
    initializeRoom();
  }, []); // Dépendance vide pour que cet effet ne s'exécute qu'une fois au montage

  // Effet pour le Wake Lock - empêche l'écran de s'éteindre
  useEffect(() => {
    let wakeLock = null;
    let videoElement = null;
    let isUsingVideoWakeLock = false;
    
    // Fonction pour gérer le wake lock selon la plateforme
    const enableWakeLock = async () => {
      // Solution standard pour Chrome, Edge, etc.
      if ('wakeLock' in navigator) {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
          console.log('Wake Lock activé via API standard - écran maintenu allumé pour l\'admin');
          
          // Si on utilisait précédemment la vidéo, on peut la nettoyer
          if (isUsingVideoWakeLock && videoElement) {
            videoElement.pause();
            videoElement.remove();
            videoElement = null;
            isUsingVideoWakeLock = false;
            console.log('Vidéo de Wake Lock supprimée car API standard disponible');
          }
          
          return true; // Signal que l'API standard fonctionne
        } catch (err) {
          console.log('Wake Lock API non disponible, utilisation de l\'alternative vidéo');
          return createVideoWakeLock();
        }
      } 
      // Solution alternative pour Safari iOS et autres navigateurs sans API Wake Lock
      else {
        return createVideoWakeLock();
      }
    };
    
    // Fonction pour créer un wake lock basé sur une vidéo
    const createVideoWakeLock = () => {
      try {
        // Si un élément vidéo existe déjà et semble fonctionner, ne pas le recréer
        if (videoElement && videoElement.parentNode) {
          try {
            videoElement.play().then(() => {
              console.log('Wake Lock vidéo existant réactivé');
              isUsingVideoWakeLock = true;
              return true;
            }).catch(err => {
              console.log('Erreur lors de la relecture de la vidéo existante, création d\'un nouvel élément');
              // Si la lecture échoue, on nettoie et on continue pour créer un nouveau
              videoElement.pause();
              videoElement.remove();
              videoElement = null;
            });
          } catch (e) {
            // En cas d'erreur, on nettoie et on continue
            if (videoElement) {
              videoElement.pause();
              videoElement.remove();
              videoElement = null;
            }
          }
        }
        
        // Création d'un nouvel élément vidéo
        if (!videoElement) {
          videoElement = document.createElement('video');
          videoElement.setAttribute('playsinline', '');
          videoElement.setAttribute('muted', '');
          // Vidéo transparente, ultra-courte en base64
          videoElement.setAttribute('src', 'data:video/mp4;base64,AAAAIGZ0eXBtcDQyAAAAAG1wNDJtcDQxaXNvbWF2YzEAAATKbW9vdgAAAGxtdmhkAAAAANLEP5XSxD+VAAB1MAAAdU4AAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAACFpb2RzAAAAABCAgIAHAE/////+/wAAAiF0cmFrAAAAXHRraGQAAAAP0sQ/ldLEP5UAAAABAAAAAAAAAHUyAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAALAAAACQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAHUyAAAAAAABAAAAAAKobWRpYQAAACBtZGhkAAAAANLEP5XSxD+VAAB1MAAAdU5VxAAAAAAANmhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABMLVNNQVNIIFZpZGVvIEhhbmRsZXIAAAACC21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAcNzdGJsAAAAwXN0c2QAAAAAAAAAAQAAALFhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAALAAkABIAAAASAAAAAAAAAABCkFWQyBDb2RpbmcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//AAAAOGF2Y0MBZAAf/+EAHGdkAB+s2UCgC/oAAAMADwABAAZAGBerEQAAABhzdHRzAAAAAAAAAAEAAAAeAAAB4AAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAABAAAAAQAAAIxzdHN6AAAAAAAAAAAAAAAeAAADygAAAE8AAABPAAAATwAAAE8AAABOAAAATwAAAE8AAABPAAAATwAAAAAE8AAABPAAAATwAEAAAE8AAABPAAAATw8AAAAE8AAABPAAAATwAAAAAE8AAABPAAAATwBPAAAE8AAABPAAAATwAAAATwAAAE8AAABPAAAA4HN0Y28AAAAAAAAAAQAAADAAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjU2LjQwLjEwMQ==');
          videoElement.setAttribute('loop', '');
          videoElement.style.width = '1px';
          videoElement.style.height = '1px';
          videoElement.style.position = 'absolute';
          videoElement.style.opacity = '0';
          videoElement.style.pointerEvents = 'none';
          document.body.appendChild(videoElement);
          
          videoElement.muted = true;
          return videoElement.play().then(() => {
            console.log('Wake Lock activé via vidéo en arrière-plan - écran maintenu allumé pour l\'admin');
            isUsingVideoWakeLock = true;
            return true;
          }).catch(err => {
            console.error('Erreur lors de la lecture de la vidéo:', err);
            return false;
          });
        }
        return false;
      } catch (err) {
        console.error('Erreur lors de la création du wake lock vidéo:', err);
        return false;
      }
    };
    
    // Gérer les changements de visibilité pour réactiver le wake lock
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isConnectedToRoom) {
        // Réactiver le wake lock quand l'administrateur revient sur la page
        if ('wakeLock' in navigator && !wakeLock) {
          enableWakeLock();
        } else if (isUsingVideoWakeLock && videoElement) {
          // Seulement tenter de relancer la vidéo si c'est la méthode qu'on utilise
          videoElement.play().catch(err => {
            console.error('Erreur lors de la reprise de la vidéo:', err);
            // Si la reprise échoue, essayer de recréer complètement le mécanisme de wake lock
            createVideoWakeLock();
          });
        }
      }
    };
    
    // Acquérir le wake lock uniquement lorsque l'administrateur est connecté à une salle
    if (isConnectedToRoom) {
      enableWakeLock();
      // Ajouter un gestionnaire d'événements pour réactiver le wake lock
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    
    // Libérer le wake lock quand l'administrateur quitte la salle
    return () => {
      if (wakeLock) {
        wakeLock.release()
          .then(() => console.log('Wake Lock libéré'))
          .catch(e => console.log('Erreur lors de la libération du Wake Lock'));
      }
      
      if (videoElement) {
        videoElement.pause();
        videoElement.remove();
        console.log('Vidéo de Wake Lock supprimée');
      }
      
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isConnectedToRoom]); // Ne dépend que de la valeur de 'isConnectedToRoom'

  // Fonctions de gestion de Spotify
  const handleConnectSpotify = () => {
    // Extraire le domaine de base à partir de l'URL frontend
    const frontendUrl = window.location.origin;
    const url = new URL(frontendUrl);
    
    // Extraire le domaine de base (ex: example.com)
    // Cette méthode fonctionne pour example.com, sub.example.com, etc.
    const domainParts = url.hostname.split('.');
    const baseDomain = domainParts.length >= 2 ?
      domainParts.slice(-(domainParts.length === 2 || domainParts[domainParts.length - 2].length <= 2 ? 2 : 3)).join('.') :
      url.hostname;
    
    // Stocker le chemin de redirection dans un cookie avec le domaine extrait
    // Ne pas ajouter le préfixe "." si on est sur localhost
    const cookieDomain = url.hostname === 'localhost' ? '' : `.${baseDomain}`;
    const cookieOptions = `path=/` + (cookieDomain ? `; domain=${cookieDomain}` : '');
    
    document.cookie = `spotify_redirect=${encodeURIComponent(window.location.pathname + window.location.search)}; ${cookieOptions}`;
    
    // Authentification Spotify avec le roomCode
    authenticateSpotify(roomCode);
  };
  const handleDisconnectSpotify = async () => {
    try {
      const result = await disconnectSpotify(roomCode);
      if (result.success) {
        await refreshStatus();
      }
    } catch (error) {
      console.error('Erreur déconnexion Spotify:', error);
    }
  };

  // Version améliorée de handleKick dans AdminRoomView.js
const handleKick = async (playerId) => {
  if (roomCode) {
    try {
      // Émettre l'événement avec plus d'informations pour que le serveur puisse tenir une liste
      const response = await kickPlayer(roomCode, playerId, players[playerId]?.pseudo);
      
      if (response && response.error) {
        console.error("Erreur lors du kick:", response.error);
        alert(`Erreur: ${response.error}`);
      }
    } catch (error) {
      console.error("Erreur lors du kick:", error);
    }
  }
};


  const handleResetBuzzer = () => {
    if (roomCode) {
      resetBuzzer(roomCode);
      setBuzzedPlayer(null);
      // Réinitialiser l'état trouvé pour la nouvelle piste/question
      setFoundArtist(false);
      setFoundTitle(false);
    }
  };

  const handlePauseToggle = async () => {
    if (roomCode) {
      try {
        console.log(`Tentative de ${paused ? 'reprise' : 'pause'} du jeu`);
        const newPauseState = !paused;
        
        // Mettre à jour l'état local d'abord pour une réponse UI immédiate
        setPaused(newPauseState);
        
        // Envoyer la commande au serveur
        const response = await togglePause(roomCode, newPauseState);
        
        if (response && response.error) {
          console.error(`Erreur lors du changement de pause:`, response.error);
          // Restaurer l'état précédent en cas d'erreur
          setPaused(paused);
          alert(`Erreur: ${response.error}`);
        } else {
          console.log(`Jeu ${newPauseState ? 'en pause' : 'repris'} avec succès`);
        }
      } catch (error) {
        console.error("Exception lors du toggle pause:", error);
        // Restaurer l'état précédent en cas d'erreur
        setPaused(paused);
      }
    }
  };

  const handleScoreChange = (playerId, newScore) => {
    setScoreUpdates({ ...scoreUpdates, [playerId]: Number(newScore) });
  };

  const handleUpdateScore = (playerId) => {
   if (roomCode && scoreUpdates[playerId] !== undefined && players[playerId]) {
     const currentScore = players[playerId].score || 0;
     const newScore = Number(scoreUpdates[playerId]);
     const difference = newScore - currentScore;

     if (difference !== 0) {
       // Envoyer l'ajustement au backend via le nouvel événement
       adjustScore(roomCode, playerId, difference);
     }

     // Réinitialiser l'état local après envoi
     setScoreUpdates(prev => {
       const updates = { ...prev };
       delete updates[playerId];
       return updates;
     });
   }
 };

const handleIncrementScore = (playerId, adjustment) => { // Renommer 'increment' en 'adjustment' pour la clarté
  if (roomCode && players[playerId] && adjustment !== 0) { // Vérifier que l'ajustement n'est nul
    console.log(`[AdminRoomView] Appel adjustScore pour ${playerId} avec ajustement ${adjustment}`);
    // Appeler le nouveau service qui émet 'adjust_score'
    adjustScore(roomCode, playerId, adjustment);

    // L'UI se mettra à jour via l'événement 'update_players' reçu du backend
  } else {
    console.warn('[AdminRoomView] Données manquantes ou ajustement nul pour handleIncrementScore', { roomCode, playerId, adjustment });
  }
};

  const handleJudgeResponse = async (judgementType) => {
    if (buzzedPlayer && roomCode) {
      judgeResponse(roomCode, buzzedPlayer.playerId, judgementType);
  
      // Met à jour l'état localement basé sur le jugement
      if (judgementType === 'correct_title') {
        setFoundTitle(true);
      } else if (judgementType === 'correct_artist') {
        setFoundArtist(true);
      } else if (judgementType === 'correct_both') {
        setFoundArtist(true);
        setFoundTitle(true);
      }
  
      // Gérer la reprise Spotify côté client si nécessaire
      if (spotifyConnected) {
        try {
          await resumePlayback();
        } catch (error) {
          console.error('Erreur reprise Spotify:', error);
        }
      }
  
      // Réinitialiser l'état local du joueur ayant buzzé
      setBuzzedPlayer(null);
    }
  };

  const handlePassBuzz = async () => {
    if (buzzedPlayer && roomCode) {
      // On pourrait juste reset le buzzer, ou informer le serveur que le buzz est annulé/passé
      // Pour l'instant, on reset simplement, le serveur ne fera rien si personne n'a buzzé
      resetBuzzer(roomCode); // Demande au serveur de réactiver les buzzers pour tous

      if (spotifyConnected) {
        try {
          await resumePlayback();
        } catch (error) {
          console.error('Erreur reprise Spotify:', error);
        }
      }

      setBuzzedPlayer(null); // Nettoyer l'état local
    }
  };

  const handleSortByScore = () => {
    setSortByScore(true);
    setSortDescending(!sortDescending);
  };

  const handleSortByPseudo = () => {
    setSortByScore(false);
    setSortDescending(!sortDescending);
  };

  const handleCloseRoom = async () => {
    try {
      // Utiliser closeRoom du service socket au lieu de closeRoomRequest
      const response = await closeRoom(roomCode, currentRoomOptions.saveRoom); // Passer l'option ici
      
      if (response && response.error) {
        console.error("Erreur lors de la fermeture de la salle:", response.error);
        alert(`Erreur: ${response.error}`);
        setShowCloseRoomModal(false);
      } else {
        console.log("Salle fermée avec succès");
        // La réponse du backend pourrait confirmer si la sauvegarde a eu lieu
        setCloseStatus({ roomClosed: true, dataSaved: response?.dataSaved ?? currentRoomOptions.saveRoom });
        setShowCloseRoomModal(false);
        setShowPostCloseModal(true); // Afficher la modale post-fermeture
      }
    } catch (error) {
      console.error("Exception lors de la fermeture de la salle:", error);
      setCloseStatus({ roomClosed: false, dataSaved: false });
      setShowCloseRoomModal(false);
      setShowPostCloseModal(true); // Afficher la modale même en cas d'erreur
    }
  };

  const handleForceShowTitle = () => {
    if (roomCode && !foundTitle) { // N'envoyer que si pas déjà affiché
      console.log(`[AdminRoomView] Demande manuelle: Afficher Titre pour room ${roomCode}`);
      forceShowTitle(roomCode);
    }
  };

  const handleForceShowArtist = () => {
    if (roomCode && !foundArtist) { // N'envoyer que si pas déjà affiché
      console.log(`[AdminRoomView] Demande manuelle: Afficher Artiste pour room ${roomCode}`);
      forceShowArtist(roomCode);
    }
  };

  const handleForceHideTitle = () => {
    if (roomCode && foundTitle) { // N'envoyer que si affiché
      console.log(`[AdminRoomView] Demande manuelle: Masquer Titre pour room ${roomCode}`);
      forceHideTitle(roomCode); // Nouvelle fonction service socket
    }
  };

  const handleForceHideArtist = () => {
    if (roomCode && foundArtist) { // N'envoyer que si affiché
      console.log(`[AdminRoomView] Demande manuelle: Masquer Artiste pour room ${roomCode}`);
      forceHideArtist(roomCode); // Nouvelle fonction service socket
    }
  };

  return (
    <div className={`admin-container ${isDarkMode ? 'dark-mode' : ''}`}>
      <div className="admin-header">
        <h2 style={{ fontSize: '1.5rem', textAlign: 'center' }}>
          Gestion de salle Admin
        </h2>
        {roomCode && (
          <div className="text-center mb-4">
            <h3>Salle : {roomCode}</h3>
          </div>
        )}
      </div>
      {roomCode ? (
        <div className="player-list-container">
          <div className="d-flex justify-content-between align-items-center">
            <h3 className="mt-4">Liste des joueurs :</h3>
            <div className="d-flex align-items-center">
              <button
                className="btn btn-link p-0 me-3 spotify-button"
                onClick={() => {
                  console.log('Bouton Spotify cliqué');
                  setShowSpotifyModal(true)
                }}
                title={spotifyConnected ? 'Spotify connecté' : 'Connecter Spotify'}
                style={{ marginTop: '-2px', display: 'flex', cursor: 'pointer', zIndex: 101 }}
              >
                <img 
                  src={spotifyConnected ? SpotifyConnectedIcon : SpotifyDisconnectedIcon} 
                  alt={spotifyConnected ? "Spotify Connecté" : "Spotify Déconnecté"} 
                  style={{ pointerEvents: 'none' }}
                />
              </button>
              
              <button className="btn btn-outline-secondary" onClick={handleSortByScore}>
                {sortByScore ? (sortDescending ? '📊🔽' : '📊🔼') : '📊'}
              </button>
              <button className="btn btn-outline-secondary" onClick={handleSortByPseudo}>
                {!sortByScore ? (sortDescending ? '🆎🔼' : '🆎🔽') : '🆎'}
              </button>
            </div>
          </div>
          <div className="ranking-scroll">
            <table className="table table-striped table-hover">
              <thead>
                <tr>
                  <th className="pseudo-column">Pseudo</th>
                  <th>Score</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(players)
                  .filter(([, player]) => !player.isAdmin)
                  .sort(([, playerA], [, playerB]) =>
                    sortByScore
                      ? (sortDescending ? playerB.score - playerA.score : playerA.score - playerB.score)
                      : (sortDescending ? playerB.pseudo.localeCompare(playerA.pseudo) : playerA.pseudo.localeCompare(playerB.pseudo))
                  )
                  .map(([playerId, player]) => (
                    <tr key={playerId}>
                      <td className="pseudo-column">{player.pseudo}</td>
                      <td>{player.score}</td>
                      <td className="status-column">
                        {/* Remplacer l'emoji par les icônes Radix */}
                        <span className={`status-icon ${player.disconnected ? 'disconnected' : 'connected'}`}>
                          {player.disconnected ? <ExclamationTriangleIcon /> : <CheckIcon />}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-success me-2"
                          // Utiliser handleIncrementScore avec la valeur positive des options
                          onClick={() => handleIncrementScore(playerId, currentRoomOptions.pointsCorrect)}
                        >
                          +{currentRoomOptions.pointsCorrect} {/* Afficher la valeur dynamique */}
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          // Utiliser handleIncrementScore avec la valeur négative des options
                          onClick={() => handleIncrementScore(playerId, -currentRoomOptions.pointsWrong)}
                        >
                          -{currentRoomOptions.pointsWrong} {/* Afficher la valeur dynamique */}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p>Aucune salle définie.</p>
      )}

      {showKickList && (
        <KickPlayerModal
          show={showKickList}
          players={players}
          onKick={handleKick}
          onClose={() => setShowKickList(false)}
        />
      )}

      {showUpdateScoreList && (
        <UpdateScoreModal
          show={showUpdateScoreList}
          players={players}
          scoreUpdates={scoreUpdates}
          onScoreChange={handleScoreChange}
          onUpdateScore={handleUpdateScore}
          onClose={() => setShowUpdateScoreList(false)}
        />
      )}
      
      {buzzedPlayer && (      
        <BuzzReceivedModal
          show={!!buzzedPlayer}
          pseudo={buzzedPlayer.pseudo}
          roomType={currentRoomOptions.roomType} // Passer le type de blindtest
          onJudgeResponse={handleJudgeResponse} // Passer la fonction de jugement unifiée
          onPass={handlePassBuzz}
          foundArtist={foundArtist} // Nouvelle prop
          foundTitle={foundTitle}   // Nouvelle prop
        />
      )}

      <audio ref={audioRef} src="/buzz-sound.mp3" preload="auto" />
      <div className="button-container">
        <button
          className="btn btn-danger fixed-width-button"
          onClick={() => setShowKickList(!showKickList)}
        >
          Kicker un joueur
        </button>
        <button
          className="btn btn-grey fixed-width-button"
          onClick={() => setShowUpdateScoreList(!showUpdateScoreList)}
        >
          {showUpdateScoreList ? 'Masquer la liste' : 'Modifier un score'}
        </button>
        <button
          className="btn btn-warning fixed-width-button"
          onClick={handleResetBuzzer}
        >
          Reset Buzzer
        </button>
        <button
          className={`fixed-width-button btn ${paused ? 'btn-success' : 'btn-danger'}`}
          onClick={handlePauseToggle}
        >
          {paused ? 'Reprendre' : 'Pause'}
        </button>
      </div>
      <div className="button-container">
        <button
            className="btn btn-closeroom"
            onClick={() => setShowCloseRoomModal(true)}
        >
          Fermer la salle
        </button>
      </div>
      {showCloseRoomModal && (
        <CloseRoomModal
          show={showCloseRoomModal}
          onConfirm={handleCloseRoom}
          onCancel={() => setShowCloseRoomModal(false)}
        />
      )}
      
      {showPostCloseModal && (
        <PostCloseModal
          show={showPostCloseModal}
          closeStatus={closeStatus}
          onClose={() => {
            // Nettoyer les listeners
            off('update_players');
            off('game_paused');
            off('room_closed');
            off('buzzed');
            off('connect');
            off('player_kicked');
            
            // Nettoyer le localStorage
            localStorage.removeItem('roomCode');
            
            // Fermer la modale
            setShowPostCloseModal(false);
            
            // Rediriger vers la page d'accueil
            navigate('/');
          }}
        />
      )}

      {showSpotifyModal && (
        <SpotifyModal
          show={showSpotifyModal}
          spotifyConnected={spotifyConnected}
          spotifyUser={spotifyUser}
          hasDevices={hasDevices}
          onConnect={() => {
            handleConnectSpotify();
            setShowSpotifyModal(false);
          }}
          onChangeAccount={() => {
            handleConnectSpotify(); // Relance l'auth pour changer
            setShowSpotifyModal(false);
          }}
          onDisconnect={() => {
            handleDisconnectSpotify();
            setShowSpotifyModal(false);
          }}
          onClose={() => setShowSpotifyModal(false)}
          foundTitle={foundTitle}
          foundArtist={foundArtist}
          onForceShowTitle={handleForceShowTitle}
          onForceShowArtist={handleForceShowArtist}
          onForceHideTitle={handleForceHideTitle}
          onForceHideArtist={handleForceHideArtist}
        />
      )}
    </div>
  );
}

export default AdminRoomView;

