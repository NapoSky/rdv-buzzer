// src/contexts/SocketContext.js
import React, { createContext, useContext, useEffect, useState, useCallback, useEffectEvent } from 'react';
import { 
  getSocket, 
  initializeSocket, 
  on, 
  off, 
  disconnect 
} from '../services/socket/socketService';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [socketError, setSocketError] = useState(null);
  const [disconnectionTime, setDisconnectionTime] = useState(null);
  const [failedReconnectAttempts, setFailedReconnectAttempts] = useState(0);
  const [lastPongTime, setLastPongTime] = useState(Date.now());

  // ===== EFFECT EVENTS - Handlers qui lisent les states sans créer de dépendances =====
  const onConnect = useEffectEvent(() => {
    console.log('SocketContext: connecté', socket?.id);
    setIsConnected(true);
    
    try {
      localStorage.setItem('socket_connected', 'true');
    } catch (error) {
      console.warn('SocketContext: Impossible d\'accéder au localStorage:', error);
    }
    
    if (disconnectionTime) {
      const downtime = (Date.now() - disconnectionTime) / 1000;
      if (downtime > 10) {
        console.log(`Reconnecté après ${downtime.toFixed(1)}s de déconnexion`);
      }
      setDisconnectionTime(null);
    }
    
    document.dispatchEvent(new CustomEvent('socket:reconnected', {
      detail: { downtime: disconnectionTime ? (Date.now() - disconnectionTime) / 1000 : 0 }
    }));
  });

  const onDisconnect = useEffectEvent((reason) => {
    console.log('SocketContext: déconnecté', reason);
    setDisconnectionTime(Date.now());
    setIsConnected(false);
    
    try {
      localStorage.setItem('socket_connected', 'false');
    } catch (error) {
      console.warn('SocketContext: Impossible d\'accéder au localStorage:', error);
    }
  });

  const onReconnect = useEffectEvent((attempt) => {
    console.log('SocketContext: reconnecté après', attempt, 'tentatives');
    setIsConnected(true);
  });

  const onReconnectAttempt = useEffectEvent((attempt) => {
    console.log('SocketContext: tentative de reconnexion', attempt);
  });

  const onConnectError = useEffectEvent((err) => {
    console.error('SocketContext: erreur de connexion', err);
    setSocketError(err.message || 'Erreur de connexion au serveur');
    setTimeout(() => setSocketError(null), 5000);
  });

  const onReconnectFailed = useEffectEvent(() => {
    console.error('SocketContext: échec des tentatives de reconnexion');
    setFailedReconnectAttempts(prev => prev + 1);
    setSocketError('Impossible de se reconnecter au serveur après plusieurs tentatives.');
  });

  const onPingCheck = useEffectEvent(() => {
    if (isConnected && socket?.connected) {
      socket.emit('ping', { clientTime: Date.now() }, (response) => {
        if (response) {
          setLastPongTime(Date.now());
        }
      });
      
      const timeSinceLastPong = Date.now() - lastPongTime;
      if (timeSinceLastPong > 60000) {
        console.warn('SocketContext: connexion suspecte, pas de pong depuis', 
                   (timeSinceLastPong/1000).toFixed(1), 'secondes');
        
        socket.emit('ping', { clientTime: Date.now() }, (response) => {
          if (!response) {
            console.log('Reconnexion nécessaire après échec du ping de vérification');
            socket.disconnect().connect();
          } else {
            console.log('La connexion fonctionne malgré le délai long');
            setLastPongTime(Date.now());
          }
        });
      }
    }
  });

  useEffect(() => {
    // Utiliser l'instance existante au lieu d'en créer une nouvelle
    const socket = getSocket();  // Utilisez getSocket() au lieu de initializeSocket()
    setSocket(socket);
    
    // Mettre à jour l'état de connexion initial
    if (socket.connected) {
      setIsConnected(true);
    }

    // Enregistrer les handlers (qui sont maintenant des Effect Events stables)
    on('connect', onConnect);
    on('disconnect', onDisconnect);
    on('reconnect', onReconnect);
    on('reconnect_attempt', onReconnectAttempt);
    on('connect_error', onConnectError);
    on('reconnect_failed', onReconnectFailed);

    // Intervalle de ping avec Effect Event
    const pingInterval = setInterval(onPingCheck, 10000);

    return () => {
      clearInterval(pingInterval);
      off('connect', onConnect);
      off('disconnect', onDisconnect);
      off('reconnect', onReconnect);
      off('reconnect_attempt', onReconnectAttempt);
      off('connect_error', onConnectError);
      off('reconnect_failed', onReconnectFailed);
      
      // Ne pas fermer la socket ici, car elle est gérée par le service
      console.log('SocketContext: nettoyage des écouteurs');
    };
  }, []);

  const forceReconnect = useCallback(() => {
    if (socket) {
      console.log('SocketContext: tentative de reconnexion forcée');
      socket.disconnect().connect();
    }
  }, [socket]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, socketError, forceReconnect }}>
      {children}
    </SocketContext.Provider>
  );
};

export { SocketContext };