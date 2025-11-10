import React, { createContext, useContext, useEffect } from 'react';
import { useServerTime } from '../hooks/useServerTime';
import { setGetServerTime } from '../services/socket/serverTimeManager';

/**
 * Contexte de synchronisation temporelle
 * 
 * Fournit la fonction getServerTime() à toute l'application
 * pour remplacer les appels à Date.now()
 */
const ServerTimeContext = createContext(null);

/**
 * Provider de synchronisation temporelle
 * À placer en haut de l'arborescence de composants
 */
export function ServerTimeProvider({ children }) {
  const serverTimeAPI = useServerTime({
    syncInterval: 30000,      // Resync toutes les 30s
    initialSyncCount: 3,      // 3 mesures initiales
    enabled: true
  });

  // Mettre à jour le singleton à chaque changement
  useEffect(() => {
    setGetServerTime(
      serverTimeAPI.getServerTime,
      serverTimeAPI.timeOffset,
      serverTimeAPI.isSynced
    );
  }, [serverTimeAPI.getServerTime, serverTimeAPI.timeOffset, serverTimeAPI.isSynced]);

  return (
    <ServerTimeContext.Provider value={serverTimeAPI}>
      {children}
    </ServerTimeContext.Provider>
  );
}

/**
 * Hook pour accéder au temps serveur synchronisé
 * 
 * @returns {object} - { getServerTime, timeOffset, isSynced, syncQuality, syncNow }
 */
export function useServerTimeContext() {
  const context = useContext(ServerTimeContext);
  
  if (!context) {
    console.warn('[useServerTimeContext] Contexte non disponible, utilisation de Date.now() par défaut');
    // Fallback si le contexte n'est pas disponible
    return {
      getServerTime: () => Date.now(),
      timeOffset: 0,
      isSynced: false,
      syncQuality: null,
      syncNow: () => {}
    };
  }
  
  return context;
}

export default ServerTimeContext;
