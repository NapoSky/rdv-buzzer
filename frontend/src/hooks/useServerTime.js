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

  const [isSynced, setIsSynced] = useState(false);
  const [syncQuality, setSyncQuality] = useState(null); // { rtt, accuracy, drift }
  
  // ✅ NOUVEAU SYSTÈME: Référence temporelle injectée par le serveur
  const serverTimeBaseRef = useRef(null);      // Timestamp serveur de référence
  const localTimeAtSyncRef = useRef(null);     // Date.now() au moment de la sync
  const [currentDrift, setCurrentDrift] = useState(0); // Dérive actuelle (pour monitoring)
  
  const rttSamplesRef = useRef([]); // Historique des RTT mesurés
  const syncInProgressRef = useRef(false);
  const syncIntervalRef = useRef(null);
  const initialSyncDoneRef = useRef(false);

  /**
   * Effectue une mesure de synchronisation unique
   * 
   * NOUVEAU: Injection directe du timestamp serveur comme référence
   * 1. t0 = Date.now() (envoi)
   * 2. Serveur répond avec T1 (timestamp serveur)
   * 3. t1 = Date.now() (réception)
   * 4. RTT = t1 - t0
   * 5. Réinjection: serverTimeBase = T1, localTimeAtSync = t1
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
        
        // ✅ RÉINJECTION: Utiliser le timestamp serveur comme nouvelle référence
        // On compense le RTT/2 pour estimer le temps serveur au moment de la réception
        const serverTimeAtReception = T1 + (rtt / 2);
        
        // Calculer la dérive avant réinjection (pour monitoring)
        let drift = 0;
        if (serverTimeBaseRef.current !== null && localTimeAtSyncRef.current !== null) {
          const oldEstimate = serverTimeBaseRef.current + (t1 - localTimeAtSyncRef.current);
          drift = serverTimeAtReception - oldEstimate;
          setCurrentDrift(drift);
        }
        
        // ✅ RÉINJECTER la référence temporelle
        serverTimeBaseRef.current = serverTimeAtReception;
        localTimeAtSyncRef.current = t1;
        
        // Stocker le RTT pour monitoring
        rttSamplesRef.current.push({ rtt, timestamp: Date.now() });
        
        // Garder seulement les 10 dernières mesures
        if (rttSamplesRef.current.length > 10) {
          rttSamplesRef.current.shift();
        }
        
        // Calculer RTT moyen
        const avgRtt = rttSamplesRef.current.reduce((acc, s) => acc + s.rtt, 0) / rttSamplesRef.current.length;
        
        // 📊 Calculer la stabilité du RTT (jitter)
        const rttVariance = rttSamplesRef.current.reduce((acc, s) => 
          acc + Math.pow(s.rtt - avgRtt, 2), 0) / rttSamplesRef.current.length;
        const jitter = Math.sqrt(rttVariance);
        
        // Mettre à jour l'état
        setSyncQuality({ 
          rtt: avgRtt, 
          accuracy: Math.abs(rtt / 2), 
          samples: rttSamplesRef.current.length,
          jitter: jitter,
          drift: drift // Dérive mesurée avant réinjection
        });
        setIsSynced(true);

        
        // Notifier le serveur (pour monitoring backend)
        // Note: On envoie toujours un "offset" de 0 conceptuellement car on réinjecte
        socket.emit('time_sync_offset', { offset: drift, rtt: avgRtt });
                
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
   * NOUVEAU: Basé sur la référence temporelle injectée + delta local
   */
  const getServerTime = useCallback(() => {
    if (!isSynced || serverTimeBaseRef.current === null || localTimeAtSyncRef.current === null) {
      // Si pas encore synchronisé, retourner l'heure locale
      return Date.now();
    }
    // ✅ Temps serveur = Référence injectée + temps écoulé depuis la sync
    return serverTimeBaseRef.current + (Date.now() - localTimeAtSyncRef.current);
  }, [isSynced]);

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
      rttSamplesRef.current = [];
      serverTimeBaseRef.current = null;
      localTimeAtSyncRef.current = null;
      setIsSynced(false);
      setCurrentDrift(0);
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
    timeOffset: currentDrift, // ✅ Maintenant c'est la "dérive" mesurée (proche de 0)
    isSynced,         // true si au moins une sync réussie
    syncQuality,      // { rtt, accuracy, samples, jitter, drift }
    syncNow           // Fonction pour forcer une sync manuelle
  };
}

export default useServerTime;
