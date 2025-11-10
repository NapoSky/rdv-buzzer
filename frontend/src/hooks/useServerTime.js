import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../services/socket/socketService';

/**
 * Hook personnalisé pour la synchronisation temporelle client-serveur
 * 
 * Résout le problème des horloges client désynchronisées en maintenant
 * un offset calculé entre l'horloge locale et l'horloge serveur.
 * 
 * Utilisation :
 * const { getServerTime, timeOffset, isSynced } = useServerTime();
 * const serverTimestamp = getServerTime(); // Au lieu de Date.now()
 * 
 * @param {object} options - Options de configuration
 * @param {number} options.syncInterval - Intervalle de resynchronisation (ms), défaut 30000
 * @param {number} options.initialSyncCount - Nombre de syncs initiaux, défaut 3
 * @param {boolean} options.enabled - Activer/désactiver la sync, défaut true
 * @returns {object} - { getServerTime, timeOffset, isSynced, syncNow }
 */
export function useServerTime(options = {}) {
  const {
    syncInterval = 10000, // Resync toutes les 10 secondes
    initialSyncCount = 3, // 3 mesures initiales pour stabiliser
    enabled = true
  } = options;

  const [timeOffset, setTimeOffset] = useState(0); // Offset en ms (serveur - client)
  const [isSynced, setIsSynced] = useState(false);
  const [syncQuality, setSyncQuality] = useState(null); // { rtt, accuracy }
  
  const offsetSamplesRef = useRef([]); // Historique des offsets mesurés
  const syncInProgressRef = useRef(false);
  const syncIntervalRef = useRef(null);
  const initialSyncDoneRef = useRef(false);

  /**
   * Effectue une mesure de synchronisation unique
   * 
   * Algorithme NTP simplifié :
   * 1. t0 = Date.now() (envoi)
   * 2. Serveur répond avec T1 (timestamp serveur)
   * 3. t1 = Date.now() (réception)
   * 4. RTT = t1 - t0
   * 5. Offset = T1 - (t0 + RTT/2)
   */
  const performSync = useCallback(async () => {
    if (syncInProgressRef.current || !enabled) return;
    
    syncInProgressRef.current = true;
    const socket = getSocket();
    
    if (!socket || !socket.connected) {
      //console.warn('[useServerTime] Socket non connecté, synchronisation impossible');
      syncInProgressRef.current = false;
      return;
    }

    try {
      const t0 = Date.now(); // Timestamp client avant envoi
      
      socket.emit('time_sync', t0, (response) => {
        const t1 = Date.now(); // Timestamp client après réception
        
        if (!response || !response.serverTimestamp) {
          //console.error('[useServerTime] Réponse invalide du serveur:', response);
          syncInProgressRef.current = false;
          return;
        }
        
        const T1 = response.serverTimestamp; // Timestamp serveur
        const rtt = t1 - t0; // Round-trip time
        
        // Ignorer les mesures avec RTT trop élevé (connexion instable)
        if (rtt > 1000) {
          //console.warn('[useServerTime] RTT trop élevé, mesure ignorée:', rtt);
          syncInProgressRef.current = false;
          return;
        }
        
        // Calculer l'offset : temps serveur - temps client estimé au moment de la réponse serveur
        // On estime que le serveur a répondu au milieu du RTT
        const estimatedClientTimeAtServer = t0 + (rtt / 2);
        const offset = T1 - estimatedClientTimeAtServer;
        
        // Stocker la mesure
        offsetSamplesRef.current.push({ offset, rtt, timestamp: Date.now() });
        
        // Garder seulement les 10 dernières mesures
        if (offsetSamplesRef.current.length > 10) {
          offsetSamplesRef.current.shift();
        }
        
        // Calculer l'offset médian (plus robuste que la moyenne)
        const offsets = offsetSamplesRef.current.map(s => s.offset);
        offsets.sort((a, b) => a - b);
        const medianOffset = offsets[Math.floor(offsets.length / 2)];
        
        // Calculer RTT moyen
        const avgRtt = offsetSamplesRef.current.reduce((acc, s) => acc + s.rtt, 0) / offsetSamplesRef.current.length;
        
        // Mettre à jour l'état
        setTimeOffset(medianOffset);
        setSyncQuality({ rtt: avgRtt, accuracy: Math.abs(rtt / 2), samples: offsets.length });
        setIsSynced(true);
        
        // Notifier le serveur de l'offset calculé pour monitoring
        socket.emit('time_sync_offset', { offset: medianOffset, rtt: avgRtt });
                
        syncInProgressRef.current = false;
      });
      
      // Timeout de sécurité
      setTimeout(() => {
        if (syncInProgressRef.current) {
          //console.warn('[useServerTime] Timeout de synchronisation');
          syncInProgressRef.current = false;
        }
      }, 5000);
      
    } catch (error) {
      //console.error('[useServerTime] Erreur lors de la synchronisation:', error);
      syncInProgressRef.current = false;
    }
  }, [enabled]);

  /**
   * Effectue une synchronisation manuelle immédiate
   */
  const syncNow = useCallback(() => {
    //console.log('[useServerTime] Synchronisation manuelle déclenchée');
    performSync();
  }, [performSync]);

  /**
   * Retourne le timestamp serveur actuel
   * C'est cette fonction qui doit être utilisée partout à la place de Date.now()
   */
  const getServerTime = useCallback(() => {
    if (!isSynced) {
      // Si pas encore synchronisé, retourner l'heure locale
      // (ou on pourrait lancer une exception selon les besoins)
      return Date.now();
    }
    return Date.now() + timeOffset;
  }, [timeOffset, isSynced]);

  // Effet : Synchronisation initiale et périodique
  useEffect(() => {
    if (!enabled) return;

    const socket = getSocket();
    if (!socket) {
      //console.warn('[useServerTime] Socket non disponible');
      return;
    }

    // Fonction pour effectuer les syncs initiaux
    const performInitialSync = async () => {
      if (initialSyncDoneRef.current) return;
      
      //console.log(`[useServerTime] Démarrage synchronisation initiale (${initialSyncCount} mesures)`);
      
      for (let i = 0; i < initialSyncCount; i++) {
        await performSync();
        // Attendre un peu entre chaque mesure
        if (i < initialSyncCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      initialSyncDoneRef.current = true;
      //console.log('[useServerTime] Synchronisation initiale terminée');
    };

    // Lancer la sync initiale dès que le socket est connecté
    if (socket.connected) {
      performInitialSync();
    }

    // Écouter la connexion/reconnexion
    const onConnect = () => {
      //console.log('[useServerTime] Socket connecté, resynchronisation');
      initialSyncDoneRef.current = false;
      offsetSamplesRef.current = [];
      setIsSynced(false);
      performInitialSync();
    };

    socket.on('connect', onConnect);

    // Synchronisation périodique
    syncIntervalRef.current = setInterval(() => {
      if (socket.connected && initialSyncDoneRef.current) {
        performSync();
      }
    }, syncInterval);

    // Nettoyage
    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
      socket.off('connect', onConnect);
    };
  }, [enabled, syncInterval, initialSyncCount, performSync]);

  return {
    getServerTime,    // Fonction principale : remplace Date.now()
    timeOffset,       // Offset actuel (ms)
    isSynced,         // true si au moins une sync réussie
    syncQuality,      // { rtt, accuracy, samples }
    syncNow           // Fonction pour forcer une sync manuelle
  };
}

export default useServerTime;
