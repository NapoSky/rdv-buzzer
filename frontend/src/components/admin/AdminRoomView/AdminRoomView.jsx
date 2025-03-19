// src/components/admin/AdminRoomView/AdminRoomView.js
import React, { useState, useEffect, useRef, useContext, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ThemeContext } from '../../../contexts/ThemeContext';
import './AdminRoomView.css';
import { pausePlayback, resumePlayback, authenticateSpotify, disconnectSpotify } from '../../../services/api/spotifyService';
import { useSpotify } from '../../../hooks/useSpotify';
import { getSocket, createRoom, joinRoom, on, off, resetBuzzer, togglePause, kickPlayer, closeRoom } from '../../../services/socket/socketService';

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

const BONUS_POINTS = 10;

function AdminRoomView() {
  const { isDarkMode } = useContext(ThemeContext);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlRoomCode = searchParams.get('roomCode');
  const forceOwnership = searchParams.get('forceOwnership') === 'true';

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
      
      const response = await createRoom();
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
      const joinResponse = await joinRoom(roomCode, 'Admin', true, forceOwnership);
      if (joinResponse.error) {
        alert(joinResponse.error);
        setIsConnectedToRoom(false); // Réinitialiser en cas d'erreur
      } else {
        setPaused(joinResponse.paused);
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
      console.log('Buzz reçu par admin :', data);
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

    // Abonnement aux événements
    on('update_players', handleUpdatePlayers);
    on('game_paused', handleGamePaused);
    on('room_closed', handleRoomClosed);
    on('buzzed', handleBuzzed);
    on('connect', handleConnect);
    on('player_kicked', handlePlayerKicked);

    // Nettoyage des abonnements
    return () => {
      off('update_players', handleUpdatePlayers);
      off('game_paused', handleGamePaused);
      off('room_closed', handleRoomClosed);
      off('buzzed', handleBuzzed);
      off('connect', handleConnect);
      off('player_kicked', handlePlayerKicked);
    };
  }, [roomCode, refreshStatus]);

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
    
    // Acquérir le wake lock uniquement lorsque l'administrateur est connecté à une salle
    if (isConnectedToRoom && 'wakeLock' in navigator) {
      navigator.wakeLock.request('screen')
        .then(lock => {
          wakeLock = lock;
          console.log('Wake Lock activé - écran maintenu allumé pour l\'admin');
        })
        .catch(err => {
          console.log('Wake Lock non disponible:', err.message);
        });
    }
    
    // Libérer le wake lock quand l'administrateur quitte la salle
    return () => {
      if (wakeLock) {
        wakeLock.release()
          .then(() => console.log('Wake Lock libéré'))
          .catch(e => console.log('Erreur lors de la libération du Wake Lock'));
      }
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
    if (roomCode && scoreUpdates[playerId] !== undefined) {
      const newScore = Number(scoreUpdates[playerId]);
      const socket = getSocket();
      socket.emit('update_score', {
        roomCode,
        playerId,
        score: newScore
      });
    }
  };

  const handleIncrementScore = (playerId, increment) => {
    if (roomCode) {
      const currentScore = Number(players[playerId]?.score || 0);
      const newScore = currentScore + increment;
      const socket = getSocket();
      socket.emit('update_score', {
        roomCode,
        playerId,
        score: newScore
      });
    }
  };

  const handleJudgeResponse = async (isCorrect) => {
    if (buzzedPlayer && roomCode) {
      const currentScore = Number(players[buzzedPlayer.playerId]?.score || 0);
      let duration_lock = 0;
      let newScore = currentScore;
      
      if (isCorrect) {
        newScore += BONUS_POINTS;
        duration_lock = 1;
      } else {
        newScore -= 1;
        duration_lock = 3;
      }
      
      const socket = getSocket();

      // 1. Mettre à jour le score
      socket.emit('update_score', {
        roomCode,
        playerId: buzzedPlayer.playerId,
        score: newScore
      });

      // 2. Ensuite seulement, envoyer disable_buzzer
      socket.emit('disable_buzzer', { 
        roomCode, 
        playerId: buzzedPlayer.playerId, 
        duration: duration_lock
      });

      if (spotifyConnected) {
        try {
          await resumePlayback();
        } catch (error) {
          console.error('Erreur reprise Spotify:', error);
        }
      }

      // Réinitialiser le buzzer pour tous les clients
      socket.emit('reset_buzzer', { roomCode });
      setBuzzedPlayer(null);
    }
  };

  const handlePassBuzz = async () => {
    if (buzzedPlayer && roomCode) {
      const socket = getSocket();
      socket.emit('disable_buzzer', { 
        roomCode, 
        playerId: buzzedPlayer.playerId, 
        duration: 1
      });
      
      if (spotifyConnected) {
        try {
          await resumePlayback();
        } catch (error) {
          console.error('Erreur reprise Spotify:', error);
        }
      }
            
      resetBuzzer(roomCode);
      setBuzzedPlayer(null);
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
      const response = await closeRoom(roomCode);
      
      if (response && response.error) {
        console.error("Erreur lors de la fermeture de la salle:", response.error);
        alert(`Erreur: ${response.error}`);
        setShowCloseRoomModal(false);
      } else {
        console.log("Salle fermée avec succès");
        setCloseStatus({ roomClosed: true, dataSaved: true });
        setShowCloseRoomModal(false);
      }
    } catch (error) {
      console.error("Exception lors de la fermeture de la salle:", error);
      setCloseStatus({ roomClosed: false, dataSaved: false });
      setShowCloseRoomModal(false);
      setShowPostCloseModal(true);
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
                      <td>{player.disconnected ? '⚠️' : '✅'}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-success me-2"
                          onClick={() => handleIncrementScore(playerId, BONUS_POINTS)}
                        >
                          +
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleIncrementScore(playerId, -BONUS_POINTS)}
                        >
                          -
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
          onCorrectAnswer={() => handleJudgeResponse(true)}
          onWrongAnswer={() => handleJudgeResponse(false)}
          onPass={handlePassBuzz}
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
            handleConnectSpotify();
            setShowSpotifyModal(false);
          }}
          onDisconnect={() => {
            handleDisconnectSpotify();
            setShowSpotifyModal(false);
          }}
          onClose={() => setShowSpotifyModal(false)}
        />
      )}
    </div>
  );
}

export default AdminRoomView;

