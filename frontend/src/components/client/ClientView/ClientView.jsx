import React, { useState, useEffect, useContext, useRef } from 'react';
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
  const [adminPresent, setAdminPresent] = useState(true);
  
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

  // Fonction pour rejoindre la salle actuelle
  const joinCurrentRoom = () => {
    // Vérifier d'abord si l'utilisateur a été expulsé
    if (localStorage.getItem('kicked_from_' + roomCode) === 'true') {
      // Correction
      error('Vous avez été expulsé de cette salle par l\'administrateur.');
      navigateToHome();
      return;
    }
  
    joinRoom(roomCode, pseudo).then(response => {
      if (response && response.error) {
        setRoomError(response.error);
        // Correction
        error(response.error);
      } else if (response) {
        console.log("[ClientView] Entrée dans le bloc de succès joinRoom");
        // ---> AJOUTER CE LOG <---
        console.log("[ClientView] RAW response reçu par .then():", JSON.stringify(response));
        // ------------------------

        // --- Traiter TOUTE la réponse AVANT de marquer comme "joined" ---

        // Mettre à jour l'état de pause
        if (response.paused !== undefined) {
          setGamePaused(response.paused);
        }

        // Mettre à jour la présence de l'admin
        if (response.adminPresent !== undefined) {
          setAdminPresent(response.adminPresent);
          setShowAdminMissingDialog(!response.adminPresent);
        }

        // --- Initialisation Spotify à la connexion ---
        const receivedOptions = response.options || {};
        setRoomOptions(receivedOptions); // Met à jour l'état roomOptions
        console.log("[ClientView] Options de salle reçues à l'init (stringifié):", JSON.stringify(receivedOptions));

        let initialArtistFound = false;
        let initialTitleFound = false;
        if (response.currentTrack) {
          console.log("[ClientView] Piste actuelle reçue à l'init:", response.currentTrack);
          setSpotifyTrackInfo(response.currentTrack);
          initialArtistFound = response.artistFound || false;
          initialTitleFound = response.titleFound || false;
          setFoundArtist(initialArtistFound);
          setFoundTitle(initialTitleFound);
        } else {
          setSpotifyTrackInfo(null);
          setFoundArtist(false);
          setFoundTitle(false);
        }

        const initialTrackFullyFound =
          (receivedOptions?.roomType === 'Standard' && (initialArtistFound || initialTitleFound)) ||
          (receivedOptions?.roomType === 'Titre/Artiste' && initialArtistFound && initialTitleFound);

        const firstBuzzData = response.firstBuzzPlayer || response.buzzedBy;
        setBuzzedBy(firstBuzzData || '');
        setFirstBuzzer(firstBuzzData || null);

        // Ajuster isDisabled basé sur TOUTES les infos reçues
        const shouldBeDisabled = response.paused || !!firstBuzzData || initialTrackFullyFound;
        setIsDisabled(shouldBeDisabled);

        // --- Marquer comme "joined" SEULEMENT MAINTENANT ---
        setJoined(true); // Déclenche le rendu de la vue principale
        setActiveRoomCode(roomCode);
        // ----------------------------------------------------

        setRoomError('');
        success(`Vous avez rejoint la salle ${roomCode}`);
      }
    }).catch(err => {
      setRoomError("Erreur de connexion au serveur");
      // Correction
      error('Impossible de se connecter au serveur');
    });
  };

  // Fonction pour revenir à l'accueil
  const navigateToHome = () => {
    if (joined && roomCode && pseudo) {
      socket.emit('leave_room', { roomCode, pseudo });
    }
    
    setJoined(false);
    navigate('/', { replace: true });
  };

  // Fonction pour buzzer (CORRIGÉE)
const handleBuzz = () => {
  // 1. Calculer si la piste est trouvée AU MOMENT du clic
  const trackFullyFound =
    (roomOptions?.roomType === 'Standard' && (foundArtist || foundTitle)) ||
    (roomOptions?.roomType === 'Titre/Artiste' && foundArtist && foundTitle);

  // ---> CORRECTION : Vérifier SI LA PISTE EST TROUVÉE EN PREMIER <---
  if (trackFullyFound && !gamePaused) {
    warning('La piste a déjà été trouvée !');
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
    // Désactiver immédiatement pour éviter double-clic (pendant l'attente de la réponse serveur)
    setIsDisabled(true);

    buzz(roomCode, pseudo, (response) => {
      if (response && response.error) {
        // Gérer les erreurs de buzz (trop tard, etc.)
        if (response.lateAttempt) {
          if (response.buzzedBy) {
            setBuzzedBy(response.buzzedBy);
            setShowBuzzedDialog(true);
          }
        } else {
          error(response.error);
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
      // Si le buzz réussit, l'événement 'buzzed' mettra à jour l'état isDisabled correctement
      // Si le buzz échoue car piste trouvée (vérification serveur), le serveur ne fera rien,
      // mais l'état local isDisabled devrait déjà être true à cause de handleJudgeAnswer.
      // On ne réactive PAS le bouton ici si le buzz réussit, on attend les événements serveur.
    });
  }
};

  // Fonction pour fermer la modale et retourner à l'accueil
  const handleCloseFinalRanking = () => {
    setShowFinalRanking(false);
    localStorage.removeItem('roomCode');
    navigate('/');
  };

  // Fonction pour réinitialiser l'affichage Spotify
  const resetSpotifyDisplay = () => {
    setSpotifyTrackInfo(null);
    setFoundArtist(false);
    setFoundTitle(false);
  };

  // Fonction pour réinitialiser l'état local du buzzer
  const resetLocalBuzzerState = (notify = false) => {
    setBuzzedBy('');
    setShowBuzzedDialog(false);
    
    // Activer le buzzer seulement si le jeu n'est pas en pause ET piste non trouvée
    const trackFullyFound = 
      (roomOptions?.roomType === 'Standard' && (foundArtist || foundTitle)) ||
      (roomOptions?.roomType === 'Titre/Artiste' && foundArtist && foundTitle);
    
    if (!gamePaused && !trackFullyFound) {
      setIsDisabled(false);
    }
    
    if (notify) info('Le buzzer est à nouveau disponible');
  };

  // Configuration des écouteurs d'événements socket
  useEffect(() => {
    if (!socket) {
      initializeSocket();
      return;
    }
    
    // Fonction de connexion à la salle qui prend également en compte l'état de la partie
    const connectToRoomAndUpdateState = () => {
      if (!roomCode || !pseudo || roomClosedRef.current) return;
  
      // Vérifier d'abord si l'utilisateur a été expulsé
      if (localStorage.getItem('kicked_from_' + roomCode) === 'true') {
        error('Vous avez été expulsé de cette salle par l\'administrateur.');
        navigateToHome();
        return;
      }
    
      joinRoom(roomCode, pseudo).then(response => {
        if (response && response.error) {
          setRoomError(response.error);
          error(response.error);
        } else if (response) {
          setJoined(true);
          setActiveRoomCode(roomCode);
  
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
          console.log("[ClientView] Options de salle reçues à l'init:", receivedOptions);

          let initialArtistFound = false;
          let initialTitleFound = false;
          if (response.currentTrack) {
            console.log("[ClientView] Piste actuelle reçue à l'init:", response.currentTrack);
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

          // Ajuster isDisabled: désactiver si pause OU qqn a buzzé OU piste déjà trouvée
          setIsDisabled(response.paused || !!firstBuzzData || initialTrackFullyFound);
          // --- Fin Initialisation Spotify ---
          
          setRoomError('');
          success(`Vous avez rejoint la salle ${roomCode}`);
        }
      }).catch(err => {
        setRoomError("Erreur de connexion au serveur");
        error('Impossible de se connecter au serveur');
      });
    };
    
    // Remplace l'appel à joinCurrentRoom() pour utiliser notre nouvelle fonction
    if (!joined && roomCode && pseudo && !roomClosedRef.current && socket.connected) {
      connectToRoomAndUpdateState();
    }
  
    // Fonctions utilitaires pour les actions communes
    const resetBuzzerState = (showNotification = true) => {
      setBuzzedBy('');
      setShowBuzzedDialog(false);
      
      if (showNotification) {
        info('Le buzzer est à nouveau disponible');
      }
    };
  
    const handleGamePauseState = (isPaused, message = null) => {
      setGamePaused(isPaused);
      
      if (isPaused) {
        setIsDisabled(true);
        if (message) info(message);
      } else {
        if (!buzzedBy) {
          setIsDisabled(false);
        }
        if (message) info(message);
      }
    };
  
    const handleAdminPresenceChange = (isPresent, customMessage = null) => {
      setAdminPresent(isPresent);
      setShowAdminMissingDialog(!isPresent);
      
      if (isPresent) {
          if (customMessage) success(customMessage);
      } else {
        handleGamePauseState(true);
        if (customMessage) warning(customMessage);
      }
    };
  
    const onBuzzed = (data) => {
      if (!data || !data.buzzedBy) return;
      
      setBuzzedBy(data.buzzedBy);
      setShowBuzzedDialog(true);
      setIsDisabled(true);
      
      if (data.buzzedBy !== pseudo) {
        warning(`${data.buzzedBy} a buzzé en premier`);
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
      
      error(`Le buzzer sera réactivé dans ${duration/1000} secondes`);
      
      setTimeout(() => {
        // AVANT de réactiver le buzzer, vérifier si d'autres conditions l'empêchent
        const trackFullyFound = 
          (roomOptions?.roomType === 'Standard' && (foundArtist || foundTitle)) ||
          (roomOptions?.roomType === 'Titre/Artiste' && foundArtist && foundTitle);
        
        // Ne réactiver que si la piste n'est pas trouvée et le jeu n'est pas en pause
        if (!trackFullyFound && !gamePaused) {
          setIsDisabled(false);
          success('Le buzzer est à nouveau disponible');
        } else {
          console.log("Buzzer reste désactivé après pénalité car piste trouvée ou jeu en pause");
        }
      }, duration * 1000);
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
            error('Vous avez été expulsé de la salle par l\'administrateur.');
            navigateToHome();
          } else {
            joinCurrentRoom();
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
        
        info('L\'administrateur a fermé la salle');
      } else {
        joinCurrentRoom();
      }
    };
  
    const onDisconnect = (reason) => {
      warning('Connexion au serveur perdue. Tentative de reconnexion...');
    };
  
    const onKicked = () => {
      localStorage.setItem('kicked_from_' + roomCode, 'true');
      
      localStorage.removeItem('roomCode');
      localStorage.removeItem('pseudo');
      setRoomCode('');
      setPseudo('');
      setJoined(false);
      setPlayers({});
  
      error('Vous avez été expulsé de la salle par l\'administrateur.');
      
      navigateToHome();
    };

    const handleJudgeAnswer = (data) => {
      // ---> AJOUTER CE LOG <---
      console.log('[ClientView] Événement judge_answer REÇU:', JSON.stringify(data));
      // ------------------------
      const { trackInfo, artistFound: serverArtistFound, titleFound: serverTitleFound } = data;
      const currentRoomType = roomOptions?.roomType || 'Standard';
    
      // FORCER la réinitialisation du buzzer quel que soit le cas
      setBuzzedBy('');
      setShowBuzzedDialog(false);
    
      // Mettre à jour l'info piste si fournie (important !)
      if (trackInfo) {
        setSpotifyTrackInfo(trackInfo);
         // ---> AJOUTER CE LOG <---
         console.log('[ClientView] judge_answer - setSpotifyTrackInfo AVEC:', trackInfo);
         // ------------------------
      } else {
         // ---> AJOUTER CE LOG <---
         console.warn('[ClientView] judge_answer - trackInfo MANQUANT dans les données reçues !');
         // ------------------------
      }
    
      // Mettre à jour l'état trouvé EXACTEMENT comme reçu du serveur
      setFoundArtist(serverArtistFound);
      setFoundTitle(serverTitleFound);
       
      // Calculer si piste trouvée selon le serveur
      const trackFullyFoundServer = 
        (currentRoomType === 'Standard' && (serverArtistFound || serverTitleFound)) ||
        (currentRoomType === 'Titre/Artiste' && serverArtistFound && serverTitleFound);
      
      // Désactiver le buzzer si piste trouvée ou réactiver si nécessaire
      if (trackFullyFoundServer) {
        console.log("Piste entièrement trouvée (selon serveur), désactivation du buzzer.");
        setIsDisabled(true);
      } else if (!gamePaused) {
        // Si le jeu n'est pas en pause et la piste n'est pas trouvée, réactiver le buzzer
        setIsDisabled(false);
        console.log("Réactivation du buzzer après jugement.");
      }
    };
    
    const handleSpotifyTrackChanged = (data) => {
      const newTrack = data.newTrack || null; // Récupérer les infos de la nouvelle piste
    
      // Mettre à jour l'état Spotify : nouvelle piste et reset du statut trouvé
      setSpotifyTrackInfo(newTrack);
      setFoundArtist(false);
      setFoundTitle(false);
    
      // Note: resetSpotifyDisplay() ici est redondant si on set les états juste au-dessus
      // resetSpotifyDisplay(); // Peut être supprimé
    
      resetLocalBuzzerState(false);
    
      if (!gamePaused) {
        setIsDisabled(false);
      }
      info("Nouvelle piste !");
    };

    const handleRoomOptionsUpdated = (options) => {
      console.log("[ClientView] Événement room_options_updated REÇU:", JSON.stringify(options));
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
        info('L\'administrateur a mis la partie en pause');
      }

    });
    
    on('room_resumed', () => {
      setGamePaused(false);
      if (!buzzedBy) {
        setIsDisabled(false);
      }
      info('La partie a repris');
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
        warning('L\'administrateur s\'est déconnecté. Partie en pause.');
    });
    
    on('admin_connected', () => {
      // Vérifier si l'état d'interface indique que l'admin était absent
      if (!adminPresent) {
        setAdminPresent(true);
        setShowAdminMissingDialog(false);
        
        // Une seule notification, uniquement si l'admin était réellement absent auparavant
        success('L\'administrateur est de retour');
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
          info('L\'administrateur a mis la partie en pause');
        }
      } else {
        if (!buzzedBy) {
          setIsDisabled(false);
        }
        info('La partie a repris');
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
    };
  }, [socket, roomCode, pseudo, setActiveRoomCode, navigate, joined, gamePaused, buzzedBy, roomOptions, firstBuzzer, foundArtist, foundTitle, resetSpotifyDisplay, resetLocalBuzzerState]);

  // Gestion de la reconnexion après mise en veille
  useEffect(() => {
    if (!socket || !joined || !roomCode || !pseudo) return;
    
    const handleReconnect = () => {
      // Correction
      info('Tentative de reconnexion à la salle...');
      
      socket.emit('join_room', { roomCode, pseudo }, (response) => {
        if (response.success) {
          // Correction
          success('Vous êtes à nouveau connecté à la salle');
        } else {
          // Correction
          error(response.error || 'Erreur lors de la reconnexion');
        }
      });
    };

    on('reconnect', handleReconnect);
    
    return () => {
      off('reconnect', handleReconnect);
    };
  }, [socket, joined, roomCode, pseudo]);

  // Gestion de l'événement global de reconnexion
  useEffect(() => {
    const handleGlobalReconnect = (event) => {
      const { downtime } = event.detail;
      
      if (downtime > 5) {
        // Correction
        info(`Reconnexion après ${downtime.toFixed(1)} secondes`);
        
        if (socket && socket.connected) {
          socket.emit('join_room', { roomCode, pseudo }, (response) => {
            if (response && response.success) {
              setGamePaused(response.paused);
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
    
    if (isConnected && joined) {
      const currentPlayer = Object.values(players).find(player => player.pseudo === pseudo);
      if (currentPlayer && !currentPlayer.buzzed) {
        setIsDisabled(false);
      }
    }
  }, [isConnected, joined, players, pseudo]);

  // Tentative de connexion initiale
  useEffect(() => {
    if (!roomClosedRef.current && !joined && roomCode && pseudo && !reconnectAttemptRef.current) {
      reconnectAttemptRef.current = true;
      
      ensureSocketConnection()
        .then((currentSocket) => {
          reconnectAttemptRef.current = false;
          if (currentSocket && currentSocket.connected) {
            joinCurrentRoom();
          }
        })
        .catch(() => {
          reconnectAttemptRef.current = false;
          // Correction
          error('Impossible d\'établir une connexion avec le serveur');
        });
    }
  }, [roomCode, pseudo, joined]);

  // Ajouter ce bloc de code après vos autres useEffect

  // Effet simple pour le Wake Lock - empêche l'écran de s'éteindre
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
          console.log('Wake Lock activé via API standard - écran maintenu allumé');
          
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
          videoElement.setAttribute('src', 'data:video/mp4;base64,AAAAIGZ0eXBtcDQyAAAAAG1wNDJtcDQxaXNvbWF2YzEAAATKbW9vdgAAAGxtdmhkAAAAANLEP5XSxD+VAAB1MAAAdU4AAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAACFpb2RzAAAAABCAgIAHAE/////+/wAAAiF0cmFrAAAAXHRraGQAAAAP0sQ/ldLEP5UAAAABAAAAAAAAAHUyAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAALAAAACQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAHUyAAAAAAABAAAAAAKobWRpYQAAACBtZGhkAAAAANLEP5XSxD+VAAB1MAAAdU5VxAAAAAAANmhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABMLVNNQVNIIFZpZGVvIEhhbmRsZXIAAAACC21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAcNzdGJsAAAAwXN0c2QAAAAAAAAAAQAAALFhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAALAAkABIAAAASAAAAAAAAAABCkFWQyBDb2RpbmcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//AAAAOGF2Y0MBZAAf/+EAHGdkAB+s2UCgC/oAAAMADwABAAZAGBerEQAAABhzdHRzAAAAAAAAAAEAAAAeAAAB4AAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAABAAAAAQAAAIxzdHN6AAAAAAAAAAAAAAAeAAADygAAAE8AAABPAAAATwAAAE8AAABOAAAATwAAAE8AAABPAAAATwAAAE8AAABPAAAATwAAAE8AAABPAAAA4HN0Y28AAAAAAAAAAQAAADAAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjU2LjQwLjEwMQ==');
          videoElement.setAttribute('loop', '');
          videoElement.style.width = '1px';
          videoElement.style.height = '1px';
          videoElement.style.position = 'absolute';
          videoElement.style.opacity = '0';
          videoElement.style.pointerEvents = 'none';
          document.body.appendChild(videoElement);
          
          videoElement.muted = true;
          return videoElement.play().then(() => {
            console.log('Wake Lock activé via vidéo en arrière-plan - écran maintenu allumé');
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
      if (document.visibilityState === 'visible' && joined) {
        // Réactiver le wake lock quand l'utilisateur revient sur la page
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
    
    // Activer le wake lock uniquement quand l'utilisateur a rejoint la salle
    if (joined) {
      enableWakeLock();
      // Ajouter un gestionnaire d'événements pour réactiver le wake lock
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    
    // Fonction de nettoyage
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
  }, [joined]);

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
  const sortedPlayers = Object.values(players)
    .filter(player => !player.isAdmin)
    .sort((a, b) => b.score - a.score);

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
                    href="https://www.instagram.com/lerdvlille" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className={isDarkMode ? "link-light" : "link-dark"}
                    style={{ display: 'inline-flex', alignItems: 'center' }}
                  >
                    Suivez le RDV sur Instagram
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
              <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
                <span className="status-indicator"></span>
                <span className="status-text">{isConnected ? 'Connecté' : 'Déconnecté'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="buzz-zone">
          <button
            className={`buzz-button ${isDisabled ? 'disabled' : gamePaused ? 'paused' : 'active'}`}
            onClick={handleBuzz}
            disabled={gamePaused || isDisabled}
          >
            <div className="buzz-button-content">
              <LightningBoltIcon className="buzz-icon" />
              <span className="buzz-text">BUZZ</span>
            </div>
            {gamePaused && (
              <div className="button-status paused-status">
                Partie en pause
              </div>
            )}
            {isDisabled && !gamePaused && (
              <div className="button-status disabled-status">
                Buzzer désactivé
              </div>
            )}
          </button>
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
