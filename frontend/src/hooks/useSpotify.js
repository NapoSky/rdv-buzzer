import { useContext } from 'react';
import { SpotifyContext } from '../contexts/SpotifyContext';

/**
 * Hook personnalisé pour accéder aux fonctionnalités Spotify
 * @returns {Object} Les propriétés et méthodes liées à Spotify
 */
export const useSpotify = () => {
  const spotifyContext = useContext(SpotifyContext);
  
  if (!spotifyContext) {
    throw new Error("useSpotify doit être utilisé à l'intérieur d'un SpotifyProvider");
  }
  
  return {
    // État
    isConnected: spotifyContext.isConnected,
    hasDevices: spotifyContext.hasDevices,
    spotifyUser: spotifyContext.spotifyUser,
    
    // Méthodes
    refreshStatus: spotifyContext.refreshStatus
    
    // Note: Les propriétés et méthodes suivantes ne sont pas actuellement 
    // définies dans SpotifyContext mais pourraient être ajoutées plus tard:
    // - isPlaying, currentTrack
    // - login, logout
    // - playTrack, pauseTrack, etc.
  };
};

export default useSpotify;