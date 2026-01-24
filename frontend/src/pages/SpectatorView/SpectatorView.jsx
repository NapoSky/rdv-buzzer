import React, { useState, useEffect, useContext, useEffectEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SocketContext } from '../../contexts/SocketContext';
import { ThemeContext } from '../../contexts/ThemeContext';
import SpotifyDisplay from '../../components/client/SpotifyDisplay/SpotifyDisplay';
import { EyeOpenIcon } from '@radix-ui/react-icons';
import { QRCodeSVG } from 'qrcode.react';
import { brand, brandAssets, getWifiQRString } from '../../config/brand';
import wifiIcon from '../../assets/icons/wifi-icon.svg';
import './SpectatorView.css';

function SpectatorView() {
  const { roomCode } = useParams();
  const socketContext = useContext(SocketContext);
  const { isDarkMode } = useContext(ThemeContext);
  const [roomData, setRoomData] = useState(null);
  const [players, setPlayers] = useState({});
  const [buzzedBy, setBuzzedBy] = useState('');
  const [spotifyTrackInfo, setSpotifyTrackInfo] = useState(null);
  const [foundArtist, setFoundArtist] = useState(false);
  const [foundTitle, setFoundTitle] = useState(false);
  const [roomOptions, setRoomOptions] = useState(null);
  const [gameStatus, setGameStatus] = useState('waiting');
  const [scoreChanges, setScoreChanges] = useState({}); // Pour tracker les changements de score
  const [previousScores, setPreviousScores] = useState({}); // Pour comparer avec les scores précédents
  const [isRoomCodeHidden, setIsRoomCodeHidden] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [roomError, setRoomError] = useState(''); // AJOUT DU STATE POUR GÉRER LES ERREURS DE SALLE
  const [trackChangeCountdown, setTrackChangeCountdown] = useState(null); // ✅ Décompte changement de piste (spectateur)
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false); // État pour le toggle du HeaderMenu
  const navigate = useNavigate();

  // Vérifier que le contexte socket existe
  if (!socketContext) {
    return (
      <div className={`spectator-view ${isDarkMode ? 'dark-mode' : ''}`}>
        <div className="spectator-error-container">
          <div className="spectator-error-content">
            <EyeOpenIcon className="error-icon" />
            <h2>Connexion non disponible</h2>
            <p>Impossible de se connecter au serveur</p>
          </div>
        </div>
      </div>
    );
  }

  const { socket } = socketContext;

  // ===== EFFECT EVENTS - Handlers stables qui lisent toujours les dernières valeurs =====
  
  const handleSpectatorRoomData = useEffectEvent((data) => {
    //console.log('Spectator room data (événement):', data);
    
    // Vérifier s'il y a une erreur dans la réponse
    if (data && data.error) {
      setRoomError(data.error);
      return;
    }
    
    // TRAITER LES DONNÉES ICI (au lieu d'attendre le callback)
    if (data) {
      setRoomData(data);
      
      // Initialiser les scores précédents
      const initialScores = {};
      Object.keys(data.players || {}).forEach(playerId => {
        const player = data.players[playerId];
        if (!player.isAdmin) {
          initialScores[player.pseudo] = player.score;
        }
      });
      setPreviousScores(initialScores);
      
      // Traiter les joueurs avec leurs statuts de connexion
      const playersWithConnection = {};
      Object.keys(data.players || {}).forEach(playerId => {
        playersWithConnection[playerId] = {
          ...data.players[playerId],
          connected: data.players[playerId].connected !== false
        };
      });
      
      setPlayers(playersWithConnection);
      setRoomOptions(data.options);
      setSpotifyTrackInfo(data.currentTrack);
      setFoundArtist(data.artistFound || false);
      setFoundTitle(data.titleFound || false);
      setBuzzedBy(data.buzzedBy || '');
      setGameStatus(data.paused ? 'paused' : 'playing');
      
      // Réinitialiser l'erreur si tout va bien
      setRoomError('');
    }
  });

  const handleUpdatePlayers = useEffectEvent((newPlayers) => {
    //console.log('🔄 Update players:', newPlayers);
    
    // Convertir disconnected en connected pour cohérence
    const playersWithConnectionStatus = {};
    Object.keys(newPlayers || {}).forEach(playerId => {
      const player = newPlayers[playerId];
      playersWithConnectionStatus[playerId] = {
        ...player,
        connected: !player.disconnected
      };
    });
    
    // Mise à jour des joueurs AVANT de traiter les scores
    setPlayers(playersWithConnectionStatus);
    
    // Traiter les changements de score avec les scores précédents
    setPreviousScores(prevScores => {
      const currentScores = {};
      let hasScoreChanges = false;
      
      Object.keys(newPlayers || {}).forEach(playerId => {
        const player = newPlayers[playerId];
        if (!player.isAdmin) {
          currentScores[player.pseudo] = player.score;
          
          // Comparer avec le score précédent
          const previousScore = prevScores[player.pseudo];
          if (previousScore !== undefined) {
            const scoreDiff = player.score - previousScore;
            
            if (scoreDiff !== 0) {
              hasScoreChanges = true;
              
              // Traiter les changements de score
              setScoreChanges(prevChanges => {
                const existingChange = prevChanges[player.pseudo];
                let finalChange = scoreDiff;
                let animationType = scoreDiff > 0 ? 'positive' : 'negative';
                
                // Si une animation est déjà en cours, additionner les changements
                if (existingChange) {
                  const timeSinceStart = Date.now() - existingChange.timestamp;
                  // Si l'animation précédente a moins de 3 secondes, on cumule
                  if (timeSinceStart < 3000) {
                    finalChange = existingChange.cumulativeChange + scoreDiff;
                    animationType = finalChange > 0 ? 'positive' : 'negative';
                    //console.log(`📊 Cumulating score change for ${player.pseudo}: ${existingChange.cumulativeChange} + ${scoreDiff} = ${finalChange}`);
                  }
                }
                
                const updatedChanges = {
                  ...prevChanges,
                  [player.pseudo]: {
                    change: finalChange,
                    cumulativeChange: finalChange,
                    type: animationType,
                    timestamp: Date.now(),
                    isUpdated: !!existingChange
                  }
                };
                
                //console.log(`📊 ${existingChange ? 'Updated' : 'New'} score change for ${player.pseudo}: ${finalChange > 0 ? '+' : ''}${finalChange}`);
                
                return updatedChanges;
              });
            }
          }
        }
      });
      
      // Retourner les nouveaux scores seulement s'il y a eu des changements
      return currentScores;
    });
  });

  const handleBuzzed = useEffectEvent((data) => {
    //console.log('🔴 Buzz reçu:', data);
    const buzzedPlayer = data.buzzedBy || '';
    setBuzzedBy(buzzedPlayer);
  });

  const handleBuzzCleared = useEffectEvent(() => {
    //console.log('🔄 Buzz cleared');
    setBuzzedBy('');
  });

  const handleSpotifyTrackChanged = useEffectEvent((data) => {
    //console.log('🎵 Spotify track changed:', data);
    // Les données peuvent venir dans différents formats
    const newTrack = data.trackInfo || data.track || data.newTrack || null;
    setSpotifyTrackInfo(newTrack);
    setFoundArtist(false);
    setFoundTitle(false);
    // Clear le buzz car nouvelle piste
    setBuzzedBy('');

    // ✅ Lancer le décompte de 3 secondes pour les spectateurs
    setTrackChangeCountdown(3);
    
    // ✅ Décrémenter chaque seconde
    const countdownInterval = setInterval(() => {
      setTrackChangeCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownInterval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    
    // ✅ Nettoyer après 5 secondes
    setTimeout(() => {
      setTrackChangeCountdown(null);
      clearInterval(countdownInterval);
    }, 3000);
  });

  const handleJudgeAnswer = useEffectEvent((data) => {
    //console.log('⚖️ Judge answer:', data);
    setFoundArtist(data.artistFound || false);
    setFoundTitle(data.titleFound || false);
    // Clear le buzz après jugement
    setBuzzedBy('');
  });

  const handleGamePaused = useEffectEvent((data) => {
    //console.log('⏸️ Game paused:', data);
    setGameStatus(data.paused ? 'paused' : 'playing');
  });

  const handleRoomOptionsUpdated = useEffectEvent((options) => {
    //console.log('⚙️ Room options updated:', options);
    setRoomOptions(options);
  });

  const handlePlayerDisconnected = useEffectEvent((data) => {
    //console.log('🔴 Player disconnected:', data);
    setPlayers(prevPlayers => {
      const playerKey = Object.keys(prevPlayers).find(key => 
        prevPlayers[key].pseudo === data.pseudo || key === data.playerId
      );
      
      if (playerKey) {
        return {
          ...prevPlayers,
          [playerKey]: {
            ...prevPlayers[playerKey],
            connected: false
          }
        };
      }
      return prevPlayers;
    });
  });

  const handlePlayerConnected = useEffectEvent((data) => {
    //console.log('🟢 Player connected:', data);
    setPlayers(prevPlayers => {
      const playerKey = Object.keys(prevPlayers).find(key => 
        prevPlayers[key].pseudo === data.pseudo || key === data.playerId
      );
      
      if (playerKey) {
        return {
          ...prevPlayers,
          [playerKey]: {
            ...prevPlayers[playerKey],
            connected: true
          }
        };
      }
      return prevPlayers;
    });
  });

  const handleNextQuestion = useEffectEvent((data) => {
    //console.log('⏭️ Next question:', data);
    setBuzzedBy('');
    setFoundArtist(false);
    setFoundTitle(false);
    if (data.currentTrack) {
      setSpotifyTrackInfo(data.currentTrack);
    }
  });

  const handleBuzzerReset = useEffectEvent(() => {
    //console.log('🔄 Buzzer reset - Admin a passé');
    setBuzzedBy('');
  });

  const handleSpectatorError = useEffectEvent((error) => {
    console.error('Erreur spectateur:', error);
    setRoomError(error.message || 'Une erreur est survenue');
  });

  useEffect(() => {
    if (!socket || !roomCode) return;

    // Timer pour détecter si aucune réponse n'arrive du serveur
    const connectionTimeout = setTimeout(() => {
      if (!roomData && !roomError) {
        setRoomError('La salle demandée n\'existe pas ou n\'est plus disponible.');
      }
    }, 3000); // 3 secondes de timeout

    // Rejoindre en tant que spectateur AVEC CALLBACK (comme ClientView)
    socket.emit('join_as_spectator', { roomCode }, (response) => {
      clearTimeout(connectionTimeout); // Annuler le timeout si on reçoit une réponse
      
      if (response && response.error) {
        // Erreur immédiate du serveur (salle n'existe pas, etc.)
        setRoomError(response.error);
        return;
      }
      
      // Si pas d'erreur, traiter la réponse via le handler
      if (response) {
        handleSpectatorRoomData(response);
      }
    });

    // === ÉCOUTER TOUS LES ÉVÉNEMENTS avec Effect Events stables ===
    socket.on('spectator_room_data', handleSpectatorRoomData);
    socket.on('update_players', handleUpdatePlayers);
    socket.on('buzzed', handleBuzzed);
    socket.on('buzz_cleared', handleBuzzCleared);
    socket.on('spotify_track_changed', handleSpotifyTrackChanged);
    socket.on('judge_answer', handleJudgeAnswer);
    socket.on('game_paused', handleGamePaused);
    socket.on('room_options_updated', handleRoomOptionsUpdated);
    socket.on('next_question', handleNextQuestion);
    socket.on('player_disconnected', handlePlayerDisconnected);
    socket.on('player_connected', handlePlayerConnected);
    socket.on('reset_buzzer', handleBuzzerReset);
    socket.on('spectator_error', handleSpectatorError);

    // === NETTOYAGE ===
    return () => {
      socket.off('spectator_room_data', handleSpectatorRoomData);
      socket.off('update_players', handleUpdatePlayers);
      socket.off('buzzed', handleBuzzed);
      socket.off('buzz_cleared', handleBuzzCleared);
      socket.off('spotify_track_changed', handleSpotifyTrackChanged);
      socket.off('judge_answer', handleJudgeAnswer);
      socket.off('game_paused', handleGamePaused);
      socket.off('room_options_updated', handleRoomOptionsUpdated);
      socket.off('next_question', handleNextQuestion);
      socket.off('player_disconnected', handlePlayerDisconnected);
      socket.off('player_connected', handlePlayerConnected);
      socket.off('reset_buzzer', handleBuzzerReset);
      socket.off('spectator_error', handleSpectatorError);
    };
  }, [socket, roomCode]);

  // AJOUTE ce useEffect pour gérer le nettoyage automatique des animations :
  useEffect(() => {
    // Nettoyer les animations expirées toutes les 500ms
    const cleanupInterval = setInterval(() => {
      setScoreChanges(prevChanges => {
        const now = Date.now();
        const cleanedChanges = {};
        let hasActiveChanges = false;
        
        Object.keys(prevChanges).forEach(pseudo => {
          const change = prevChanges[pseudo];
          const timeSinceStart = now - change.timestamp;
          
          // Garder l'animation si elle a moins de 3 secondes
          if (timeSinceStart < 3000) {
            cleanedChanges[pseudo] = change;
            hasActiveChanges = true;
          }
        });
        
        // Retourner un objet vide si aucune animation active pour éviter les re-rendus
        return hasActiveChanges ? cleanedChanges : {};
      });
    }, 500);
    
    return () => clearInterval(cleanupInterval);
  }, []);
    
  /* Wake Lock simple pour empêcher l'écran de s'éteindre */
useEffect(() => {
  let wakeLock = null;
  
  const enableWakeLock = async () => {
    // API Wake Lock standard (Chrome/Edge sur PC)
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('Wake Lock activé pour la vue spectateur');
        
        // Gérer la libération automatique
        wakeLock.addEventListener('release', () => {
          console.log('Wake Lock libéré automatiquement');
        });
        
      } catch (err) {
        console.log('Wake Lock non supporté ou refusé:', err.message);
      }
    } else {
      console.log('Wake Lock API non disponible sur ce navigateur');
    }
  };
  
  const handleVisibilityChange = async () => {
    // Réactiver le wake lock quand on revient sur la page
    if (document.visibilityState === 'visible' && roomData) {
      if (wakeLock && wakeLock.released) {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
          console.log('Wake Lock réactivé après retour sur la page');
        } catch (err) {
          console.log('Impossible de réactiver le Wake Lock:', err.message);
        }
      }
    }
  };
  
  // Activer le wake lock quand les données sont chargées
  if (roomData) {
    enableWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  
  // Nettoyage
  return () => {
    if (wakeLock && !wakeLock.released) {
      wakeLock.release()
        .then(() => console.log('Wake Lock libéré (vue spectateur)'))
        .catch(e => console.log('Erreur libération Wake Lock:', e));
    }
    
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}, [roomData]); // Déclencher quand roomData est disponible      

  // Calculer les données du classement AVANT les returns conditionnels
  const sortedPlayers = React.useMemo(() => {
    if (!players || Object.keys(players).length === 0) {
      return [];
    }
    return Object.values(players)
      .filter(player => !player.isAdmin) // Exclure les admins
      .sort((a, b) => b.score - a.score); // Trier par score décroissant
  }, [players]);

  const totalPlayers = sortedPlayers.length;

  // Fonction pour revenir à l'accueil
  const navigateToHome = () => {
    navigate('/', { replace: true });
  };

  // MAINTENANT on peut faire les returns conditionnels
  if (!roomData && roomError) {
    return (
      <div className={`spectator-view ${isDarkMode ? 'dark-mode' : ''}`}>
        <div className="spectator-error-container">
          <div className="spectator-error-content">
            <EyeOpenIcon className="error-icon" />
            <h2>Erreur de connexion</h2>
            <p>{roomError}</p>
            <button 
              className="btn-primary" 
              onClick={navigateToHome}
            >
              Retour à l'accueil
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!roomData) {
    return (
      <div className={`spectator-view ${isDarkMode ? 'dark-mode' : ''}`}>
        <div className="spectator-connecting-container">
          <div className="spectator-connecting-content">
            <div className="loading-spinner"></div>
            <h2>Connexion à la salle {roomCode}...</h2>
            <p>Chargement des données en cours</p>
          </div>
        </div>
      </div>
    );
  }

  const toggleRoomCodeVisibility = () => {
    setIsRoomCodeHidden(prev => !prev);
  };

  const toggleQRModal = () => {
    setIsQRModalOpen(prev => !prev);
  };

  const closeQRModal = () => {
    setIsQRModalOpen(false);
  };

  const toggleHeaderMenu = () => {
    setIsHeaderMenuVisible(prev => !prev);
    window.dispatchEvent(new Event('toggleSpectatorHeader'));
  };

  return (
    <div className={`spectator-view ${isDarkMode ? 'dark-mode' : ''}`}>
      {/* Bouton pour faire apparaître/disparaître le HeaderMenu */}
      <button 
        className="spectator-header-toggle"
        onClick={toggleHeaderMenu}
        title={isHeaderMenuVisible ? "Masquer le menu" : "Afficher le menu"}
        aria-label="Toggle header menu"
      >
        <span className="toggle-arrow">{isHeaderMenuVisible ? '▲' : '▼'}</span>
      </button>

      {/* Header Zone */}
      <div className="spectator-header-zone">
        <div className="spectator-room-info">
          <div className="spectator-room-code">
            <EyeOpenIcon 
              className="spectator-icon" 
              onClick={toggleRoomCodeVisibility}
              style={{ cursor: 'pointer' }}
              title={isRoomCodeHidden ? "Afficher le code de la salle" : "Masquer le code de la salle"}
            />
            <h2>Salle {isRoomCodeHidden ? brand.name : roomCode}</h2>
            <div 
              className="spectator-badge" 
              onClick={toggleQRModal}
              style={{ cursor: 'pointer' }}
              title="Afficher le QR Code"
            >
              Spectateur
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256" fill="currentColor" style={{ marginLeft: '6px', verticalAlign: 'middle' }}>
                <path d="M104,40H56A16,16,0,0,0,40,56v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,104,40ZM56,104V56h48v48ZM200,40H152a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40ZM152,104V56h48v48ZM104,136H56a16,16,0,0,0-16,16v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V152A16,16,0,0,0,104,136ZM56,200V152h48v48ZM144,144a8,8,0,0,1,8-8h16a8,8,0,0,1,0,16H152A8,8,0,0,1,144,144Zm72,0a8,8,0,0,1-8,8H192v16a8,8,0,0,1-16,0V144a8,8,0,0,1,8-8h24A8,8,0,0,1,216,144Zm0,48a8,8,0,0,1-8,8H184a8,8,0,0,1,0-16h16V168a8,8,0,0,1,16,0Zm-72,16a8,8,0,0,1,8-8h16a8,8,0,0,1,0,16H152A8,8,0,0,1,144,208Zm24-32a8,8,0,0,1-8,8h-8v24a8,8,0,0,1-16,0V176a8,8,0,0,1,8-8h16A8,8,0,0,1,168,176Z"/>
              </svg>
            </div>
          </div>
          
          <div className="spectator-game-info">
            <div className={`game-status ${gameStatus === 'paused' ? 'spectator-paused' : 'spectator-active'}`}>
             {gameStatus === 'paused' ? '⏸️ En pause' : '▶️ En cours'}
            </div>
            <div className="player-count">
              {totalPlayers} joueur{totalPlayers > 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* NOUVEAU LAYOUT - 3 zones principales */}
      <div className="spectator-content-grid">
        
        {/* ZONE VERTE - Spotify Display agrandi */}
        <div className="spectator-spotify-big-zone">
          {roomOptions?.spotifyEnabled && spotifyTrackInfo ? (
            <>
              {/* En-tête avec jaquette et nom de playlist */}
              {(spotifyTrackInfo.playlistInfo?.artworkUrl || spotifyTrackInfo.playlistInfo?.name) && (
                <div className="spectator-spotify-header">
                  {spotifyTrackInfo.playlistInfo?.artworkUrl && (
                    <div className="spectator-album-art">
                      <img 
                        src={spotifyTrackInfo.playlistInfo.artworkUrl} 
                        alt="Jaquette de la playlist"
                        onError={(e) => { e.target.src = '/default-album-art.png'; }}
                      />
                    </div>
                  )}
                  {spotifyTrackInfo.playlistInfo?.name && (
                    <div className="spectator-playlist-info">
                      <span className="playlist-icon">📀</span>
                      <span className="playlist-name">{spotifyTrackInfo.playlistInfo.name}</span>
                    </div>
                  )}
                </div>
              )}
              
              <div className="spotify-display-wrapper">
                <SpotifyDisplay 
                  trackInfo={spotifyTrackInfo ? {
                    ...spotifyTrackInfo,
                    title: spotifyTrackInfo.title?.length > 60 
                      ? spotifyTrackInfo.title.substring(0, 60) + '...' 
                      : spotifyTrackInfo.title
                  } : null}
                  foundArtist={foundArtist}
                  foundTitle={foundTitle}
                  roomType={roomOptions.roomType}
                />
              </div>
            </>
          ) : (
            <div className="spectator-status-big">
              <div className="status-card-big">
                <h2>🎵 Blindtest en cours</h2>
                <p>
                  {gameStatus === 'paused' 
                    ? 'La partie est actuellement en pause' 
                    : roomOptions?.spotifyEnabled 
                      ? 'En attente de la prochaine piste...'
                      : 'Les joueurs attendent la prochaine question'
                  }
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ZONE ROUGE - Classement compact */}
        <div className="spectator-ranking-compact">
          <div className="spectator-ranking-header">
            <h3>🏆 Classement temps réel</h3>
          </div>

          <div className="spectator-ranking-table-container">
            <table className="spectator-ranking-table">
              <thead>
                <tr>
                  <th>Rang</th>
                  <th>Joueur</th>
                  <th>Score</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.slice(0, 11).map((player, index) => {
                  const scoreChange = scoreChanges[player.pseudo];
                  const rowClasses = `
                    ${player.pseudo === buzzedBy ? 'player-buzzed' : ''}
                    ${scoreChange ? `score-change-${scoreChange.type}` : ''}
                  `.trim();
                  
                  return (
                    <tr key={player.pseudo} className={rowClasses}>
                      <td className="position-cell">
                        {index < 3 ? (
                          <div className="position-medal">
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                          </div>
                        ) : (
                          <div className="position-number">{index + 1}</div>
                        )}
                      </td>
                      
                      <td className="pseudo-cell">
                        <div className="player-name-container">
                          <span className="player-name">{player.pseudo}</span>
                          {player.pseudo === buzzedBy && buzzedBy !== '' && (
                            <span className="buzz-indicator-small" title="A buzzé !">
                              🔴 A buzzé !
                            </span>
                          )}
                        </div>
                      </td>
                      
                      <td className="score-cell">
                        <div className="score-container">
                          <span className="player-score">{player.score}</span>
                          {scoreChange && (
                            <span className={`score-change-indicator ${scoreChange.type}`}>
                              {scoreChange.change > 0 ? '+' : ''}{scoreChange.change}
                            </span>
                          )}
                        </div>
                      </td>
                      
                      <td className="status-cell">
                        <div className={`player-status ${player.connected ? 'connected' : 'disconnected'}`}>
                          <div className="status-indicator"></div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                
                {/* Indication s'il y a plus de 10 joueurs */}
                {sortedPlayers.length > 10 && (
                  <tr className="more-players-indicator">
                    <td colSpan="4" className="more-players-text">
                      <div className="more-players-content">
                        <span className="more-players-icon">⋯</span>
                        <span>et {sortedPlayers.length - 10} autre{sortedPlayers.length - 10 > 1 ? 's' : ''} joueur{sortedPlayers.length - 10 > 1 ? 's' : ''}</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ZONE VIOLETTE - Promo établissement */}
        <div className="spectator-ad-zone">
          <div className="ad-content">
            <div className="rdv-logo-container">
              <img 
                src={brandAssets.logo} 
                alt={`Logo ${brand.name}`} 
                className="rdv-logo"
              />
            </div>
            <div className="rdv-promo-text">
              <p 
                className="promo-line session"
                dangerouslySetInnerHTML={{ __html: brand.promo.session }}
              />
              <p 
                className="promo-line monthly"
                dangerouslySetInnerHTML={{ __html: brand.promo.monthly }}
              />
            </div>
          </div>
        </div>
        
      </div>

      {/* MODALE QR CODE */}
      {isQRModalOpen && (
        <div className="qr-modal-overlay" onClick={closeQRModal}>
          <div className="qr-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="qr-modal-header">
              <h3>QR Codes</h3>
              <button className="qr-modal-close" onClick={closeQRModal}>
                ✕
              </button>
            </div>
            <div className="qr-modal-body">
              <div className="qr-codes-container">
                <div className="qr-code-item">
                  <QRCodeSVG 
                    value={`${window.location.origin}/?room=${roomCode}`}
                    size={512}
                    level="H"
                    includeMargin={false}
                    className="qr-code-image"
                    style={{ padding: '12px', background: 'white' }}
                    imageSettings={{
                      src: brandAssets.logo,
                      height: 150,
                      width: 150,
                      excavate: true,
                    }}
                  />
                  <p className="qr-code-label">QR Code de la salle</p>
                </div>
                <div className="qr-code-item">
                  <QRCodeSVG 
                    value={getWifiQRString()}
                    size={512}
                    level="H"
                    includeMargin={false}
                    className="qr-code-image"
                    style={{ padding: '12px', background: 'white' }}
                    imageSettings={{
                      src: wifiIcon,
                      height: 120,
                      width: 120,
                      excavate: true,
                    }}
                  />
                  <p className="qr-code-label">QR Code WiFi</p>
                </div>
              </div>
              <div className="qr-room-code-display">
                Code de la salle : <span className="qr-room-code">{roomCode}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✅ COUNTDOWN OVERLAY - Décompte changement de piste */}
      {trackChangeCountdown !== null && (
        <div className="countdown-overlay">
          <div className="countdown-content">
            <div className="countdown-message">🎵 Préparez-vous...</div>
            <div className="countdown-number">{trackChangeCountdown}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SpectatorView;

