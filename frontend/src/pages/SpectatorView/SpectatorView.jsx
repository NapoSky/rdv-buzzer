import React, { useState, useEffect, useContext } from 'react';
import { useParams } from 'react-router-dom';
import { SocketContext } from '../../contexts/SocketContext';
import { ThemeContext } from '../../contexts/ThemeContext';
import SpotifyDisplay from '../../components/client/SpotifyDisplay/SpotifyDisplay';
import { EyeOpenIcon } from '@radix-ui/react-icons';
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

  useEffect(() => {
    if (!socket || !roomCode) return;

    // Rejoindre en tant que spectateur
    socket.emit('join_as_spectator', { roomCode });

    // === HANDLERS POUR TOUS LES ÉVÉNEMENTS DYNAMIQUES ===
    
    const handleSpectatorRoomData = (data) => {
      console.log('Spectator room data:', data);
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
    };

    const handleUpdatePlayers = (newPlayers) => {
      console.log('🔄 Update players:', newPlayers);
      
      // Utiliser une référence pour accéder aux scores précédents
      setPreviousScores(prevScores => {
        const currentScores = {};
        const newScoreChanges = {};
        
        Object.keys(newPlayers || {}).forEach(playerId => {
          const player = newPlayers[playerId];
          if (!player.isAdmin) {
            currentScores[player.pseudo] = player.score;
            
            // Comparer avec le score précédent
            const previousScore = prevScores[player.pseudo] || 0;
            const scoreDiff = player.score - previousScore;
            
            if (scoreDiff !== 0 && prevScores[player.pseudo] !== undefined) {
              newScoreChanges[player.pseudo] = {
                change: scoreDiff,
                type: scoreDiff > 0 ? 'positive' : 'negative',
                timestamp: Date.now()
              };
              console.log(`📊 Score change for ${player.pseudo}: ${scoreDiff > 0 ? '+' : ''}${scoreDiff}`);
              console.log('🎨 Animation will be applied:', newScoreChanges[player.pseudo]);
            }
          }
        });
        
        // Mettre à jour les animations
        if (Object.keys(newScoreChanges).length > 0) {
          console.log('🎨 Setting score changes:', newScoreChanges);
          setScoreChanges(newScoreChanges);
          
          // Clear les animations après 2 secondes
          setTimeout(() => {
            console.log('🎨 Clearing score changes animations');
            setScoreChanges({});
          }, 2000);
        }
        
        return currentScores; // Retourner les nouveaux scores
      });
      
      // Convertir disconnected en connected pour cohérence
      const playersWithConnectionStatus = {};
      Object.keys(newPlayers || {}).forEach(playerId => {
        const player = newPlayers[playerId];
        playersWithConnectionStatus[playerId] = {
          ...player,
          connected: !player.disconnected
        };
      });
      setPlayers(playersWithConnectionStatus);
    };

    // === GESTION DES BUZZ - CES ÉVÉNEMENTS ARRIVENT DÉJÀ ===
    const handleBuzzed = (data) => {
        console.log('🔴 Buzz reçu:', data);
        const buzzedPlayer = data.buzzedBy || '';
      setBuzzedBy(buzzedPlayer);
    };

    const handleBuzzCleared = () => {
      console.log('🔄 Buzz cleared');
      setBuzzedBy('');
    };

    // === GESTION SPOTIFY - CES ÉVÉNEMENTS ARRIVENT DÉJÀ ===
    const handleSpotifyTrackChanged = (data) => {
      console.log('🎵 Spotify track changed:', data);
      // Les données peuvent venir dans différents formats
      const newTrack = data.trackInfo || data.track || data.newTrack || null;
      setSpotifyTrackInfo(newTrack);
      setFoundArtist(false);
      setFoundTitle(false);
      // Clear le buzz car nouvelle piste
      setBuzzedBy('');
    };

    const handleJudgeAnswer = (data) => {
      console.log('⚖️ Judge answer:', data);
      setFoundArtist(data.artistFound || false);
      setFoundTitle(data.titleFound || false);
      // Clear le buzz après jugement
      setBuzzedBy('');
    };

    // === GESTION DU JEU - CES ÉVÉNEMENTS ARRIVENT DÉJÀ ===
    const handleGamePaused = (data) => {
      console.log('⏸️ Game paused:', data);
      setGameStatus(data.paused ? 'paused' : 'playing');
    };

    const handleRoomOptionsUpdated = (options) => {
      console.log('⚙️ Room options updated:', options);
      setRoomOptions(options);
    };

    // === GESTION DES CONNEXIONS - CES ÉVÉNEMENTS ARRIVENT DÉJÀ ===
    const handlePlayerDisconnected = (data) => {
      console.log('🔴 Player disconnected:', data);
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
    };
    
    const handlePlayerConnected = (data) => {
      console.log('🟢 Player connected:', data);
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
    };

    // === GESTION DES QUESTIONS/ROUNDS - CES ÉVÉNEMENTS ARRIVENT DÉJÀ ===
    const handleNextQuestion = (data) => {
      console.log('⏭️ Next question:', data);
      setBuzzedBy('');
      setFoundArtist(false);
      setFoundTitle(false);
      if (data.currentTrack) {
        setSpotifyTrackInfo(data.currentTrack);
      }
    };

    // === AJOUT DU NOUVEAU HANDLER ===
    const handleBuzzerReset = () => {
      console.log('🔄 Buzzer reset - Admin a passé');
      setBuzzedBy('');
    };

    // === ÉCOUTER TOUS LES ÉVÉNEMENTS (ils arrivent déjà car les spectateurs sont dans la room) ===
    socket.on('spectator_room_data', handleSpectatorRoomData);
    socket.on('update_players', handleUpdatePlayers);
    
    // Ces événements arrivent déjà automatiquement car les spectateurs rejoignent la room normale
    socket.on('buzzed', handleBuzzed);
    socket.on('buzz_cleared', handleBuzzCleared);
    socket.on('spotify_track_changed', handleSpotifyTrackChanged);
    socket.on('judge_answer', handleJudgeAnswer);
    socket.on('game_paused', handleGamePaused);
    socket.on('room_options_updated', handleRoomOptionsUpdated);
    socket.on('next_question', handleNextQuestion);
    socket.on('player_disconnected', handlePlayerDisconnected);
    socket.on('player_connected', handlePlayerConnected);
    // === AJOUT DE L'ÉVÉNEMENT reset_buzzer ===
    socket.on('reset_buzzer', handleBuzzerReset);

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
      // === NETTOYAGE DE L'ÉVÉNEMENT reset_buzzer ===
      socket.off('reset_buzzer', handleBuzzerReset);
    };
  }, [socket, roomCode]); // SUPPRIMER previousScores des dépendances

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

  // Calculer les données du classement (comme dans ClientView)
  const sortedPlayers = Object.values(players)
    .filter(player => !player.isAdmin) // Exclure les admins
    .sort((a, b) => b.score - a.score); // Trier par score décroissant

  const totalPlayers = sortedPlayers.length;

  // Juste avant le return dans le rendu, ajoute :
  console.log('Current players for display:', sortedPlayers.map(p => ({ pseudo: p.pseudo, connected: p.connected, score: p.score })));

  return (
    <div className={`spectator-view ${isDarkMode ? 'dark-mode' : ''}`}>
      {/* Header Zone */}
      <div className="spectator-header-zone">
        <div className="spectator-room-info">
          <div className="spectator-room-code">
            <EyeOpenIcon className="spectator-icon" />
            <h2>Salle {roomCode}</h2>
            <div className="spectator-badge">Spectateur</div>
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

      {/* Zone principale */}
      <div className="spectator-main-zone">
        {/* Affichage Spotify si activé */}
        {roomOptions?.spotifyEnabled && spotifyTrackInfo ? (
          <div className="spectator-spotify-zone">
            <SpotifyDisplay 
              trackInfo={spotifyTrackInfo}
              foundArtist={foundArtist}
              foundTitle={foundTitle}
              roomType={roomOptions.roomType}
            />
          </div>
        ) : (
          /* Zone de statut si pas de Spotify */
          <div className="spectator-status-zone">
            <div className="status-card">
              <h3>🎵 Blindtest en cours</h3>
              <p>
                {gameStatus === 'paused' 
                  ? 'La partie est actuellement en pause' 
                  : 'Les joueurs attendent la prochaine question'
                }
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Zone Classement - Toujours visible */}
      <div className="spectator-ranking-zone">
        <div className="spectator-ranking-header">
          <h3>🏆 Classement en temps réel</h3>
          <span className="player-count-badge">
            {totalPlayers} participant{totalPlayers > 1 ? 's' : ''}
          </span>
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
              {sortedPlayers.map((player, index) => {
                const scoreChange = scoreChanges[player.pseudo];
                const rowClasses = `
                  ${player.pseudo === buzzedBy ? 'player-buzzed' : ''}
                  ${scoreChange ? `score-change-${scoreChange.type}` : ''}
                `.trim();
                
                console.log(`🎨 Player ${player.pseudo} - scoreChange:`, scoreChange, 'classes:', rowClasses);
                
                return (
                  <tr
                    key={player.pseudo}
                    className={rowClasses}
                  >
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default SpectatorView;