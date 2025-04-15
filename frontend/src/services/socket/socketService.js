// src/services/socket/socketService.js
import { io } from 'socket.io-client';

const SOCKET_SERVER_URL = import.meta.env.VITE_BACKEND_URL;
let socket = null;
let reconnectTimer = null;
let isInitializing = false;  // Verrou d'initialisation

// Initialiser ou récupérer la socket
export const initializeSocket = (forceNew = false) => {
  if (!forceNew && socket && socket.connected) {
    console.log('Socket déjà connectée avec ID:', socket.id);
    return socket;
  }

  // NOUVEAU: Vérifier si une initialisation est déjà en cours
  if (isInitializing) {
    console.log('Initialisation de socket déjà en cours, attente...');
    return socket; // Retourner la socket actuelle même si non connectée
  }

  isInitializing = true; // Activer le verrou

  // Nettoyer l'ancienne socket si elle existe
  if (socket) {
    console.log('Nettoyage de l\'ancienne socket:', socket.id);
    try {
      socket.disconnect();
    } catch (error) {
      console.error('Erreur lors du nettoyage de la socket:', error);
    }
    socket = null;
  }

  // Créer une nouvelle socket
  socket = io(SOCKET_SERVER_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000
  });

  console.log('Nouvelle socket initialisée');

  socket.on('connect', () => {
    console.log('Socket connectée avec ID:', socket.id);
    clearTimeout(reconnectTimer);
    isInitializing = false; // Désactiver le verrou une fois connecté
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket déconnectée, raison:', reason);
    isInitializing = false; // Désactiver le verrou en cas de déconnexion
    
    if (reason === 'io server disconnect' || reason === 'transport close') {
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          console.log('Tentative de reconnexion manuelle');
          initializeSocket(true);
          reconnectTimer = null;
        }, 2000);
      }
    }
  });

  socket.on('connect_error', (error) => {
    console.error('Erreur de connexion socket:', error);
    isInitializing = false; // Désactiver le verrou en cas d'erreur
  });

  // Timeout de sécurité pour désactiver le verrou
  setTimeout(() => {
    isInitializing = false;
  }, 5000);

  return socket;
};

// Garantir une socket connectée et attendre qu'elle soit réellement prête
export const ensureSocketConnection = () => {
  return new Promise((resolve) => {
    if (socket && socket.connected) {
      console.log('Socket déjà connectée et prête avec ID:', socket.id);
      return resolve(socket);
    }
    
    console.log('Socket non connectée, initialisation forcée');
    const newSocket = initializeSocket(true);
    
    // Si la socket est déjà connectée après initialisation
    if (newSocket.connected) {
      console.log('Socket immédiatement connectée après initialisation:', newSocket.id);
      return resolve(newSocket);
    }
    
    // Attendre que la socket se connecte
    console.log('En attente de la connexion socket...');
    const onConnect = () => {
      console.log('Socket connectée avec succès:', newSocket.id);
      newSocket.off('connect', onConnect);
      resolve(newSocket);
    };
    
    newSocket.on('connect', onConnect);
    
    // Timeout de sécurité (3 secondes)
    setTimeout(() => {
      if (!newSocket.connected) {
        console.warn('Délai d\'attente de connexion dépassé, tentative d\'utilisation de socket non connectée');
      }
      resolve(newSocket);
    }, 3000);
  });
};

export const getSocket = () => {
  if (socket && socket.connected) {
    return socket;
  }
  return initializeSocket();
};

// Création de salle avec logs détaillés et gestion d'erreur
export const createRoom = async (options) => { // Accepter les options en argument
  try {
    const socket = await ensureSocketConnection();

    console.log('Émission de create_room avec options:', options, 'depuis socket ID:', socket.id);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('Timeout lors de la création de salle');
        reject(new Error('Délai de création de salle dépassé'));
      }, 5000);

      // Envoyer les options au backend
      socket.emit('create_room', options, (response) => {
        clearTimeout(timeout);

        if (response && response.error) {
          console.error('Erreur serveur lors de la création de salle:', response.error);
          reject(new Error(response.error));
        } else if (response && response.roomCode) {
          console.log('Salle créée avec code:', response.roomCode, 'Options reçues par serveur:', response.options); // Log options confirmées par serveur si dispo
          resolve(response);
        } else {
          console.error('Réponse invalide de création de salle:', response);
          reject(new Error('Réponse serveur invalide'));
        }
      });
    });
  } catch (error) {
    console.error('Erreur lors de la préparation de la socket pour createRoom:', error);
    throw error; // Rethrow pour que l'appelant puisse gérer
  }
};

// Rejoindre une salle avec logs détaillés
export const joinRoom = async (roomCode, pseudo, isAdmin = false, forceOwnership = false) => {
  try {
    // Vérifier si le joueur a été kické de cette salle
    if (!isAdmin && localStorage.getItem('kicked_from_' + roomCode) === 'true') {
      console.warn(`Tentative rejetée: ${pseudo} a été kické de la salle ${roomCode}`);
      return { error: "Vous avez été expulsé de cette salle par l'admin." };
    }

    const socket = await ensureSocketConnection();
    
    console.log(`Tentative de rejoindre la salle ${roomCode} avec ${pseudo} (Admin: ${isAdmin})`);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('Timeout lors de la jointure de salle');
        reject(new Error('Délai de jointure de salle dépassé'));
      }, 10000);
      
      socket.emit('join_room', { roomCode, pseudo, isAdmin, forceOwnership }, (response) => {
        clearTimeout(timeout);
        
        if (response && response.error) {
          console.error('Erreur serveur lors de la jointure:', response.error);
          reject(new Error(response.error));
        } else if (response && response.closed) {
          // AJOUT: Traiter spécifiquement le cas d'une salle fermée ou inexistante
          reject(new Error("La salle n'existe pas ou a été fermée"));
        } else {
          console.log(`${pseudo} a rejoint la salle ${roomCode} avec succès`);
          resolve(response);
        }
      });
      
      if (isAdmin && forceOwnership) {
        socket.emit('admin_reconnected', { roomCode });
      }
    });
  } catch (error) {
    console.error('Erreur lors de la préparation de la socket pour rejoindre:', error);
    throw error;
  }
};

// Autres fonctions de service
export const leaveRoom = (roomCode, pseudo) => {
  const socket = getSocket();
  socket.emit('leave_room', { roomCode, pseudo });
};

export const closeRoom = (roomCode, saveRoom) => { // Accepter saveRoom en argument
  const socket = getSocket();
  return new Promise((resolve) => {
    console.log(`Émission de close_room pour ${roomCode} avec saveRoom: ${saveRoom}`);
    // Envoyer roomCode et saveRoom au backend
    socket.emit('close_room', { roomCode, saveRoom }, (response) => {
      console.log(`Réponse de close_room pour ${roomCode}:`, response);
      resolve(response);
    });
  });
};

export const buzz = (roomCode, pseudo, callback = () => {}) => {
  const socket = getSocket();
  socket.emit('buzz', { 
    roomCode, 
    pseudo,
    clientTimestamp: Date.now()
  }, callback);
};

export const resetBuzzer = (roomCode) => {
  const socket = getSocket();
  console.log(`Émission de reset_buzzer pour ${roomCode}`);
  socket.emit('reset_buzzer', { roomCode });
};

export const togglePause = (roomCode, pauseState) => {
  const socket = getSocket();
  console.log(`Toggle pause: salle=${roomCode}, état=${pauseState}`);
  
  return new Promise((resolve) => {
    socket.emit('pause_game', { roomCode, pause: pauseState }, (response) => {
      console.log('Réponse du serveur au toggle_pause:', response);
      resolve(response);
    });
  });
};

// src/services/socket/socketService.js
export const kickPlayer = (roomCode, playerId, pseudo = null) => {
  const socket = getSocket();
  return new Promise((resolve) => {
    socket.emit('kick_player', { roomCode, playerId, pseudo }, (response) => {
      resolve(response);
    });
  });
};

// Méthodes directes de socket.io
export const on = (event, callback) => {
  const socket = getSocket();
  socket.on(event, callback);
};

export const off = (event, callback) => {
  if (!socket) return;
  if (callback) {
    socket.off(event, callback);
  } else {
    socket.off(event);
  }
};

export const disconnect = () => {
  if (socket) {
    socket.disconnect();
  }
};

// Centralise l'émission de l'événement de jugement vers le backend
export const judgeResponse = (roomCode, playerId, judgementType) => {
  const socket = getSocket();
  console.log(`Émission de judge_response: room=${roomCode}, player=${playerId}, judgement=${judgementType}`);
  socket.emit('judge_response', {
    roomCode,
    playerId,
    judgment: judgementType // 'correct', 'incorrect', 'correct_title', 'correct_artist', 'correct_both'
  });
};

/**
 * Émet un événement pour ajuster manuellement le score d'un joueur.
 * @param {string} roomCode - Le code de la salle.
 * @param {string} playerId - L'ID du joueur dont le score doit être ajusté.
 * @param {number} adjustment - La valeur à ajouter (positive ou négative) au score.
 */
export const adjustScore = (roomCode, playerId, adjustment) => {
  if (!socket) {
    console.error('Socket non initialisée pour adjustScore');
    return;
  }
  console.log(`[SocketService] Émission adjust_score: room=${roomCode}, player=${playerId}, adjustment=${adjustment}`);
  socket.emit('adjust_score', {
    roomCode,
    playerId,
    adjustment // Envoyer directement l'ajustement numérique
  });
};