// frontend/src/contexts/SpotifyContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import { isSpotifyAuthenticated, getAvailableDevices } from '../services/api/spotifyService';

const SpotifyContext = createContext();

export const SpotifyProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false); // Initialiser à false par défaut
  const [hasDevices, setHasDevices] = useState(false);
  const [spotifyUser, setSpotifyUser] = useState(null);

  const refreshStatus = async () => {
    try {
      const roomCode = new URLSearchParams(window.location.search).get('roomCode');
      
      if (roomCode) {
        const connected = await isSpotifyAuthenticated();
        setIsConnected(connected);
        
        if (connected) {
          try {
            setHasDevices(true); // Simplifier pour éviter l'erreur
          } catch (error) {
            console.error("Erreur lors de la vérification des appareils:", error);
          }
        } else {
          setSpotifyUser(null);
        }
        
        return connected;
      }
      return false;
    } catch (error) {
      console.error("Erreur lors du rafraîchissement du statut:", error);
      return false;
    }
  };

  // Effet initial pour vérifier le statut
  useEffect(() => {
    refreshStatus();
    
    // Écouter les événements socket pour les mises à jour de statut
    const messageHandler = (event) => {
      if (event.origin === window.location.origin && 
          event.data && 
          event.data.type === 'SPOTIFY_CONNECTED') {
        refreshStatus(); // Actualiser l'état plutôt que de simplement setter à true
      }
    };
    
    window.addEventListener('message', messageHandler);
    return () => window.removeEventListener('message', messageHandler);
  }, []);

  return (
    <SpotifyContext.Provider value={{ 
      isConnected, 
      hasDevices,
      spotifyUser,
      refreshStatus
    }}>
      {children}
    </SpotifyContext.Provider>
  );
};

export { SpotifyContext };