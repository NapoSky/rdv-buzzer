import React, { useEffect, useState } from 'react';
import { useServerTimeContext } from '../../../contexts/ServerTimeContext';
import { ExclamationTriangleIcon } from '@radix-ui/react-icons';
import './TimeSyncWarning.css';

/**
 * Composant d'alerte pour les dérives temporelles importantes
 * Affiche un avertissement si l'horloge du client est significativement désynchronisée
 */
function TimeSyncWarning() {
  const { timeOffset, isSynced } = useServerTimeContext();
  const [showWarning, setShowWarning] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isSynced) {
      setShowWarning(false);
      return;
    }

    // Afficher l'alerte si offset > 5 secondes
    const hasSignificantDrift = Math.abs(timeOffset) > 5000;
    
    if (hasSignificantDrift && !dismissed) {
      setShowWarning(true);
      console.warn('⚠️ [TimeSyncWarning] Dérive temporelle importante détectée:', {
        offsetMs: timeOffset,
        offsetSeconds: (timeOffset / 1000).toFixed(2)
      });
    } else if (!hasSignificantDrift) {
      setShowWarning(false);
      setDismissed(false); // Réinitialiser si la sync redevient bonne
    }
  }, [timeOffset, isSynced, dismissed]);

  if (!showWarning) {
    return null;
  }

  const offsetSeconds = (timeOffset / 1000).toFixed(2);
  const isAhead = timeOffset > 0;

  return (
    <div className="time-sync-warning">
      <div className="warning-content">
        <ExclamationTriangleIcon className="warning-icon" />
        <div className="warning-text">
          <div className="warning-title">⏰ Horloge désynchronisée</div>
          <div className="warning-description">
            Votre horloge système est {isAhead ? 'en avance' : 'en retard'} de{' '}
            <strong>{Math.abs(offsetSeconds)}s</strong>. Cela peut affecter la précision des buzzers.
            Nous compensons automatiquement cette différence.
          </div>
        </div>
        <button 
          className="warning-dismiss"
          onClick={() => setDismissed(true)}
          aria-label="Fermer l'alerte"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default TimeSyncWarning;
