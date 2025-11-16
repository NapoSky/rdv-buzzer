// src/components/admin/AdminRoomView/AdminRoomView.js
import React, { useState, useEffect, useRef, useContext, useCallback, useEffectEvent, useMemo } from 'react';
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
  pointsWrong: 9,
  penaltyDelay: 5,
  correctAnswerDelay: 1,
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
  // ✅ AJOUT : Référence pour forcer l'affichage de la modal
  const forceModalRef = useRef(null);
  const isModalForcedRef = useRef(false);
  const [isProcessingJudgment, setIsProcessingJudgment] = useState(false); // ✅ NOUVEAU
  const [showKickList, setShowKickList] = useState(false);
  const [showUpdateScoreList, setShowUpdateScoreList] = useState(false);
  const [showCloseRoomModal, setShowCloseRoomModal] = useState(false);
  const [showPostCloseModal, setShowPostCloseModal] = useState(false);
  const [closeStatus, setCloseStatus] = useState({ roomClosed: false, dataSaved: false });
  const [sortDescending, setSortDescending] = useState(true);
  const [sortByScore, setSortByScore] = useState(true);
  const { isConnected: spotifyConnected, hasDevices, spotifyUser, refreshStatus } = useSpotify();
  const audioRef = useRef(null);
  const clearBuzzTimeoutRef = useRef(null); // ✅ RÉFÉRENCE pour annuler les timeouts
  const lastProcessedBuzzRef = useRef(null); // ✅ RÉFÉRENCE pour éviter le spam de buzz
  const [showSpotifyModal, setShowSpotifyModal] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isConnectedToRoom, setIsConnectedToRoom] = useState(false);
  const initializationAttempted = useRef(false);
  const [foundArtist, setFoundArtist] = useState(false);
  const [foundTitle, setFoundTitle] = useState(false);
  const [currentTrackInfo, setCurrentTrackInfo] = useState(null);

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
        
        // ✅ RESTAURATION DU BUZZ : Vérifier si un joueur a buzzé
        if (joinResponse.players) {
          const buzzedPlayerId = Object.keys(joinResponse.players).find(
            id => joinResponse.players[id].buzzed === true && !joinResponse.players[id].isAdmin
          );
          
          if (buzzedPlayerId) {
            const buzzedPlayerData = joinResponse.players[buzzedPlayerId];
            console.log("[AdminRoomView] 🔔 Restauration du buzz lors de la jointure:", {
              playerId: buzzedPlayerId,
              pseudo: buzzedPlayerData.pseudo
            });
            
            // Restaurer l'état du buzz pour afficher la modale
            const restoredBuzzedPlayer = {
              pseudo: buzzedPlayerData.pseudo,
              playerId: buzzedPlayerId
            };
            
            setBuzzedPlayer(restoredBuzzedPlayer);
            forceModalRef.current = restoredBuzzedPlayer;
            isModalForcedRef.current = true;
            
            // ✅ PAUSE SPOTIFY : Si Spotify est actif, mettre en pause
            // L'admin n'était pas là quand le buzz s'est produit, donc la musique continue
            // Il faut la couper maintenant pour permettre le jugement
            (async () => {
              try {
                const currentlyConnected = await refreshStatus();
                if (currentlyConnected) {
                  await pausePlayback();
                  console.log("[AdminRoomView] 🎵 Musique Spotify mise en pause après restauration du buzz");
                }
              } catch (error) {
                console.error('[AdminRoomView] Erreur pause Spotify lors de la restauration:', error);
              }
            })();
          }
        }
      }
    } catch (error) {
      console.error("Erreur lors de la jointure de salle:", error);
      setIsConnectedToRoom(false); // Réinitialiser en cas d'erreur
    }
  };

  // Effect Events pour les handlers socket (React 19.2)
  const onUpdatePlayers = useEffectEvent((newPlayers) => {
    setPlayers(newPlayers);
  });
  
  const onGamePaused = useEffectEvent((data) => {
    console.log("[AdminRoomView] Événement game_paused reçu:", data);
    const pausedState = data.paused;
    console.log("[AdminRoomView] État pause mis à jour:", pausedState);
    setPaused(pausedState);
  });
  
  const onRoomClosed = useEffectEvent(() => {
    setCloseStatus({ roomClosed: true, dataSaved: true });
    setShowPostCloseModal(true);
  });
  
  const onBuzzed = useEffectEvent(async (data) => {
    console.log("[AdminRoomView] 🚨 ÉVÉNEMENT BUZZED REÇU 🚨:", {
      data,
      dataType: typeof data,
      dataKeys: Object.keys(data || {}),
      currentBuzzedPlayer: buzzedPlayer,
      isProcessingJudgment,
      timestamp: Date.now()
    });
    
    if (!data || !data.buzzedBy) {
      console.error("[AdminRoomView] ❌ Données d'événement buzzed invalides:", data);
      return;
    }
    
    // ✅ PROTECTION 1 : Bloquer pendant jugement pour éviter remplacement de modal
    // L'admin doit finir son jugement avant qu'un nouveau buzz puisse s'afficher
    // Le backend émettra 'reset_buzzer' après jugement, ce qui débloquera
    if (isProcessingJudgment) {
      console.log("[AdminRoomView] 🚫 Buzz mis en attente - jugement en cours:", {
        buzzEnCours: buzzedPlayer?.pseudo,
        nouveauBuzz: data.buzzedBy,
        reason: "Attente de reset_buzzer après jugement"
      });
      // STOCKER le buzz en attente au lieu de l'ignorer
      forceModalRef.current = { pseudo: data.buzzedBy, playerId: data.playerId, pending: true };
      return;
    }
    
    // ✅ PROTECTION 2 : Si modal déjà affichée sans jugement en cours
    // L'admin n'a pas encore cliqué → STOCKER pour afficher après son action
    // (Évite de remplacer la modal pendant que l'admin la regarde)
    if (buzzedPlayer && !isProcessingJudgment) {
      console.log("[AdminRoomView] 🚫 Buzz mis en attente - modal déjà affichée:", {
        lockedPlayer: buzzedPlayer.pseudo,
        newPlayer: data.buzzedBy,
        reason: "Attente de l'action admin sur modal actuelle"
      });
      // STOCKER au lieu d'ignorer pour ne pas perdre le buzz
      forceModalRef.current = { pseudo: data.buzzedBy, playerId: data.playerId, pending: true };
      return;
    }
    
    // ⚠️ PROTECTION ANTISPAM : Éviter les doublons réseau (100ms)
    const buzzKey = `${data.playerId}-${data.buzzedBy}`;
    const now = Date.now();
    if (lastProcessedBuzzRef.current && 
        lastProcessedBuzzRef.current.key === buzzKey && 
        (now - lastProcessedBuzzRef.current.timestamp) < 100) {
      console.log("[AdminRoomView] 🚫 Buzz spam ignoré (doublon réseau):", { 
        player: data.buzzedBy, 
        deltaTime: now - lastProcessedBuzzRef.current.timestamp 
      });
      return;
    }
    
    lastProcessedBuzzRef.current = { key: buzzKey, timestamp: now };
    
    if (clearBuzzTimeoutRef.current) {
      console.log("[AdminRoomView] 🛑 Annulation timeout précédent");
      clearTimeout(clearBuzzTimeoutRef.current);
      clearBuzzTimeoutRef.current = null;
    }
    
    const newBuzzedPlayer = { pseudo: data.buzzedBy, playerId: data.playerId };
    
    forceModalRef.current = newBuzzedPlayer;
    isModalForcedRef.current = true;
    
    setBuzzedPlayer(null);
    setTimeout(() => {
      setBuzzedPlayer(newBuzzedPlayer);
      console.log("[AdminRoomView] ✅ Buzz player défini:", newBuzzedPlayer);
    }, 1);
    
    try {
      const currentlyConnected = await refreshStatus();
      if (currentlyConnected) {
        await pausePlayback();
      }
    } catch (error) {
      console.error('Erreur pause Spotify:', error);
    }
    
    try {
      if (audioRef.current) audioRef.current.play();
      if (navigator.vibrate) navigator.vibrate(300);
    } catch (error) {
      console.error('Erreur effets sonores:', error);
    }
  });
  
  const onConnect = useEffectEvent(() => {
    console.log('Reconnexion admin détectée');
    if (roomCode && !isConnectedToRoom) {
      setIsConnectedToRoom(true);
      joinRoom(roomCode, 'Admin', true, true).then((response) => {
        console.log('Réponse complète de joinRoom:', response);
        if (response && response.paused !== undefined) {
          setPaused(response.paused);
          console.log(`État de pause synchronisé: ${response.paused}`);
        }
        if (response && response.options) {
          setCurrentRoomOptions(response.options);
          console.log("Options de salle synchronisées lors de la reconnexion:", response.options);
        } else {
          console.warn("Les options de la salle n'ont pas été récupérées lors de la reconnexion.");
        }
      }).catch(error => {
        console.error("Erreur lors de la reconnexion admin:", error);
      });
    }
  });

  const onPlayerKicked = useEffectEvent((data) => {
    console.log('Joueur kické:', data);
    if (data.playerId) {
      setPlayers(prev => {
        const updatedPlayers = {...prev};
        delete updatedPlayers[data.playerId];
        return updatedPlayers;
      });
    }
  });

  const onRoomOptionsUpdated = useEffectEvent((options) => {
    console.log("[AdminRoomView] Événement room_options_updated REÇU (stringifié):", JSON.stringify(options));
    if (options) {
      console.log("[AdminRoomView] AVANT setCurrentRoomOptions, options reçu:", JSON.stringify(options));
      setCurrentRoomOptions(options);
    } else {
      console.warn("[AdminRoomView] Événement room_options_updated reçu avec payload vide ou falsy.");
    }
  });

  const onSpotifyTrackChanged = useEffectEvent((data) => {
    const newTrack = data.track || data.newTrack || null;
    setCurrentTrackInfo(newTrack);
    
    if (isProcessingJudgment) {
      console.log('[AdminRoomView] Changement de piste Spotify ignoré - jugement en cours');
      return;
    }
    
    if (buzzedPlayer && lastProcessedBuzzRef.current && 
        (Date.now() - lastProcessedBuzzRef.current.timestamp) < 2000) {
      console.log('[AdminRoomView] Changement de piste Spotify ignoré - buzz récent actif');
      return;
    }
    
    setFoundArtist(false);
    setFoundTitle(false);
    setBuzzedPlayer(null);
    
    console.log('[AdminRoomView] Changement de piste Spotify détecté', {
      track: newTrack ? `${newTrack.artist} - ${newTrack.title}` : 'Aucune',
      hasPlaylist: !!(newTrack?.playlistInfo),
      position: newTrack?.playlistInfo ? `${newTrack.playlistInfo.position}/${newTrack.playlistInfo.total}` : 'N/A'
    });
  });

  const onJudgeAnswerUpdate = useEffectEvent((data) => {
    if (data && data.artistFound !== undefined && data.titleFound !== undefined) {
      console.log(`[AdminRoomView] Mise à jour locale via judge_answer: artist=${data.artistFound}, title=${data.titleFound}`);
      setFoundArtist(data.artistFound);
      setFoundTitle(data.titleFound);
    }
  });

  const onNextQuestion = useEffectEvent(() => {
    console.log("[AdminRoomView] Question suivante - réinitialisation des états");
    
    if (isProcessingJudgment) {
      console.log('[AdminRoomView] Question suivante ignorée - jugement en cours');
      return;
    }
    
    if (buzzedPlayer && lastProcessedBuzzRef.current && 
        (Date.now() - lastProcessedBuzzRef.current.timestamp) < 2000) {
      console.log('[AdminRoomView] Question suivante ignorée - buzz récent actif');
      return;
    }
    
    setFoundArtist(false);
    setFoundTitle(false);
    setBuzzedPlayer(null);
    setIsProcessingJudgment(false);
    
    lastProcessedBuzzRef.current = null;
    if (clearBuzzTimeoutRef.current) {
      clearTimeout(clearBuzzTimeoutRef.current);
      clearBuzzTimeoutRef.current = null;
    }
  });

  const onResetBuzzer = useEffectEvent(() => {
    console.log("[AdminRoomView] 🔄 reset_buzzer reçu");
    
    // ✅ DÉBLOQUER le traitement du jugement
    setIsProcessingJudgment(false);
    console.log("[AdminRoomView] Fin traitement pass/annulation");
    
    // ✅ Nettoyer la protection anti-spam
    lastProcessedBuzzRef.current = null;
    
    // Vérifier s'il y a un buzz en attente (stocké pendant isProcessingJudgment)
    if (forceModalRef.current?.pending) {
      console.log("[AdminRoomView] ✅ Traitement du buzz en attente:", forceModalRef.current);
      
      const pendingBuzz = { ...forceModalRef.current };
      // Retirer le flag pending
      delete pendingBuzz.pending;
      
      // Afficher le buzz qui était en attente
      forceModalRef.current = pendingBuzz;
      isModalForcedRef.current = true;
      
      setBuzzedPlayer(null);
      setTimeout(() => {
        setBuzzedPlayer(pendingBuzz);
        console.log("[AdminRoomView] ✅ Buzz en attente affiché:", pendingBuzz);
        
        // Mettre en pause Spotify pour ce nouveau buzz
        refreshStatus().then(async (connected) => {
          if (connected) {
            await pausePlayback();
          }
        }).catch(err => console.error('Erreur pause Spotify pour buzz en attente:', err));
      }, 1);
    } else {
      // Pas de buzz en attente, nettoyer complètement
      console.log("[AdminRoomView] Aucun buzz en attente, nettoyage complet");
      forceModalRef.current = null;
      isModalForcedRef.current = false;
    }
  });

  // Configuration des écouteurs d'événements
  useEffect(() => {
    console.log("[AdminRoomView] Configuration des event listeners...");

    // Abonnement aux événements (utilisation des Effect Events)
    on('update_players', onUpdatePlayers);
    on('game_paused', onGamePaused);
    on('room_closed', onRoomClosed);
    on('buzzed', onBuzzed);
    on('reset_buzzer', onResetBuzzer);
    on('connect', onConnect);
    on('player_kicked', onPlayerKicked);
    on('room_options_updated', onRoomOptionsUpdated);
    on('spotify_track_changed', onSpotifyTrackChanged); 
    on('judge_answer', onJudgeAnswerUpdate);
    on('next_question', onNextQuestion);

    // Nettoyage des abonnements
    return () => {
      off('update_players', onUpdatePlayers);
      off('game_paused', onGamePaused);
      off('room_closed', onRoomClosed);
      off('buzzed', onBuzzed);
      off('reset_buzzer', onResetBuzzer);
      off('connect', onConnect);
      off('player_kicked', onPlayerKicked);
      off('room_options_updated', onRoomOptionsUpdated); 
      off('spotify_track_changed', onSpotifyTrackChanged);
      off('judge_answer', onJudgeAnswerUpdate);
      off('next_question', onNextQuestion);
    };
  }, [roomCode]);

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
    const isSecure = window.location.protocol === 'https:';
    let cookieOptions = `path=/`;
    if (cookieDomain) {
      cookieOptions += `; domain=${cookieDomain}`;
    }
    if (isSecure) {
      cookieOptions += `; Secure`;
    }
    cookieOptions += `; SameSite=Lax`;
    
    document.cookie = `spotify_redirect=${encodeURIComponent(window.location.pathname + window.location.search)}; ${cookieOptions}`;
    
    // Authentification Spotify avec le roomCode
    authenticateSpotify(roomCode);
    
    // *** AJOUTER : Mise à jour optimiste locale ***
    setCurrentRoomOptions(prev => ({
      ...prev,
      spotifyEnabled: true
    }));
    console.log('[AdminRoomView] Mise à jour optimiste: Spotify activé localement');
  };

  const handleDisconnectSpotify = async () => {
    try {
      const result = await disconnectSpotify(roomCode);
      if (result.success) {
        await refreshStatus();
        
        // *** AJOUTER : Mise à jour locale ***
        setCurrentRoomOptions(prev => ({
          ...prev,
          spotifyEnabled: false
        }));
        console.log('[AdminRoomView] Spotify désactivé localement');
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
      // ✅ Nettoyer la référence forcée
      forceModalRef.current = null;
      isModalForcedRef.current = false;
      lastProcessedBuzzRef.current = null; // ✅ Nettoyer la protection anti-spam
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
        
        // ❌ NE PAS mettre à jour l'état local immédiatement
        // setPaused(newPauseState);
        
        // Envoyer la commande au serveur
        const response = await togglePause(roomCode, newPauseState);
        
        if (response && response.error) {
          console.error(`Erreur lors du changement de pause:`, response.error);
          alert(`Erreur: ${response.error}`);
        } else {
          console.log(`Jeu ${newPauseState ? 'en pause' : 'repris'} avec succès`);
          // ✅ L'état sera mis à jour via l'événement 'game_paused' du serveur
        }
      } catch (error) {
        console.error("Exception lors du toggle pause:", error);
        alert(`Erreur: ${error.message}`);
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
      // ✅ PROTECTION 3 : Verrouiller immédiatement le joueur jugé
      // Cela garantit que même si l'état change, on juge le bon joueur
      const lockedPlayer = {
        playerId: buzzedPlayer.playerId,
        pseudo: buzzedPlayer.pseudo
      };
      
      console.log("[AdminRoomView] 🔒 Joueur verrouillé pour jugement:", lockedPlayer);
      
      // ✅ MARQUER le début du traitement
      setIsProcessingJudgment(true);
      console.log("[AdminRoomView] Début traitement jugement");
      
      // ✅ FERMER IMMÉDIATEMENT la modal quand l'admin clique
      setBuzzedPlayer(null);
      // ⚠️ NE JAMAIS effacer forceModalRef ici !
      // Un buzz peut arriver pendant l'émission de reset_buzzer
      // C'est onResetBuzzer qui gérera le nettoyage
      isModalForcedRef.current = false;
      
      // ✅ UTILISER lockedPlayer (pas buzzedPlayer qui pourrait changer)
      judgeResponse(roomCode, lockedPlayer.playerId, judgementType);
      
      console.log("[AdminRoomView] 📤 Jugement envoyé au backend:", {
        player: lockedPlayer.pseudo,
        playerId: lockedPlayer.playerId,
        judgement: judgementType
      });
  
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
  
      // ⚠️ NE PLUS utiliser de timeout ici
      // C'est onResetBuzzer qui débloquera isProcessingJudgment
      console.log("[AdminRoomView] En attente de reset_buzzer du serveur...");
    }
  };

  const handlePassBuzz = async () => {
    if (buzzedPlayer && roomCode) {
      // ✅ PROTECTION 3 : Verrouiller immédiatement le joueur
      const lockedPlayer = {
        playerId: buzzedPlayer.playerId,
        pseudo: buzzedPlayer.pseudo
      };
      
      console.log("[AdminRoomView] 🔒 Joueur verrouillé pour pass/annulation:", lockedPlayer);
      
      // ✅ MARQUER le début du traitement
      setIsProcessingJudgment(true);
      console.log("[AdminRoomView] Début traitement pass/annulation");
      
      // ✅ FERMER IMMÉDIATEMENT la modal quand l'admin clique
      setBuzzedPlayer(null);
      
      // ⚠️ NE JAMAIS effacer forceModalRef ici !
      // Un buzz peut arriver pendant l'émission de reset_buzzer
      // C'est onResetBuzzer qui gérera le nettoyage
      isModalForcedRef.current = false;
      
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

      // ⚠️ NE PLUS utiliser de timeout ici
      // C'est onResetBuzzer qui débloquera isProcessingJudgment
      console.log("[AdminRoomView] En attente de reset_buzzer du serveur...");
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
    if (!roomCode) return;
    
    try {
      // Récupérer l'intention de sauvegarde AVANT la fermeture
      const saveRequested = currentRoomOptions.saveRoom;
      
      const response = await closeRoom(roomCode, saveRequested);
      
      if (response && response.error) {
        console.error("Erreur lors de la fermeture de la salle:", response.error);
        alert(`Erreur: ${response.error}`);
        setShowCloseRoomModal(false);
      } else {
        console.log("Salle fermée avec succès");
        
        // NOUVEAU : Passer l'intention de sauvegarde à la modal
        setCloseStatus({ 
          roomClosed: true, 
          dataSaved: response?.dataSaved ?? false,
          saveRequested: saveRequested // AJOUTER cette information
        });
        
        setShowCloseRoomModal(false);
        setShowPostCloseModal(true);
      }
    } catch (error) {
      console.error("Exception lors de la fermeture de la salle:", error);
      
      // En cas d'erreur, on ne connaît pas l'intention
      setCloseStatus({ 
        roomClosed: false, 
        dataSaved: false,
        saveRequested: currentRoomOptions.saveRoom // Garder l'intention originale
      });
      
      setShowCloseRoomModal(false);
      setShowPostCloseModal(true);
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

  const handleNextQuestion = () => {
    const socket = getSocket();
    socket.emit('next_question', { roomCode });
  };

  // Calcul des joueurs triés avec useMemo (React 19.2 optimization)
  const sortedPlayers = useMemo(() => {
    return Object.entries(players)
      .filter(([, player]) => !player.isAdmin)
      .sort(([, playerA], [, playerB]) =>
        sortByScore
          ? (sortDescending ? playerB.score - playerA.score : playerA.score - playerB.score)
          : (sortDescending ? playerB.pseudo.localeCompare(playerA.pseudo) : playerA.pseudo.localeCompare(playerB.pseudo))
      );
  }, [players, sortByScore, sortDescending]);

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
                {sortedPlayers.map(([playerId, player]) => (
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
      
      {(buzzedPlayer || forceModalRef.current) && (() => {
        // ✅ Utiliser soit l'état, soit la référence forcée
        const modalPlayer = buzzedPlayer || forceModalRef.current;
        
        // ✅ CORRECTION : Toujours afficher la modal si on a un joueur, peu importe le flag de traitement
        return (
          <BuzzReceivedModal
            show={!!modalPlayer} // Afficher si on a un joueur, peu importe isProcessingJudgment
            pseudo={modalPlayer.pseudo}
            roomType={currentRoomOptions.roomType}
            onJudgeResponse={handleJudgeResponse}
            onPass={handlePassBuzz}
            foundArtist={foundArtist}
            foundTitle={foundTitle}
          />
        );
      })()}

      <audio ref={audioRef} src="/buzz-sound.mp3" preload="auto" />
      <div className="button-container">
        <button
          className="btn btn-danger fixed-width-button"
          onClick={() => setShowKickList(!showKickList)}
        >
          Kick joueur
        </button>
        <button
          className="btn btn-grey fixed-width-button"
          onClick={() => setShowUpdateScoreList(!showUpdateScoreList)}
        >
          {showUpdateScoreList ? 'Masquer la liste' : 'Modif. score'}
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
        
        {/* NOUVEAU : Bouton Question suivante intégré */}
        {((foundArtist || foundTitle) && !spotifyConnected) && (
          <button 
            onClick={handleNextQuestion}
            className="btn btn-primary fixed-width-button"
            title="Passer à la question suivante"
          >
            Question ➡️
          </button>
        )}
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
          currentTrackInfo={currentTrackInfo} // NOUVEAU
        />
      )}
    </div>
  );
}

export default AdminRoomView;

