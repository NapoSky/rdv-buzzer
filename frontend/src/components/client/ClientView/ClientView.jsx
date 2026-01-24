import React, { useState, useEffect, useContext, useRef, useEffectEvent, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import { 
  ExclamationTriangleIcon, 
  BellIcon, 
  CheckIcon, 
  UpdateIcon,
  ExitIcon,
  LightningBoltIcon,
  ChevronUpIcon, // Ajouter pour l'indicateur
  ChevronDownIcon // Ajouter pour l'indicateur
} from '@radix-ui/react-icons';

import SpotifyDisplay from '../SpotifyDisplay/SpotifyDisplay';
import { ThemeContext } from '../../../contexts/ThemeContext';
import { useNotification } from '../../../contexts/NotificationContext';
import { useServerTimeContext } from '../../../contexts/ServerTimeContext';
import TimeSyncWarning from '../../common/TimeSyncWarning/TimeSyncWarning';
import { brand } from '../../../config/brand';
import { 
  getSocket, 
  joinRoom, 
  on, 
  off, 
  buzz, 
  initializeSocket, 
  ensureSocketConnection 
} from '../../../services/socket/socketService';
import { useSocketError } from '../../../hooks/useSocketError';
import { useSocketStatus } from '../../../hooks/useSocketStatus';

import './ClientView.css';

function ClientView({ setActiveRoomCode }) {
  // Contextes
  const { isDarkMode } = useContext(ThemeContext);
  // Correction: utiliser les fonctions spécifiques du contexte
  const { success, error, warning, info } = useNotification();
  const { timeOffset, isSynced, syncQuality } = useServerTimeContext();
  
  // Effect Events pour les notifications (React 19.2)
  const onSuccess = useEffectEvent((message) => {
    success(message);
  });

  const onError = useEffectEvent((message) => {
    error(message);
  });

  const onWarning = useEffectEvent((message) => {
    warning(message);
  });

  const onInfo = useEffectEvent((message) => {
    info(message);
  });
  
  // Effect Event pour vérifier et activer le buzzer (toujours les dernières valeurs)
  const checkAndActivateBuzzer = useEffectEvent((notify = false) => {
    const trackFullyFound = 
      (roomOptions?.roomType === 'Standard' && (foundArtist || foundTitle)) ||
      (roomOptions?.roomType === 'Titre/Artiste' && foundArtist && foundTitle);
    
    if (!gamePaused && !trackFullyFound) {
      setIsDisabled(false);
      if (notify) onInfo('Le buzzer est à nouveau disponible');
    }
  });
  
  // Effect Event pour la connexion/reconnexion à la salle (toujours les dernières valeurs)
  const connectToRoomAndUpdateState = useEffectEvent(() => {
    if (!roomCode || !pseudo || roomClosedRef.current) return;

    // Vérifier d'abord si l'utilisateur a été expulsé
    if (localStorage.getItem('kicked_from_' + roomCode) === 'true') {
      onError('Vous avez été expulsé de cette salle par l\'administrateur.');
      navigateToHome();
      return;
    }
  
    joinRoom(roomCode, pseudo).then(response => {
      if (response && response.error) {
        setRoomError(response.error);
        onError(response.error);
      } else if (response) {
        // Mettre à jour l'état de pause et de présence admin en fonction de la réponse du serveur
        if (response.paused !== undefined) {
          setGamePaused(response.paused);
          
          // Si la partie est en pause, désactiver le buzzer
          if (response.paused) {
            setIsDisabled(true);
          }
        }
        
        // Mettre à jour la présence de l'admin si l'information est disponible
        if (response.adminPresent !== undefined) {
          setAdminPresent(response.adminPresent);
          setShowAdminMissingDialog(!response.adminPresent);
        }

        // --- Initialisation Spotify à la connexion ---
        const receivedOptions = response.options || {};
        setRoomOptions(receivedOptions);
        //console.log("[ClientView] Options de salle reçues à l'init:", receivedOptions);

        let initialArtistFound = false;
        let initialTitleFound = false;
        if (receivedOptions?.spotifyEnabled && response.currentTrack) {
          //console.log("[ClientView] Piste actuelle reçue à l'init:", response.currentTrack);
          setSpotifyTrackInfo(response.currentTrack);
          initialArtistFound = response.artistFound || false;
          initialTitleFound = response.titleFound || false;
          setFoundArtist(initialArtistFound);
          setFoundTitle(initialTitleFound);
        } else {
          // S'il n'y a pas de piste actuelle, on réinitialise
          setSpotifyTrackInfo(null);
          setFoundArtist(false);
          setFoundTitle(false);
        }

        // Déterminer si la piste est déjà trouvée initialement
        const initialTrackFullyFound =
          (receivedOptions?.roomType === 'Standard' && (initialArtistFound || initialTitleFound)) ||
          (receivedOptions?.roomType === 'Titre/Artiste' && initialArtistFound && initialTitleFound);

        // Mettre à jour qui avait buzzé si l'info est là
        const firstBuzzData = response.firstBuzzPlayer || response.buzzedBy; // Utiliser la donnée la plus récente
        setBuzzedBy(firstBuzzData || '');
        setFirstBuzzer(firstBuzzData || null); // Garder une trace du premier buzzer

        // ✅ CORRECTION : Si un délai de changement de track est encore actif, l'appliquer EN PREMIER
        if (response.trackChangeDelayRemaining > 0) {
          //console.log(`[ClientView] 🔴 DÉLAI DÉTECTÉ: ${response.trackChangeDelayRemaining}ms restants`);
          // Désactiver le buzzer et lancer le countdown visuel
          resetLocalBuzzerState(false, response.trackChangeDelayRemaining);
          const secondsRemaining = Math.ceil(response.trackChangeDelayRemaining / 1000);
          onInfo(`Buzzer disponible dans ${secondsRemaining} seconde${secondsRemaining > 1 ? 's' : ''}...`);
        } else {
          //console.log("[ClientView] ✅ Pas de délai en cours, activation normale");
          // Ajuster isDisabled seulement si pas de délai en cours: désactiver si pause OU qqn a buzzé OU piste déjà trouvée
          setIsDisabled(response.paused || !!firstBuzzData || initialTrackFullyFound);
        }
        // --- Fin Initialisation Spotify ---
                 
        // --- Marquer comme "joined" SEULEMENT MAINTENANT (tout à la fin) ---
        setJoined(true); // Déclenche le rendu de la vue principale
        setActiveRoomCode(roomCode);
        setRoomError('');
        onSuccess(`Vous avez rejoint la salle ${roomCode}`);
        // -------------------------------------------------------------------
      }
    }).catch(err => {
      setRoomError("Erreur de connexion au serveur");
      onError('Impossible de se connecter au serveur');
    });
  });
  
  // Navigation et paramètres URL
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Récupération des paramètres depuis l'URL ou localStorage
  const paramRoomCode = searchParams.get('roomCode') || localStorage.getItem('roomCode') || '';
  const paramPseudo = searchParams.get('pseudo') || localStorage.getItem('pseudo') || '';
  
  // États pour la gestion de la salle
  const [roomCode, setRoomCode] = useState(paramRoomCode);
  const [pseudo, setPseudo] = useState(paramPseudo);
  const [joined, setJoined] = useState(false);
  const [players, setPlayers] = useState({});
  const [scoreChanged, setScoreChanged] = useState(false);
  const [scoreIncreased, setScoreIncreased] = useState(true); // true pour positif, false pour négatif
  const prevScore = useRef(0);
  const playersRef = useRef({});
  
  // États pour le buzzer et le jeu
  const [buzzedBy, setBuzzedBy] = useState('');
  const [gamePaused, setGamePaused] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  const [isBuzzing, setIsBuzzing] = useState(false); // ✅ ANTISPAM STATE
  const [adminPresent, setAdminPresent] = useState(true);
  const [trackChangeCountdown, setTrackChangeCountdown] = useState(null); // ✅ Décompte changement de piste (en secondes)
  
  // États pour les modales et erreurs
  const [showAdminMissingDialog, setShowAdminMissingDialog] = useState(false);
  const [showBuzzedDialog, setShowBuzzedDialog] = useState(false);
  const [showFinalRanking, setShowFinalRanking] = useState(false);
  const [finalPlayers, setFinalPlayers] = useState([]);
  const [roomClosed, setRoomClosed] = useState(false);
  const [roomError, setRoomError] = useState('');
  const [isRankingExpanded, setIsRankingExpanded] = useState(false); // État pour le classement
  
  // Références
  const roomClosedRef = useRef(false);
  const reconnectAttemptRef = useRef(false);
  const adminWasAbsentRef = useRef(false);
  const lastAdminDisconnectRef = useRef(false);
  const lastPauseEventRef = useRef(false);
  const lastSocketIdRef = useRef(null);
  const buzzerDelayActiveRef = useRef(false); // ✅ Track si un délai de buzzer est en cours
  
  // Socket
  const socket = getSocket();
  const isConnected = useSocketStatus();
  const socketError = useSocketError();

  // États Spotify
  const [spotifyTrackInfo, setSpotifyTrackInfo] = useState(null);
  const [foundArtist, setFoundArtist] = useState(false);
  const [foundTitle, setFoundTitle] = useState(false);
  const [roomOptions, setRoomOptions] = useState({ roomType: 'Standard', spotifyEnabled: false }); // Options de la salle
  const [firstBuzzer, setFirstBuzzer] = useState(null);

  // Ajouter un state pour la connexion réseau
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Fonction pour revenir à l'accueil
  const navigateToHome = () => {
    if (joined && roomCode && pseudo) {
      socket.emit('leave_room', { roomCode, pseudo });
    }
    
    setJoined(false);
    navigate('/', { replace: true });
  };

  // Fonction pour buzzer (CORRIGÉE avec support touch optimisé)
const handleBuzz = (e) => {
  // ✅ Sur mobile/tactile : empêcher le click émulé (évite double déclenchement)
  if (e && e.type === 'touchstart') {
    e.preventDefault();
  }

  // ✅ ANTISPAM : Bloquer si un buzz est déjà en cours
  if (isBuzzing) {
    console.log('🚫 Buzz ignoré: déjà en cours d\'envoi');
    return;
  }

  // 1. Calculer si la piste est trouvée AU MOMENT du clic
  const trackFullyFound =
    (roomOptions?.roomType === 'Standard' && (foundArtist || foundTitle)) ||
    (roomOptions?.roomType === 'Titre/Artiste' && foundArtist && foundTitle);

  // ---> CORRECTION : Vérifier SI LA PISTE EST TROUVÉE EN PREMIER <---
  if (trackFullyFound && !gamePaused) {
    onWarning('La piste a déjà été trouvée !');
    return; // Arrêter ici, ne pas envoyer de buzz
  }
  // ----------------------------------------------------------------

  // 2. Vérifier si le bouton est désactivé pour une AUTRE raison (pénalité, autre joueur a buzzé, jeu en pause)
  if (isDisabled || gamePaused) {
    // Si désactivé pour une autre raison, ne rien faire (le bouton est juste inactif)
    // Le cas trackFullyFound est déjà géré au-dessus.
    // Le cas gamePaused est aussi implicitement géré ici et dans l'attribut 'disabled' du bouton.
    return;
  }

  // 3. Si le bouton N'EST PAS désactivé ET que la piste N'EST PAS trouvée, envoyer le buzz
  if (socket && joined) { // gamePaused et isDisabled sont déjà vérifiés
    // ✅ ANTISPAM : Activer le flag de buzz en cours
    setIsBuzzing(true);
    console.log('📤 Envoi du buzz...');
    
    // Désactiver immédiatement pour éviter double-clic (pendant l'attente de la réponse serveur)
    setIsDisabled(true);

    buzz(roomCode, pseudo, (response) => {
      // ❌ NE PAS LIBÉRER isBuzzing ICI : Trop tôt, permet le spam pendant période de grâce
      // ✅ isBuzzing sera libéré seulement quand un événement 'buzzed' ou 'reset_buzzer' arrive
      
      if (response && response.error) {
        // En cas d'erreur, on peut libérer isBuzzing car le buzz n'a pas été accepté
        setIsBuzzing(false);
        
        // Gérer les erreurs de buzz (trop tard, etc.)
        if (response.lateAttempt) {
          if (response.buzzedBy) {
            setBuzzedBy(response.buzzedBy);
            setShowBuzzedDialog(true);
          }
        } else {
          onError(response.error);
          // Réactiver SEULEMENT si l'erreur n'est pas "late" ET que la piste n'est PAS trouvée
          // Recalculer trackFullyFound au cas où l'état aurait changé très vite
          const currentTrackFullyFound =
            (roomOptions?.roomType === 'Standard' && (foundArtist || foundTitle)) ||
            (roomOptions?.roomType === 'Titre/Artiste' && foundArtist && foundTitle);
          if (!currentTrackFullyFound) {
             setIsDisabled(false); // Réactiver si l'erreur n'empêche pas de rebuzzer plus tard
          }
        }
      }
      // ✅ Si le buzz réussit ({ received: true }), NE PAS libérer isBuzzing
      // Attendre l'événement 'buzzed' qui indiquera que le gagnant a été désigné
    });
  }
};

  // Fonction pour fermer la modale et retourner à l'accueil
  const handleCloseFinalRanking = () => {
    setShowFinalRanking(false);
    localStorage.removeItem('roomCode');
    navigate('/');
  };

  // Fonction pour réinitialiser l'état local du buzzer
  const resetLocalBuzzerState = (notify = false, delay = 0) => {
    setBuzzedBy('');
    setShowBuzzedDialog(false);
    
    // Si délai demandé, désactiver immédiatement puis réactiver après le délai
    if (delay > 0) {
      setIsDisabled(true);
      buzzerDelayActiveRef.current = true; // ✅ Activer le flag de délai
      
      // ✅ Initialiser le décompte pour changement de piste (en secondes)
      const delaySeconds = Math.ceil(delay / 1000);
      setTrackChangeCountdown(delaySeconds);
      
      // ✅ Mettre à jour le décompte chaque seconde
      const countdownInterval = setInterval(() => {
        setTrackChangeCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(countdownInterval);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      
      setTimeout(() => {
        buzzerDelayActiveRef.current = false; // ✅ Désactiver le flag
        setTrackChangeCountdown(null); // ✅ Reset le décompte
        clearInterval(countdownInterval); // ✅ Nettoyer l'interval
        // ✅ CORRECTION : Vérifier que le jeu n'est PAS en pause avant de réactiver
        checkAndActivateBuzzer(notify); // ✅ Effect Event = toujours les dernières valeurs
      }, delay);
    } else {
      // Activation immédiate (comportement original)
      setTrackChangeCountdown(null);
      checkAndActivateBuzzer(notify);
    }
  };

  // Scroll en haut de page au montage du composant
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []); // Se déclenche uniquement au montage

  // Configuration des écouteurs d'événements socket
  useEffect(() => {
    // ✅ Si pas de socket, l'initialiser UNE SEULE FOIS
    if (!socket) {
      initializeSocket();
      // Sortir et attendre le prochain rendu quand socket sera disponible
      return;
    }
    
    // ✅ Si socket non connectée, ne pas configurer les listeners
    // Ils seront configurés lors de la prochaine exécution du useEffect
    if (!socket.connected) {
      return;
    }
  
    // Fonctions utilitaires pour les actions communes
    const resetBuzzerState = (showNotification = true) => {
      setBuzzedBy('');
      setShowBuzzedDialog(false);
      setIsBuzzing(false); // ✅ Libérer isBuzzing : le buzzer est réinitialisé
      
      if (showNotification) {
        onInfo('Le buzzer est à nouveau disponible');
      }
    };
  
    const handleGamePauseState = (isPaused, message = null) => {
      setGamePaused(isPaused);
      
      if (isPaused) {
        setIsDisabled(true);
        if (message) onInfo(message);
      } else {
        if (!buzzedBy) {
          setIsDisabled(false);
        }
        if (message) onInfo(message);
      }
    };
  
    const onBuzzed = (data) => {
      if (!data || !data.buzzedBy) return;
      
      setBuzzedBy(data.buzzedBy);
      setShowBuzzedDialog(true);
      setIsDisabled(true);
      setIsBuzzing(false); // ✅ Libérer isBuzzing : un gagnant a été désigné
      
      if (data.buzzedBy !== pseudo) {
        onWarning(`${data.buzzedBy} a buzzé en premier`);
      }
    };
  
    const onBuzzerReset = () => {
      resetBuzzerState(false); // Ne pas afficher de notification
    };
  
    const onBuzzCleared = () => {
      resetBuzzerState();
      
      if (!gamePaused) {
        setIsDisabled(false);
      }
    };
  
    const onBuzzerDisabled = ({ duration }) => {
      setIsDisabled(true);
      resetBuzzerState(false);
      
      onError(`Le buzzer sera réactivé dans ${duration/1000} secondes`);
      
      setTimeout(() => {
        // AVANT de réactiver le buzzer, vérifier si d'autres conditions l'empêchent
        const trackFullyFound = 
          (roomOptions?.roomType === 'Standard' && (foundArtist || foundTitle)) ||
          (roomOptions?.roomType === 'Titre/Artiste' && foundArtist && foundTitle);
        
        // Ne réactiver que si la piste n'est pas trouvée et le jeu n'est pas en pause
        if (!trackFullyFound && !gamePaused) {
          setIsDisabled(false);
          onSuccess('Le buzzer est à nouveau disponible');
        } else {
          //console.log("Buzzer reste désactivé après pénalité car piste trouvée ou jeu en pause");
        }
      }, duration); // ✅ FIX: duration est déjà en millisecondes, pas besoin de * 1000
    };
  
    const onUpdatePlayers = (updatedPlayers) => {
      setPlayers(updatedPlayers);
      playersRef.current = updatedPlayers;

      // Vérifier si le score du joueur a changé
      const currentPlayer = Object.values(updatedPlayers).find(player => player.pseudo === pseudo);
      const currentScore = currentPlayer?.score || 0;
      
      if (prevScore.current !== currentScore) {
        setScoreIncreased(currentScore > prevScore.current);
        setScoreChanged(true);
        prevScore.current = currentScore;
      }
  
      const playerExists = Object.values(updatedPlayers).some(
        (player) => player.pseudo === pseudo && !player.disconnected
      );
  
      if (!playerExists && joined) {
        socket.emit('check_if_kicked', { roomCode, pseudo }, (response) => {
          if (response && response.kicked) {
            onError('Vous avez été expulsé de la salle par l\'administrateur.');
            navigateToHome();
          } else {
            connectToRoomAndUpdateState();
          }
        });
      }
    };
  
    const onRoomClosed = (data) => {
      roomClosedRef.current = true;
      
      let playersData = (data && data.players) ? data.players : playersRef.current;
      
      if (Object.keys(playersData).length > 0) {
        const rankedPlayers = Object.values(playersData)
          .filter(player => !player.isAdmin)
          .sort((a, b) => b.score - a.score);
        
        setFinalPlayers(rankedPlayers);
        setRoomClosed(true);
        
        setTimeout(() => {
          setShowFinalRanking(true);
        }, 50);
        
        onInfo('L\'administrateur a fermé la salle');
      } else {
        connectToRoomAndUpdateState();
      }
    };
  
    const onDisconnect = (reason) => {
      onWarning('Connexion au serveur perdue. Tentative de reconnexion...');
    };
  
    const onKicked = () => {
      localStorage.setItem('kicked_from_' + roomCode, 'true');
      
      localStorage.removeItem('roomCode');
      localStorage.removeItem('pseudo');
      setRoomCode('');
      setPseudo('');
      setJoined(false);
      setPlayers({});
  
      onError('Vous avez été expulsé de la salle par l\'administrateur.');
      
      navigateToHome();
    };

    const handleJudgeAnswer = (data) => {
      //console.log('[ClientView] Événement judge_answer REÇU:', JSON.stringify(data));
      const { trackInfo, artistFound: serverArtistFound, titleFound: serverTitleFound } = data;
      const currentRoomType = roomOptions?.roomType || 'Standard';
    
      // FORCER la réinitialisation du buzzer quel que soit le cas
      setBuzzedBy('');
      setShowBuzzedDialog(false);
    
      // CORRECTION : Gérer trackInfo seulement si Spotify est activé pour la salle
      if (roomOptions?.spotifyEnabled) {
        // Mettre à jour l'info piste si fournie ET si Spotify est activé
        if (trackInfo) {
          setSpotifyTrackInfo(trackInfo);
          //console.log('[ClientView] judge_answer - setSpotifyTrackInfo AVEC:', trackInfo);
        } else {
          console.warn('[ClientView] judge_answer - trackInfo MANQUANT pour une salle Spotify !');
        }
      } else {
        // Pour les salles sans Spotify, on s'assure que spotifyTrackInfo reste null
        setSpotifyTrackInfo(null);
        //console.log('[ClientView] judge_answer - Salle sans Spotify, trackInfo ignoré');
      }
    
      // Mettre à jour l'état trouvé EXACTEMENT comme reçu du serveur
      setFoundArtist(serverArtistFound);
      setFoundTitle(serverTitleFound);
       
      // Calculer si piste/question trouvée selon le serveur
      const trackFullyFoundServer = 
        (currentRoomType === 'Standard' && (serverArtistFound || serverTitleFound)) ||
        (currentRoomType === 'Titre/Artiste' && serverArtistFound && serverTitleFound);
      
      // Désactiver le buzzer si piste/question trouvée ou réactiver si nécessaire
      if (trackFullyFoundServer) {
        //console.log("Piste/question entièrement trouvée (selon serveur), désactivation du buzzer.");
        setIsDisabled(true);
      } else if (!gamePaused) {
        // Introduire un délai avant de réactiver le buzzer
        // ✅ IMPORTANT : Ne désactiver QUE si pas déjà désactivé (pour ne pas écraser une pénalité en cours)
        const wasAlreadyDisabled = isDisabled;
        if (!wasAlreadyDisabled) {
          setIsDisabled(true); // Garder désactivé pendant le délai
        }
        //console.log("Jugement reçu, application d'un délai avant réactivation du buzzer.");
        setTimeout(() => {
          // ✅ Ne réactiver QUE si on n'était pas déjà désactivé (= pas de pénalité)
          if (wasAlreadyDisabled) {
            //console.log("Buzzer reste désactivé (pénalité en cours pour ce joueur).");
            return;
          }
          
          // Re-vérifier les conditions au moment de la réactivation
          const currentTrackFullyFoundAfterDelay = 
            (roomOptions?.roomType === 'Standard' && (foundArtist || foundTitle)) ||
            (roomOptions?.roomType === 'Titre/Artiste' && foundArtist && foundTitle);
    
          if (!currentTrackFullyFoundAfterDelay && !gamePaused) {
            setIsDisabled(false);
            //console.log("Buzzer réactivé après délai post-jugement.");
            onInfo('Le buzzer est à nouveau disponible.');
          } else {
            //console.log("Buzzer reste désactivé après délai post-jugement (piste/question trouvée ou jeu en pause).");
          }
        }, 1000); // Délai de 1 seconde
      }
    };
    
    const handleSpotifyTrackChanged = (data) => {
      if (!roomOptions?.spotifyEnabled) {
        console.warn('[ClientView] spotify_track_changed reçu mais Spotify non activé pour cette salle');
        return;
      }
      const newTrack = data.newTrack || null; // Récupérer les infos de la nouvelle piste
    
      // Mettre à jour l'état Spotify : nouvelle piste et reset du statut trouvé
      setSpotifyTrackInfo(newTrack);
      setFoundArtist(false);
      setFoundTitle(false);

      // Reset le buzzer avec un délai de 3 secondes
      resetLocalBuzzerState(false, 3000);

      info("Nouvelle piste ! Buzzer disponible dans 3 secondes...");
    };

    const handleRoomOptionsUpdated = (options) => {
      //console.log("[ClientView] Événement room_options_updated REÇU:", JSON.stringify(options));
      setRoomOptions(options || { roomType: 'Standard', spotifyEnabled: false });
      // Potentiellement recalculer l'état du buzzer si le roomType change
      const trackFullyFound =
        (options?.roomType === 'Standard' && (foundArtist || foundTitle)) ||
        (options?.roomType === 'Titre/Artiste' && foundArtist && foundTitle);
      if (!gamePaused && !buzzedBy && !trackFullyFound) {
        setIsDisabled(false);
      } else {
        setIsDisabled(true);
      }
    };
    
    // Enregistrer tous les écouteurs d'événements
    on('room_paused', () => {
      // Mettre à jour l'état de pause sans condition
      setGamePaused(true);
      setIsDisabled(true);
      
      // N'afficher la notification que si ce n'est pas consécutif à une déconnexion admin
      const now = Date.now();
      if (now - lastAdminDisconnectRef.current > 500) {
        // Pas de notification si déconnexion admin récente
        onInfo('L\'administrateur a mis la partie en pause');
      }

    });
    
    on('room_resumed', () => {
      setGamePaused(false);
      // ✅ CORRECTION : Ne pas réactiver le buzzer si un délai de changement de piste est en cours
      if (!buzzedBy && !buzzerDelayActiveRef.current) {
        setIsDisabled(false);
      }
      // Si un délai est en cours, le buzzer restera désactivé jusqu'à la fin du timeout
      onInfo('La partie a repris');
    });
    
   
    // Simplifier en supprimant les notifications en doublon
    on('admin_disconnected', () => {
        // Enregistrer le timestamp AVANT de mettre à jour l'interface
        lastAdminDisconnectRef.current = Date.now();
        // Mettre à jour l'état d'interface
        setAdminPresent(false);
        setShowAdminMissingDialog(true);
          
        // Mettre en pause sans afficher une notification supplémentaire
        setGamePaused(true);
        setIsDisabled(true);
      
        // Une seule notification
        onWarning('L\'administrateur s\'est déconnecté. Partie en pause.');
    });
    
    on('admin_connected', () => {
      // Vérifier si l'état d'interface indique que l'admin était absent
      if (!adminPresent) {
        setAdminPresent(true);
        setShowAdminMissingDialog(false);
        
        // Une seule notification, uniquement si l'admin était réellement absent auparavant
        onSuccess('L\'administrateur est de retour');
      } 
    });
    
    // Remplacer le gestionnaire game_paused pour éviter les doublons
    on('game_paused', ({ paused }) => {
      // Toujours mettre à jour l'état
      setGamePaused(paused);
      
      if (paused) {
        setIsDisabled(true);
        
        // N'afficher la notification que si ce n'est pas lié à une déconnexion admin
        const now = Date.now();
        if (now - lastAdminDisconnectRef.current > 500) {
          onInfo('L\'administrateur a mis la partie en pause');
        }
      } else {
        // ✅ CORRECTION : Ne pas réactiver le buzzer si un délai de changement de piste est en cours
        if (!buzzedBy && !buzzerDelayActiveRef.current) {
          setIsDisabled(false);
        }
        // Si un délai est en cours, le buzzer restera désactivé jusqu'à la fin du timeout
        onInfo('La partie a repris');
      }
    });
    on('buzzed', onBuzzed);
    on('buzz_cleared', onBuzzCleared);
    on('reset_buzzer', onBuzzerReset);
    on('update_players', onUpdatePlayers);
    on('room_closed', onRoomClosed);
    on('disconnect', onDisconnect);
    on('kicked', onKicked);
    on('buzzer_disabled', onBuzzerDisabled);
    on('judge_answer', handleJudgeAnswer);
    on('spotify_track_changed', handleSpotifyTrackChanged);
    on('room_options_updated', handleRoomOptionsUpdated);

    // NOUVEAU : Réinitialisation pour question suivante
    on('next_question', () => {
      //console.log("[ClientView] Question suivante - réinitialisation");
      setFoundArtist(false);
      setFoundTitle(false);
      setBuzzedBy('');
      setFirstBuzzer(null);
      setIsDisabled(false); // Réactiver le buzzer
      if (roomOptions?.spotifyEnabled) {
        setSpotifyTrackInfo(null);
      }
    });
  
    // Nettoyage à la destruction du composant
    return () => {
      off('room_paused');
      off('room_resumed');
      off('admin_disconnected');
      off('admin_connected');
      off('buzzed');
      off('buzz_cleared');
      off('reset_buzzer');
      off('update_players');
      off('room_closed');
      off('disconnect');
      off('kicked');
      off('game_paused');
      off('buzzer_disabled');
      off('judge_answer');
      off('spotify_track_changed');
      off('room_options_updated');
      off('next_question');
    };
  }, [socket, roomCode, pseudo, setActiveRoomCode, navigate, joined, gamePaused, buzzedBy, roomOptions, firstBuzzer, foundArtist, foundTitle]);

  // Gestion de la reconnexion après mise en veille
  useEffect(() => {
  if (!socket || !joined || !roomCode || !pseudo) return;
  
  const handleSocketIdChange = () => {
    const currentSocketId = socket.id;
    
    // ✅ Détecter un changement d'ID socket
    if (currentSocketId && lastSocketIdRef.current && currentSocketId !== lastSocketIdRef.current) {
      console.log(`🔄 Changement d'ID socket détecté: ${lastSocketIdRef.current} → ${currentSocketId}`);
      
      // ✅ Forcer une reconnexion immédiate AVEC DÉLAI
      if (!reconnectAttemptRef.current) {
        reconnectAttemptRef.current = true;
        onInfo('Nouvelle connexion détectée, reconnexion à la salle...');
        
        // ✅ SOLUTION : Attendre que la socket soit complètement prête
        setTimeout(() => {
          // Vérifier que la socket est toujours connectée avant d'envoyer
          if (socket && socket.connected && socket.id === currentSocketId) {
            socket.emit('join_room', { roomCode, pseudo }, (response) => {
              reconnectAttemptRef.current = false;
              
              if (response && response.success) {
                onSuccess('Reconnexion automatique réussie');
                
                // ✅ Mettre à jour tous les états
                if (response.paused !== undefined) {
                  setGamePaused(response.paused);
                }
                if (response.players) {
                  setPlayers(response.players);
                }
                if (response.firstBuzzPlayer) {
                  setBuzzedBy(response.firstBuzzPlayer);
                  setShowBuzzedDialog(true);
                }
                
                // ✅ Mettre à jour les états Spotify si nécessaire
                if (response.artistFound !== undefined) {
                  setFoundArtist(response.artistFound);
                }
                if (response.titleFound !== undefined) {
                  setFoundTitle(response.titleFound);
                }
              } else {
                // ✅ SOLUTION RADICALE : Ignorer complètement les erreurs de reconnexion automatique
                console.log('Erreur de reconnexion automatique ignorée:', response?.error);
                // Ne plus afficher d'erreur du tout pour les reconnexions automatiques
              }
            });
          } else {
            // Socket pas prête, reset le flag
            reconnectAttemptRef.current = false;
            console.log('Socket pas prête pour la reconnexion, abandon');
          }
        }, 1000); // ✅ Délai de 1 seconde pour laisser la socket se stabiliser
      }
    }
    
    // ✅ Mettre à jour la référence
    lastSocketIdRef.current = currentSocketId;
  };
  
  // ✅ Initialiser la référence au premier rendu
  if (socket && socket.id && !lastSocketIdRef.current) {
    lastSocketIdRef.current = socket.id;
  }
  
  // ✅ Écouter les événements de connexion
  on('connect', handleSocketIdChange);
  
  // ✅ Vérifier périodiquement (au cas où l'événement serait manqué)
  const checkInterval = setInterval(() => {
    if (socket && socket.id) {
      handleSocketIdChange();
    }
  }, 2000);
  
  return () => {
    off('connect', handleSocketIdChange);
    clearInterval(checkInterval);
  };
}, [socket, joined, roomCode, pseudo]);

  // Gestion de l'événement global de reconnexion
  useEffect(() => {
  const handleGlobalReconnect = (event) => {
    const { downtime } = event.detail;
    
    if (downtime > 5) {
      onInfo(`Reconnexion après ${downtime.toFixed(1)} secondes`);
      
      // ✅ CORRECTION : Utiliser la même logique que les autres reconnexions
      if (socket && socket.connected && !reconnectAttemptRef.current) {
        reconnectAttemptRef.current = true;
        
        socket.emit('join_room', { 
          roomCode, 
          pseudo 
        }, (response) => {
          reconnectAttemptRef.current = false;
          
          if (response && response.success) {
            setGamePaused(response.paused);
            // Mettre à jour les autres états si nécessaire
            if (response.players) {
              setPlayers(response.players);
            }
          } else {
            onError(response?.error || 'Erreur lors de la reconnexion globale');
          }
        });
      }
    }
  };
    
    document.addEventListener('socket:reconnected', handleGlobalReconnect);
    
    return () => {
      document.removeEventListener('socket:reconnected', handleGlobalReconnect);
    };
  }, [socket, roomCode, pseudo]);

  // Gestion du buzzer pendant les déconnexions
  useEffect(() => {
    if (!isConnected && joined) {
      setIsDisabled(true);
    }
    
    // ✅ Ne pas réactiver le buzzer si un délai est en cours (changement de piste)
    if (isConnected && joined && !buzzerDelayActiveRef.current) {
      const currentPlayer = Object.values(players).find(player => player.pseudo === pseudo);
      if (currentPlayer && !currentPlayer.buzzed) {
        setIsDisabled(false);
      }
    }
  }, [isConnected, joined, players, pseudo]);

  // ✅ CORRECTION : Désactiver le buzzer quand la piste est pleinement trouvée
  // MAIS SEULEMENT si on n'est pas déjà dans un état de pénalité/délai
  useEffect(() => {
    if (!joined || !roomOptions?.spotifyEnabled) return;

    const trackFullyFound = 
      (roomOptions?.roomType === 'Standard' && (foundArtist || foundTitle)) ||
      (roomOptions?.roomType === 'Titre/Artiste' && foundArtist && foundTitle);

    if (trackFullyFound) {
      // Désactiver le buzzer SEULEMENT si on est actuellement actif
      // NE PAS interférer avec les pénalités en cours
      if (!isDisabled) {
        setIsDisabled(true);
      }
    }
    // NE PAS réactiver automatiquement ici - laisser les autres mécanismes le faire
  }, [foundArtist, foundTitle, roomOptions, joined, isDisabled]);

  // Tentative de connexion initiale
  useEffect(() => {
    if (!roomClosedRef.current && !joined && roomCode && pseudo && !reconnectAttemptRef.current) {
      reconnectAttemptRef.current = true;
      
      ensureSocketConnection()
        .then((currentSocket) => {
          reconnectAttemptRef.current = false;
          if (currentSocket && currentSocket.connected) {
            connectToRoomAndUpdateState();
          }
        })
        .catch(() => {
          reconnectAttemptRef.current = false;
          // Correction
          onError('Impossible d\'établir une connexion avec le serveur');
        })
        .finally(() => {
        reconnectAttemptRef.current = false; // ✅ Toujours reset le flag
        });
    }
  }, [roomCode, pseudo, joined]);

  // Ajouter ce bloc de code après vos autres useEffect

  // Effet simple pour le Wake Lock - empêche l'écran de s'éteindre
  useEffect(() => {
    let wakeLock = null;
    let wakeLockInterval = null;
    
    const enableWakeLock = async () => {
      // 1. Essayer l'API Wake Lock standard d'abord
      if ('wakeLock' in navigator) {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
          console.log('Wake Lock activé via API standard');
          
          // Gérer la libération automatique (onglet caché, etc.)
          wakeLock.addEventListener('release', () => {
            console.log('Wake Lock libéré automatiquement');
          });
          
          return true;
        } catch (err) {
          console.log('Wake Lock API échoué:', err.message);
          // Continuer vers le fallback
        }
      }
      
      // 2. Fallback pour Safari iOS - Méthode NoSleep améliorée
      return enableNoSleepFallback();
    };
    
    const enableNoSleepFallback = () => {
      // Créer une vidéo très courte et silencieuse - Version optimisée iOS 16+
      const video = document.createElement('video');
      video.style.cssText = 'position:fixed;top:-1px;left:-1px;width:1px;height:1px;opacity:0;pointer-events:none;';
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      
      // Attributs optimisés pour iOS récent
      video.setAttribute('webkit-playsinline', 'true');
      video.setAttribute('preload', 'metadata');
      video.setAttribute('autoplay', 'true');
      video.setAttribute('playsinline', '');
      video.setAttribute('controls', false);
      
      // WebM optimisé + ID pour éviter les doublons
      video.id = 'wake-lock-video';
      video.src = 'data:video/webm;base64,GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKCQAR3ZWJtQoeBAkKFgQIYU4BnQI0VSalmQCgq17FAAw9CQE2AQAZ3aGFtbXlXQ4BnQI4fVIEMAARCR0CDrAFCiAFCuAFCtwFCigFCjQFCnQFCmgFCnAFCfwFCrQFCuwFCvAFCpQFCiAFCnQFCvQFCuwFCfAFCsQFCwgFCsAFCrQFCugFCvwFCsAFCrAFCsAFCpQFCigFCpQFCbAFCtwFCsQFCsAFCvQFCvwFCuwFCsAFCrgFCrgFCsAFCqgFCsQFCqgFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCsAFCs=';
      
      document.body.appendChild(video);
    
      const keepAwake = () => {
        // Méthode 1: Redémarrer la vidéo (technique principale)
        video.currentTime = 0;
        video.play().catch(() => {
          //console.log('Fallback vidéo: tentative de rechargement');
        });
        
        // Méthode 2: Backup renforcé pour iOS 16+
        if (Math.random() < 0.25) { // Augmenter à 25% pour iOS récent
          // Technique A: CSS custom property avec timestamp
          const timestamp = Date.now();
          document.body.style.setProperty('--wake-lock-timestamp', timestamp.toString());
          
          // Technique B: Micro-animation CSS invisible renforcée
          const helper = document.createElement('div');
          helper.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;transform:translateZ(0);opacity:0.01;';
          document.body.appendChild(helper);
          
          // Force un reflow multiple pour iOS récent
          helper.offsetHeight;
          helper.offsetWidth;
          
          // Technique C: Manipulation CSS supplémentaire
          helper.style.transform = 'translateZ(0.01px)';
          helper.offsetHeight; // Second reflow
          
          setTimeout(() => {
            if (helper.parentNode) {
              document.body.removeChild(helper);
            }
          }, 150); // Légèrement plus long
        }
      };
      
      // Intervalle optimisé pour iOS récent (1.2 secondes)
      wakeLockInterval = setInterval(keepAwake, 1200);
      console.log('Wake Lock fallback activé (WebM + backup renforcé pour iOS 16+)');
      return true;
    };
   
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && joined) {
        // Réactiver le wake lock quand on revient sur la page
        if ('wakeLock' in navigator && (!wakeLock || wakeLock.released)) {
          try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock réactivé après retour sur la page');
          } catch (err) {
            console.log('Impossible de réactiver le Wake Lock:', err.message);
          }
        }
      }
    };
    
    // Activer le wake lock quand l'utilisateur rejoint
    if (joined) {
      enableWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    
    // Nettoyage
    return () => {
      if (wakeLock && !wakeLock.released) {
        wakeLock.release()
          .then(() => console.log('Wake Lock libéré'))
          .catch(e => console.log('Erreur libération Wake Lock:', e));
      }
      
      if (wakeLockInterval) {
        clearInterval(wakeLockInterval);
        console.log('Wake Lock fallback désactivé');
      }
      
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [joined]);

  // useEffect pour détecter les changements de connexion réseau
  useEffect(() => {
    const handleOnline = () => {
    setIsOnline(true);
    console.log('🟢 Connexion réseau rétablie');
  };
  
  const handleOffline = () => {
    setIsOnline(false);
    console.log('🔴 Connexion réseau perdue');
  };
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}, []);

  // Effet pour envoyer un ping périodique au serveur pour calcul de la latence buzzer
  useEffect(() => {
    if (!socket || !roomCode) return;
  
    // Fonction pour envoyer un ping
    const sendPing = () => {
      const timestamp = Date.now();
      socket.emit('ping', timestamp, (response) => {
        // Le ping est géré automatiquement côté serveur
        // Pas besoin de traitement particulier côté client
      });
    };
  
    // Ping initial
    sendPing();

    // Ping périodique toutes les 10 secondes
    const pingInterval = setInterval(sendPing, 10000);
  
    return () => {
      clearInterval(pingInterval);
    };
  }, [socket, roomCode]);

  // Effet pour bloquer/débloquer le scroll du body
  useEffect(() => {
    // Bloquer le scroll quand le composant est monté
    document.body.style.overflow = 'hidden';

    // Fonction de nettoyage pour réactiver le scroll quand le composant est démonté
    return () => {
      document.body.style.overflow = 'auto'; // Ou 'visible' ou '' selon le défaut souhaité
    };
  }, []); // Le tableau vide assure que l'effet s'exécute seulement au montage/démontage

  // Calculer le rang du joueur actuel (à placer avant le return)
  const sortedPlayers = useMemo(() => {
    return Object.values(players)
      .filter(player => !player.isAdmin)
      .sort((a, b) => b.score - a.score);
  }, [players]);

  const myRankIndex = sortedPlayers.findIndex(p => p.pseudo === pseudo);
  const myRank = myRankIndex !== -1 ? myRankIndex + 1 : null;
  const totalPlayers = sortedPlayers.length;

  // Rendu conditionnel si pas de code de salle ou pas de pseudo
  if (!roomCode || !pseudo) {
    return (
      <div className={`client-view ${isDarkMode ? 'dark-mode' : ''}`}>
        <div className="client-error-container">
          <div className="client-error-content">
            <ExclamationTriangleIcon className="error-icon" />
            <h2>Paramètres manquants</h2>
            <p>Veuillez rejoindre une salle via la page d'accueil.</p>
            <button 
              className="btn-primary" 
              onClick={() => navigate('/')}
            >
              Retour à l'accueil
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Rendu conditionnel en cas d'erreur de salle
  if (roomError) {
    return (
      <div className={`client-view ${isDarkMode ? 'dark-mode' : ''}`}>
        <Dialog.Root open={!!roomError} onOpenChange={() => setRoomError('')}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog-content error-dialog">
              <Dialog.Title className="dialog-title">
                <ExclamationTriangleIcon className="dialog-icon error-icon" />
                Erreur de connexion
              </Dialog.Title>
              <Dialog.Description className="dialog-description">
                {roomError}
              </Dialog.Description>
              <div className="dialog-footer">
                <Dialog.Close asChild>
                  <button 
                    className="btn-primary"
                    onClick={navigateToHome}
                  >
                    Retour à l'accueil
                  </button>
                </Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    );
  }

  // Rendu conditionnel si salle fermée et classement final à afficher
  if (roomClosed && showFinalRanking) {
    return (
      <div className={`client-view ${isDarkMode ? 'dark-mode' : ''}`}>
        <Dialog.Root open={showFinalRanking} onOpenChange={handleCloseFinalRanking}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog-content final-ranking-dialog">
              <Dialog.Title className="dialog-title">
                <div className="final-title-container">
                  <span className="trophy-icon">🎉</span>
                  <span>Merci d'avoir participé !</span>
                </div>
              </Dialog.Title>
              <div className="final-ranking-content">
                <p className="final-ranking-message">
                  La salle a été fermée par l'administrateur.
                </p>
                <p className="final-ranking-note">
                  Voici le classement final ! 🏆
                </p>
                <div className="final-ranking-table-container">
                  <table className="final-ranking-table">
                    <thead>
                      <tr>
                        <th>Position</th>
                        <th>Pseudo</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finalPlayers.map((player, index) => (
                        <tr 
                          key={index} 
                          className={`
                            ${player.pseudo === pseudo ? 'current-player' : ''} 
                            ${index === 0 ? 'top-1' : ''}
                            ${index === 1 ? 'top-2' : ''}
                            ${index === 2 ? 'top-3' : ''}
                          `}
                        >
                          <td className="position-cell">
                            {index === 0 ? '🥇' : 
                             index === 1 ? '🥈' : 
                             index === 2 ? '🥉' : 
                             <span className="position-rank-badge">{index + 1}</span>}
                          </td>
                          <td>{player.pseudo}</td>
                          <td className="score-cell">{player.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="social-links">
                  <a 
                    href={brand.instagram.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={isDarkMode ? "link-light" : "link-dark"}
                    style={{ display: 'inline-flex', alignItems: 'center' }}
                  >
                    Suivez {brand.name} sur Instagram
                    <img 
                      src="https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/instagram.png" 
                      alt="Instagram icon" 
                      style={{ height: '1em', width: 'auto', marginLeft: '0.3em', verticalAlign: 'middle' }} 
                    />
                  </a>
                </div>
              </div>
              <div className="dialog-footer">
                <Dialog.Close asChild>
                  <button 
                    className="btn-primary"
                    onClick={handleCloseFinalRanking}
                  >
                    Retourner à l'accueil
                  </button>
                </Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    );
  } 
  
  // Rendu conditionnel si en attente de connexion
  if (!joined) {
    return (
      <div className={`client-view ${isDarkMode ? 'dark-mode' : ''}`}>
        <div className="client-connecting-container">
          <div className="connecting-animation">
            <div className="spinner"></div>
          </div>
          <h2>Connexion en cours</h2>
          <div className="connecting-details">
            <p><span className="connecting-label">Salle :</span> {roomCode}</p>
            <p><span className="connecting-label">Pseudo :</span> {pseudo}</p>
          </div>
          {!isConnected && (
            <div className="connecting-status warning">
              <UpdateIcon className="status-icon" />
              <span>Reconnexion en cours...</span>
            </div>
          )}
          {socketError && (
            <div className="connecting-status error">
              <ExclamationTriangleIcon className="status-icon" />
              <span>{socketError}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Rendu principal - Vue client
  return (
    <div className={`client-view ${isDarkMode ? 'dark-mode' : ''}`}>
      {/* Alerte de dérive temporelle */}
      <TimeSyncWarning />
      
      {/* Ajouter un padding-bottom pour laisser de la place au footer fixe */}
      <div className="client-container" style={{ paddingBottom: '60px' /* Ajuster si besoin */ }}>
        <div className="header-zone">
          <div className="room-info">
            <div className="room-code">
              <h2>Salle: {roomCode}</h2>
              <Tooltip.Provider>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button 
                      className="btn-icon room-exit" 
                      onClick={navigateToHome}
                      aria-label="Quitter la salle"
                    >
                      <ExitIcon />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="tooltip-content" side="bottom">
                      Quitter la salle
                      <Tooltip.Arrow className="tooltip-arrow" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
            </div>
            <div className="player-info">
              <div className="player-pseudo">Pseudo: {pseudo}</div>
              <div className={`player-score ${scoreChanged ? (scoreIncreased ? 'score-changed' : 'score-changed negative') : ''}`}>
                Score: {Object.values(players).find(player => player.pseudo === pseudo)?.score || 0}
              </div>
              <div className={`connection-status ${isConnected && isOnline ? 'connected' : 'disconnected'}`}>
                <span className="status-indicator"></span>
                <span className="status-text">
                  {isConnected && isOnline ? 'Connecté' : 'Déconnecté'}
                </span>
              </div>
              {/* Indicateur de synchronisation temporelle */}
              <Tooltip.Provider>
                <Tooltip.Root>
                  <Tooltip.Portal>
                    <Tooltip.Content className="tooltip-content" side="bottom">
                      {isSynced ? (
                        <>
                          <div>Horloge synchronisée</div>
                          <div style={{ fontSize: '0.85em', opacity: 0.8 }}>
                            Offset: {(timeOffset / 1000).toFixed(3)}s
                            {syncQuality && ` | Latence: ${Math.round(syncQuality.rtt)}ms`}
                          </div>
                        </>
                      ) : (
                        'Synchronisation en cours...'
                      )}
                      <Tooltip.Arrow className="tooltip-arrow" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
            </div>
          </div>
        </div>

        <div className="buzz-zone">
          <div className="buzz-button-wrapper">
            {trackChangeCountdown !== null && !gamePaused && !isBuzzing && (
              <svg className="countdown-circle" viewBox="0 0 220 220">
                <circle
                  className="countdown-circle-bg"
                  cx="110"
                  cy="110"
                  r="105"
                />
                <circle
                  className="countdown-circle-progress"
                  cx="110"
                  cy="110"
                  r="105"
                />
              </svg>
            )}
            <button
              className={`buzz-button ${isDisabled ? 'disabled' : gamePaused ? 'paused' : isBuzzing ? 'buzzing' : trackChangeCountdown !== null ? 'countdown' : 'active'}`}
              onClick={handleBuzz}
              onTouchStart={handleBuzz}
              disabled={gamePaused || isDisabled || isBuzzing}
            >
              <div className="buzz-button-content">
                <LightningBoltIcon className="buzz-icon" />
                <span className="buzz-text">
                  {trackChangeCountdown !== null && !gamePaused && !isBuzzing ? trackChangeCountdown : 'BUZZ'}
                </span>
              </div>
              {gamePaused && (
                <div className="button-status paused-status">
                  Partie en pause
                </div>
              )}
              {isBuzzing && !gamePaused && (
                <div className="button-status buzzing-status">
                  Envoi en cours...
                </div>
              )}
              {(() => {
                // Calculer si la piste est trouvée pour afficher le bon message
                const trackFullyFound = 
                  (roomOptions?.roomType === 'Standard' && (foundArtist || foundTitle)) ||
                  (roomOptions?.roomType === 'Titre/Artiste' && foundArtist && foundTitle);
                
                if (isDisabled && !gamePaused && !isBuzzing && trackChangeCountdown === null) {
                  return (
                    <div className="button-status disabled-status">
                      {trackFullyFound ? 'Piste trouvée !' : 'Buzzer désactivé'}
                    </div>
                  );
                }
                return null;
              })()}
            </button>
          </div>
        </div>

        {/* Zone SpotifyDisplay */}
        {roomOptions.spotifyEnabled && ( // Afficher seulement si Spotify est activé pour la salle
          <div className="spotify-zone">
            <SpotifyDisplay
              isVisible={true} // Ou basé sur une autre logique si nécessaire
              trackInfo={spotifyTrackInfo} // Passer l'objet trackInfo ou null
              roomType={roomOptions?.roomType || "Standard"}
              foundArtist={foundArtist}
              foundTitle={foundTitle}
            />
          </div>
        )}

        {/* Footer Zone - Modifié pour être déroulant */}
        <div className={`footer-zone ${isRankingExpanded ? 'expanded' : ''}`}>
          {/* Header cliquable */}
          <div
            className="ranking-header"
            onClick={() => setIsRankingExpanded(!isRankingExpanded)} // Ajout du onClick
          >
            <div className="ranking-header-left">
              <h3>Classement</h3>
              {myRank && (
                <span className="current-rank-indicator">
                  Rang: {myRank} / {totalPlayers}
                </span>
              )}
            </div>
            <div className="ranking-header-right">
              <div className={`time-sync-status ${isSynced ? 'synced' : 'syncing'}`}>
                <span className="sync-text">
                  {isSynced ? '⏱️OK' : '⏱️Sync...'}
                </span>
              </div>
              <div className={`game-status ${gamePaused ? 'paused' : 'active'}`}>
                {gamePaused ? <span>Partie en pause</span> : <span>Partie active</span>}
              </div>
              {/* Indicateur flèche */}
              <span className="ranking-toggle-icon">
                {isRankingExpanded ? <ChevronDownIcon /> : <ChevronUpIcon />}
              </span>
            </div>
          </div>

          {/* Conteneur du tableau (affiché si expanded) */}
          <div className="ranking-table-container">
            <table className="ranking-table">
              <thead>
                <tr>
                  <th>Rang</th>
                  <th>Pseudo</th>
                  <th>Score</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((player, index) => ( // Utiliser sortedPlayers calculé plus haut
                  <tr
                    key={index}
                    className={`${player.pseudo === pseudo ? 'current-player' : ''} ${player.buzzed ? 'buzzed-player' : ''}`}
                  >
                    <td className="position-cell">
                      {index === 0 ? <span className="position-medal gold">1</span> :
                       index === 1 ? <span className="position-medal silver">2</span> :
                       index === 2 ? <span className="position-medal bronze">3</span> :
                       <span className="position-number">{index + 1}</span>}
                    </td>
                    <td className="pseudo-cell">{player.pseudo}</td>
                    <td className="score-cell">{player.score}</td>
                    <td className="status-cell">
                      {player.disconnected ?
                        <span className="player-status disconnected">
                          <ExclamationTriangleIcon />
                        </span> :
                        <span className="player-status connected">
                          <CheckIcon />
                        </span>
                      }
                    </td>
                  </tr>
                ))
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Dialog pour afficher qui a buzzé */}
      <Dialog.Root 
        open={showBuzzedDialog && !!buzzedBy} 
        onOpenChange={(open) => !open && setShowBuzzedDialog(false)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className={`dialog-content buzzed-dialog ${buzzedBy === pseudo ? 'self-buzzed' : 'other-buzzed'}`}>
            <Dialog.Title className="dialog-title">
              <BellIcon className="dialog-icon buzz-icon" />
              BUZZ!
            </Dialog.Title>
            <Dialog.Description className="dialog-description">
              {buzzedBy === pseudo ? (
                <span className="buzzed-message self">C'est à vous !</span>
              ) : (
                <span className="buzzed-message other">{buzzedBy} a buzzé en premier !</span>
              )}
            </Dialog.Description>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Dialog pour alerter que l'admin n'est pas présent */}
      <Dialog.Root 
        open={showAdminMissingDialog} 
        onOpenChange={setShowAdminMissingDialog}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content admin-missing-dialog">
            <Dialog.Title className="dialog-title">
              <ExclamationTriangleIcon className="dialog-icon warning-icon" />
              Administrateur déconnecté
            </Dialog.Title>
            <Dialog.Description className="dialog-description">
              L'administrateur s'est déconnecté. La partie est en pause jusqu'à son retour.
            </Dialog.Description>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export default ClientView;
