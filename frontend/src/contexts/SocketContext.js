// src/contexts/SocketContext.js
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

  useEffect(() => {
    // Utiliser l'instance existante au lieu d'en créer une nouvelle
    const socket = getSocket();  // Utilisez getSocket() au lieu de initializeSocket()
    setSocket(socket);
    
    // Mettre à jour l'état de connexion initial
    if (socket.connected) {
      setIsConnected(true);
    }

    const onConnectHandler = () => {
      console.log('SocketContext: connecté', socket.id);
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
    };

    const onDisconnectHandler = (reason) => {
      console.log('SocketContext: déconnecté', reason);
      setDisconnectionTime(Date.now());
      setIsConnected(false);
      
      try {
        localStorage.setItem('socket_connected', 'false');
      } catch (error) {
        console.warn('SocketContext: Impossible d\'accéder au localStorage:', error);
      }
    };

    const onReconnectHandler = (attempt) => {
      console.log('SocketContext: reconnecté après', attempt, 'tentatives');
      setIsConnected(true);
    };

    const onReconnectAttemptHandler = (attempt) => {
      console.log('SocketContext: tentative de reconnexion', attempt);
    };

    const onConnectErrorHandler = (err) => {
      console.error('SocketContext: erreur de connexion', err);
      setSocketError(err.message || 'Erreur de connexion au serveur');
      setTimeout(() => setSocketError(null), 5000);
    };

    const onReconnectFailedHandler = () => {
      console.error('SocketContext: échec des tentatives de reconnexion');
      setFailedReconnectAttempts(prev => prev + 1);
      setSocketError('Impossible de se reconnecter au serveur après plusieurs tentatives.');
    };

    on('connect', onConnectHandler);
    on('disconnect', onDisconnectHandler);
    on('reconnect', onReconnectHandler);
    on('reconnect_attempt', onReconnectAttemptHandler);
    on('connect_error', onConnectErrorHandler);
    on('reconnect_failed', onReconnectFailedHandler);

    const pingInterval = setInterval(() => {
      if (isConnected && socket.connected) {
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
    }, 30000); 

    return () => {
      clearInterval(pingInterval);
      off('connect', onConnectHandler);
      off('disconnect', onDisconnectHandler);
      off('reconnect', onReconnectHandler);
      off('reconnect_attempt', onReconnectAttemptHandler);
      off('connect_error', onConnectErrorHandler);
      off('reconnect_failed', onReconnectFailedHandler);
      
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