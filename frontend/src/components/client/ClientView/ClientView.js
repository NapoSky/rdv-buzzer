// src/components/ClientView.js
import React, { useState, useEffect, useContext, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { ThemeContext } from '../../../contexts/ThemeContext'; // Chemin corrigé
import './ClientView.css'; // Import CSS local
import { getSocket, joinRoom, on, off, buzz, initializeSocket, ensureSocketConnection } from '../../../services/socket/socketService';
import { useSocketError } from '../../../hooks/useSocketError';
import { useSocketStatus } from '../../../hooks/useSocketStatus';
import BuzzedModal from '../../shared/modals/client/BuzzedModal';
import AdminMissingModal from '../../shared/modals/client/AdminMissingModal';
import FinalRankingModal from '../../shared/modals/client/FinalRankingModal';
import RoomErrorModal from '../../shared/modals/client/RoomErrorModal';

function ClientView({ setActiveRoomCode }) {

  // Lecture des paramètres d'URL et récupération du pseudo/roomCode depuis le localStorage si absents
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const paramRoomCode = searchParams.get('roomCode') || localStorage.getItem('roomCode') || '';
  const paramPseudo = searchParams.get('pseudo') || localStorage.getItem('pseudo') || '';
  const { isDarkMode } = useContext(ThemeContext);

  // États locaux
  const [roomCode, setRoomCode] = useState(paramRoomCode);
  const [pseudo, setPseudo] = useState(paramPseudo);
  const [joined, setJoined] = useState(false);
  const [players, setPlayers] = useState({});
  const playersRef = useRef({});
  const [buzzedBy, setBuzzedBy] = useState('');
  const [gamePaused, setGamePaused] = useState(false);
  const [adminPresent, setAdminPresent] = useState(true);
  const [isDisabled, setIsDisabled] = useState(false); // Nouvel état pour suivre si le joueur est temporairement bloqué
  const [showFinalRanking, setShowFinalRanking] = useState(false);
  const [finalPlayers, setFinalPlayers] = useState([]);
  const [roomClosed, setRoomClosed] = useState(false);
  const roomClosedRef = useRef(false);
  const [roomError, setRoomError] = useState(''); // ← nouvel état
  const reconnectAttemptRef = useRef(false);

  // Récupérer la connexion socket depuis le contexte (socket persistant)
  const socket = getSocket();
  const isConnected = useSocketStatus();
  const socketError = useSocketError();
  
  const joinCurrentRoom = () => {
    // Vérifier d'abord si l'utilisateur a été kické
    if (localStorage.getItem('kicked_from_' + roomCode) === 'true') {
      console.log('ClientView: tentative bloquée - utilisateur kické');
      setRoomError("Vous avez été expulsé de cette salle par l'admin.");
      navigateToHome();
      return;
    }
  
    console.log(`ClientView: tentative de rejoindre la salle ${roomCode} avec ${pseudo}`);
    joinRoom(roomCode, pseudo).then(response => {
      // Le reste du code reste inchangé
      if (response && response.error) {
        console.error('ClientView: erreur join_room:', response.error);
        setRoomError(response.error);
      } else if (response) {
        console.log(`ClientView: ${pseudo} rejoint la salle ${roomCode}`);
        setJoined(true);
        setActiveRoomCode(roomCode); // Important: mettre à jour le code de salle actif
        setGamePaused(response.paused);
        // Réinitialiser les erreurs
        setRoomError('');
      }
    }).catch(err => {
      console.error("Erreur lors de la tentative de connexion:", err);
      setRoomError("Erreur de connexion au serveur");
    });
  };

  // Modifiez uniquement cette fonction
  const navigateToHome = () => {
    // On quitte la salle mais SANS fermer la socket
    if (joined && roomCode && pseudo) {
      // Envoyer l'événement de sortie mais sans option de déconnexion
      socket.emit('leave_room', { roomCode, pseudo });
    }
    
    // Nettoyer les états
    setJoined(false);
    
    // Naviguer vers l'accueil
    navigate('/', { replace: true });
  };

  // CORRECTION: Déplacer les configurations de socket et événements dans un useEffect
  useEffect(() => {
    console.log('ClientView: vérification de la socket...', socket?.id);
    
    if (!socket) {
      console.log('ClientView: socket non initialisée, initialisation forcée');
      initializeSocket();
      return; // On sort et on laisse le nouveau rendu avec la socket initialisée
    }
    
    console.log('ClientView: socket active avec ID:', socket?.id);
    
    // Si l'utilisateur n'a pas encore rejoint mais a un roomCode et un pseudo
    if (!joined && roomCode && pseudo && !roomClosedRef.current) {
      if (socket.connected) {
        console.log('ClientView: socket déjà connectée, joinRoom immédiat');
        joinCurrentRoom();
      } else {
        console.log('ClientView: attente de connexion socket avant joinRoom');
      }
    }
    
    console.log('ClientView: configuration des écouteurs d\'événements avec socket', socket?.id);

    // Événements pour le statut de la room
    const onRoomPaused = () => {
      console.log('ClientView: salle mise en pause');
      setGamePaused(true);
    };

    const onRoomResumed = () => {
      console.log('ClientView: salle réactivée');
      setGamePaused(false);
    };

    const onAdminStatusChange = (status) => {
      console.log('ClientView: changement statut admin:', status);
      setAdminPresent(status.present);
      // Si l'admin est de retour, la salle reprend automatiquement
      if (status.present) {
        setGamePaused(false);
      }
    };

    const onAdminDisconnected = () => {
      console.log('ClientView: admin déconnecté');
      setAdminPresent(false);
      setGamePaused(true); // Mettre la partie en pause automatiquement
    };

    const onAdminConnected = () => {
      console.log('ClientView: admin connecté');
      setAdminPresent(true);
      setGamePaused(false); // Reprendre la partie automatiquement
    };

    // Modifiez le gestionnaire d'événements 'buzzed'
    const onBuzzed = (data) => {
      console.log(`ClientView: réception d'un événement buzzed:`, data);
      
      // Vérifier que data et data.buzzedBy existent (au lieu de data.player)
      if (!data || !data.buzzedBy) {
        console.error('ClientView: événement buzzed invalide, data.buzzedBy manquant:', data);
        return; // Sortir pour éviter une mise à jour avec des données invalides
      }
      
      // Définir clairement qui a buzzé, avec log détaillé
      console.log(`ClientView: ${data.buzzedBy} a buzzé!`);
      setBuzzedBy(data.buzzedBy);
      
      // Logique de désactivation du buzzer
      if (data.buzzedBy === pseudo) {
        // Pour celui qui a buzzé, on garde désactivé
        setIsDisabled(true);
        console.log(`ClientView: désactivation du buzzer pour ${pseudo} (c'est vous)`);
      } else {
        // Pour les autres joueurs, on désactive temporairement
        // puis on réactivera après le buzz_cleared
        setIsDisabled(true);
        console.log(`ClientView: désactivation du buzzer pour ${pseudo} car ${data.buzzedBy} a buzzé`);
      }
      
      // Ajouter un délai et vérifier que l'état a bien été mis à jour
      setTimeout(() => {
        console.log('État buzzedBy après mise à jour:', buzzedBy);
      }, 100);
    };

    const onBuzzCleared = () => {
      console.log('ClientView: buzzer réinitialisé');
      // Réinitialiser l'état qui contrôle l'affichage de la modale
      setBuzzedBy('');
      
      // Réactiver le bouton pour tout le monde si le jeu n'est pas en pause
      if (!gamePaused) {
        setIsDisabled(false);
      }
    };

    // Modifier l'événement reset_buzzer
    const onResetBuzzer = () => {
      console.log('ClientView: reset_buzzer – fermer la modale pour tous');
      setBuzzedBy('');
      // Ne fais pas de setIsDisabled(false) pour tout le monde.
    };

    // Mise à jour des joueurs
    const onUpdatePlayers = (updatedPlayers) => {
      setPlayers(updatedPlayers);
      playersRef.current = updatedPlayers;

      // Vérifier si ce joueur existe encore dans la liste
      const playerExists = Object.values(updatedPlayers).some(
        (player) => player.pseudo === pseudo && !player.disconnected
      );

      if (!playerExists && joined) {
        // Au lieu de rejoindre immédiatement, vérifier d'abord si le joueur a été kické
        socket.emit('check_if_kicked', { roomCode, pseudo }, (response) => {
          if (response && response.kicked) {
            // Si le joueur a été kické, ne pas le reconnecter
            console.log('ClientView: joueur kické, redirection vers l\'accueil');
            alert('Vous avez été kické de la salle par l\'admin.');
            navigateToHome();
          } else {
            // Si c'était une déconnexion involontaire, tenter de se reconnecter
            console.log('ClientView: déconnexion involontaire, tentative de reconnexion...');
            joinCurrentRoom();
          }
          
        });
      }
    };

    // Modifiez l'événement room_closed pour utiliser playersRef comme fallback
    const onRoomClosed = (data) => {
      console.log('ClientView: la salle a été fermée', data);
      roomClosedRef.current = true;
      
      // Utiliser les données de l'événement OU la référence actuelle si non disponible
      let playersData = (data && data.players) ? data.players : playersRef.current;
      
      // S'assurer que nous avons des données de joueurs
      if (Object.keys(playersData).length > 0) {
        console.log('ClientView: préparation du classement final avec joueurs:', playersData);
        const rankedPlayers = Object.values(playersData)
          .filter(player => !player.isAdmin)
          .sort((a, b) => b.score - a.score);
        
        console.log('ClientView: rankedPlayers:', rankedPlayers);
        
        // IMPORTANT : Définir ces états dans cet ordre précis
        setFinalPlayers(rankedPlayers);
        setRoomClosed(true);
        
        // Utiliser un rappel pour garantir que showFinalRanking est mis à jour après roomClosed
        // Ce qui assure que les deux conditions seront vraies ensemble
        setTimeout(() => {
          setShowFinalRanking(true);
          console.log('ClientView: Modal de classement final activée');
        }, 50);
      } else {
        console.error('ClientView: Aucune donnée de joueur disponible pour le classement final');
        // Créer un classement de secours pour éviter un échec complet
        joinCurrentRoom();
      }
    };

    const onDisconnect = (reason) => {
      console.log('ClientView: socket déconnectée:', reason);
    };

    // Dans ClientView.js, ajouter dans l'écouteur d'événement 'kicked'
    const onKicked = () => {
      console.log('ClientView: vous avez été kické de la salle');
    
      // Marquer le joueur comme kické dans localStorage
      localStorage.setItem('kicked_from_' + roomCode, 'true');
    
      // Nettoyer COMPLÈTEMENT les données de session
      localStorage.removeItem('roomCode');
      localStorage.removeItem('pseudo');
      setRoomCode('');
      setPseudo('');
      setJoined(false);
      setPlayers({});

      alert('Vous avez été kické de la salle par l\'admin.');
      navigateToHome();
    };

    // Dans useEffect de ClientView
    const onGamePaused = (data) => {
      console.log('ClientView: statut de pause mis à jour:', data);
      // S'assurer que data contient paused, sinon utiliser une valeur par défaut
      const isPaused = data && typeof data.paused !== 'undefined' ? data.paused : false;
      setGamePaused(isPaused);
      
      if (isPaused) {
        // Désactiver les boutons de buzz quand le jeu est en pause
        setIsDisabled(true);
      } else {
        // Réactiver les boutons sauf pour les joueurs qui ont buzzé
        if (!buzzedBy) {
          setIsDisabled(false);
        }
      }
    };
      
    // Ajouter un écouteur pour l'événement 'buzzer_disabled'
    const onBuzzerDisabled = ({ duration }) => {
      console.log('ClientView: buzzer temporairement désactivé');
      setIsDisabled(true);
      // Ferme la modale pour le joueur buzzé
      setBuzzedBy('');
      setTimeout(() => {
        console.log('ClientView: réactivation du buzzer après', duration, 's');
        setIsDisabled(false);
      }, duration * 1000);
    };

    // Enregistrer tous les écouteurs d'événements
    on('room_paused', onRoomPaused);
    on('room_resumed', onRoomResumed);
    on('admin_status_change', onAdminStatusChange);
    on('admin_disconnected', onAdminDisconnected);
    on('admin_connected', onAdminConnected);
    on('buzzed', onBuzzed);
    on('buzz_cleared', onBuzzCleared);
    on('reset_buzzer', onResetBuzzer);
    on('update_players', onUpdatePlayers);
    on('room_closed', onRoomClosed);
    on('disconnect', onDisconnect);
    on('kicked', onKicked);
    on('game_paused', onGamePaused);
    on('buzzer_disabled', onBuzzerDisabled);

    // Nettoyage à la destruction du composant
    return () => {
      console.log('ClientView: nettoyage des écouteurs d\'événements');
      
      // Désabonnement des événements
      off('room_paused', onRoomPaused);
      off('room_resumed', onRoomResumed);
      off('admin_status_change', onAdminStatusChange);
      off('buzzed', onBuzzed);
      off('buzz_cleared', onBuzzCleared);
      off('reset_buzzer', onResetBuzzer);
      off('update_players', onUpdatePlayers);
      off('room_closed', onRoomClosed);
      off('disconnect', onDisconnect);
      off('admin_disconnected', onAdminDisconnected);
      off('admin_connected', onAdminConnected);
      off('kicked', onKicked);
      off('game_paused', onGamePaused);
      off('buzzer_disabled', onBuzzerDisabled);
    };
  }, [socket, roomCode, pseudo, setActiveRoomCode, navigate, joined, gamePaused, buzzedBy]);

  // Hook d'effet pour gérer la reconnexion après mise en veille
  useEffect(() => {
    if (!socket || !joined || !roomCode || !pseudo) return;
    
    // Fonction exécutée lors de la reconnexion de la socket
    const handleReconnect = () => {
      console.log('Socket reconnectée, mise à jour du statut du joueur...');
      // Avertir le serveur que le joueur est à nouveau actif après une veille
      socket.emit('join_room', { roomCode, pseudo }, (response) => {
        if (response.success) {
          console.log('Statut de joueur actif rétabli après reconnexion');
        } else {
          console.error('Erreur lors de la reconnexion:', response.error);
        }
      });
    };

    // Écouter l'événement de reconnexion
    on('reconnect', handleReconnect);
    
    return () => {
      off('reconnect', handleReconnect);
    };
  }, [socket, joined, roomCode, pseudo]);

  // useEffect pour écouter l'événement global de reconnexion
  useEffect(() => {
    // Fonction de gestionnaire pour l'événement de reconnexion personnalisé
    const handleGlobalReconnect = (event) => {
      const { downtime } = event.detail;
      console.log(`ClientView: reconnexion détectée après ${downtime.toFixed(1)}s`);
      
      // Si la déconnexion a duré longtemps, on force une mise à jour des données
      if (downtime > 5) { // Plus de 5 secondes
        console.log('Longue déconnexion détectée, mise à jour de l\'état de la salle');
        
        // Re-rejoindre la salle pour récupérer l'état actuel
        if (socket && socket.connected) {
          socket.emit('join_room', { roomCode, pseudo }, (response) => {
            if (response && response.success) {
              console.log('Resynchronisation de l\'état après longue déconnexion');
              // Mettre à jour les états si nécessaire
              setGamePaused(response.paused);
            }
          });
        }
      }
    };
    
    // Ajouter l'écouteur d'événement global
    document.addEventListener('socket:reconnected', handleGlobalReconnect);
    
    // Nettoyer l'écouteur
    return () => {
      document.removeEventListener('socket:reconnected', handleGlobalReconnect);
    };
  }, [socket, roomCode, pseudo]);

  // useEffect pour désactiver temporairement le buzzer pendant les déconnexions
  useEffect(() => {
    // Si déconnecté, on désactive automatiquement le buzzer
    if (!isConnected && joined) {
      setIsDisabled(true);
    }
    
    // Et on réhabilite la possibilité de buzzer si on n'était pas déjà désactivé par le jeu
    if (isConnected && joined) {
      const currentPlayer = Object.values(players).find(player => player.pseudo === pseudo);
      if (currentPlayer && !currentPlayer.buzzed) {
        setIsDisabled(false);
      }
    }
  }, [isConnected, joined, players, pseudo]);

  // useEffect pour tentative de connexion
  useEffect(() => {
    if (!roomClosedRef.current && !joined && roomCode && pseudo && !reconnectAttemptRef.current) {
      reconnectAttemptRef.current = true;
      // On s'assure d'avoir une socket connectée
      ensureSocketConnection()
        .then((currentSocket) => {
          reconnectAttemptRef.current = false;
          if (currentSocket && currentSocket.connected) {
            console.log('ClientView: socket connectée via ensureSocketConnection, ID:', currentSocket.id);
            joinCurrentRoom();
          }
        })
        .catch((err) => {
          reconnectAttemptRef.current = false;
          console.error('ClientView: Erreur lors de la connexion socket:', err);
        });
    }
  }, [roomCode, pseudo, joined]);

  // Fonction pour fermer la modale et retourner à l'accueil
  const handleCloseFinalRanking = () => {
    setShowFinalRanking(false);
    // Nettoyer le roomCode mais garder le pseudo
    localStorage.removeItem('roomCode');
    // Rediriger vers la page d'accueil
    navigate('/');
  };

  if (!roomCode || !pseudo) {
    return (
      <div>
        <h2>Erreur</h2>
        <p>Veuillez rejoindre une salle via la page d'accueil.</p>
      </div>
    );
  }

  const handleBuzz = () => {
    if (socket && joined && !gamePaused && !isDisabled) {
      // Désactiver immédiatement pour éviter double-clic
      setIsDisabled(true);
      
      // Utiliser la méthode buzz du service
      buzz(roomCode, pseudo, (response) => {
        if (response && response.error) {
          if (response.lateAttempt) {
            // C'était une tentative tardive due à la latence réseau
            if (response.buzzedBy) {
              setBuzzedBy(response.buzzedBy);
            }
          } else {
            // Autres types d'erreurs
            alert(response.error);
            setIsDisabled(false);
          }
        }
        // Si response.received est vrai, on garde le bouton désactivé pendant
        // la période de grâce, puis on attend l'événement 'buzzed' du serveur
      });
    }
  };

  if (roomError) {
    return (
      <div className={`client-view ${isDarkMode ? 'dark-mode' : ''}`}>
        <RoomErrorModal
          show={!!roomError}
          roomError={roomError}
          onNavigateToHome={navigateToHome}
        />
      </div>
    );
  }

  if (roomClosed && showFinalRanking) {
    return (
      <div className={`client-view ${isDarkMode ? 'dark-mode' : ''}`}>
        <FinalRankingModal
          show={showFinalRanking}
          finalPlayers={finalPlayers}
          pseudo={pseudo}
          isDarkMode={isDarkMode}
          onClose={handleCloseFinalRanking}
        />
      </div>
    );
  } else if (!joined) {
    // Afficher l'attente de connexion
    return (
      <div className={`client-view ${isDarkMode ? 'dark-mode' : ''}`}>
        <div className="client-container">
          <h2>Connexion en cours à la salle {roomCode}</h2>
          <p>Pseudo: {pseudo}</p>
          {!isConnected && <p className="warning">Reconnexion en cours...</p>}
          {socketError && <p className="error">Erreur de connexion: {socketError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={`client-container ${isDarkMode ? 'dark-mode' : ''}`}>
      <div className="header-zone">
        <h2>Salle : {roomCode}</h2>
        <h3>Votre pseudo : {pseudo}</h3>       
        {socketError && (
          <div className="connection-status error">
            {socketError}
          </div>
        )}
      </div>
      <div className="buzz-zone">
        <button
          className="btn btn-success buzz-button"
          onClick={handleBuzz}
          disabled={gamePaused || isDisabled}
        >
          BUZZ !
        </button>
      </div>
      <div className="footer-zone">
        <h3>Classement :</h3>
        <div className="ranking-scroll">
          <table className="table table-striped table-hover">
            <thead>
              <tr>
                <th>Pseudo</th>
                <th>Score</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(players)
                .filter(player => !player.isAdmin)
                .sort((a, b) => b.score - a.score)
                .map((player, index) => (
                  <tr key={index} className={player.pseudo === pseudo ? "current-player" : ""}>
                    <td>{player.pseudo}</td>
                    <td>{player.score}</td>
                    <td>{player.disconnected ? '⚠️' : '✅'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      {buzzedBy ? <BuzzedModal show={true} buzzedBy={buzzedBy} /> : null}
      <AdminMissingModal show={!adminPresent} />
    </div>
  );
}

export default ClientView;