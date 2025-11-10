// src/pages/RoomAnalytics/components/BuzzHistoryTimeline.jsx
import React, { useState } from 'react';
import './BuzzHistoryTimeline.css';

/**
 * Timeline affichant l'historique des buzz events
 */
function BuzzHistoryTimeline({ historyData }) {
  const [expandedEvent, setExpandedEvent] = useState(null);

  if (!historyData || !historyData.events || historyData.events.length === 0) {
    return <div className="buzz-timeline__empty">Aucun buzz enregistré pour le moment</div>;
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const formatTimeDelta = (delta) => {
    if (delta === 0) return '0ms (Gagnant)';
    return `+${Math.round(delta)}ms`;
  };

  const getVerdictBadge = (verdict) => {
    const badges = {
      'correct': { label: '✓ Correct', class: 'correct' },
      'correct_artist': { label: '✓ Artiste', class: 'correct' },
      'correct_title': { label: '✓ Titre', class: 'correct' },
      'correct_both': { label: '✓✓ Complet', class: 'correct-full' },
      'all_good': { label: '✓✓ Parfait', class: 'correct-full' },
      'incorrect': { label: '✗ Incorrect', class: 'incorrect' },
      'skipped': { label: '⏭ Passé', class: 'skipped' },
      'pending': { label: '⏭ Passé/En attente', class: 'skipped' }
    };
    return badges[verdict] || badges.pending;
  };

  const toggleExpand = (index) => {
    setExpandedEvent(expandedEvent === index ? null : index);
  };

  return (
    <div className="buzz-timeline">
      <div className="buzz-timeline__header">
        <span>Total d'events: {historyData.totalEvents}</span>
        <span>Affichés: {historyData.events.length}</span>
      </div>

      <div className="buzz-timeline__list">
        {historyData.events.map((event, index) => (
          <div key={index} className="buzz-timeline__event">
            <div 
              className="buzz-timeline__event-header"
              onClick={() => toggleExpand(index)}
            >
              <div className="buzz-timeline__event-info">
                <span className="buzz-timeline__event-time">{formatTime(event.timestamp)}</span>
                <span className="buzz-timeline__event-winner">🏆 {event.winner}</span>
                {event.verdict && (() => {
                  const verdictInfo = getVerdictBadge(event.verdict);
                  return <span className={`buzz-timeline__badge buzz-timeline__badge--${verdictInfo.class}`}>{verdictInfo.label}</span>;
                })()}
                {event.hadEquality && <span className="buzz-timeline__badge buzz-timeline__badge--equality">Égalité</span>}
                {event.hadRandomTiebreak && <span className="buzz-timeline__badge buzz-timeline__badge--random">Départage aléatoire</span>}
              </div>
              <div className="buzz-timeline__event-meta">
                <span>Grace: {Math.round(event.gracePeriod)}ms</span>
                <span>Candidats: {event.totalCandidates}</span>
                <span>Synced: {event.syncedCount}/{event.totalCandidates}</span>
                <span className="buzz-timeline__expand-icon">
                  {expandedEvent === index ? '▼' : '▶'}
                </span>
              </div>
            </div>

            {expandedEvent === index && (
              <div className="buzz-timeline__event-details">
                <div className="buzz-timeline__detail-row">
                  <strong>Période de grâce:</strong> {Math.round(event.gracePeriod)}ms
                </div>
                <div className="buzz-timeline__detail-row">
                  <strong>Seuil d'égalité:</strong> {Math.round(event.equalityThreshold)}ms
                </div>

                <div className="buzz-timeline__candidates">
                  <h4>Candidats ({event.candidates.length}):</h4>
                  <table className="buzz-timeline__candidates-table">
                    <thead>
                      <tr>
                        <th>Pos</th>
                        <th>Pseudo</th>
                        <th>Delta</th>
                        <th>Latence</th>
                        <th>Sync</th>
                      </tr>
                    </thead>
                    <tbody>
                      {event.candidates.map((candidate, idx) => (
                        <tr 
                          key={idx}
                          className={idx === 0 ? 'buzz-timeline__candidate--winner' : ''}
                        >
                          <td>{idx + 1}</td>
                          <td>
                            {candidate.pseudo}
                            {idx === 0 && ' 🏆'}
                            {candidate.wasEqual && ' ≈'}
                          </td>
                          <td className="buzz-timeline__mono buzz-timeline__delta">
                            {formatTimeDelta(candidate.delta)}
                          </td>
                          <td className="buzz-timeline__mono">{Math.round(candidate.latency)}ms</td>
                          <td>
                            {candidate.isSynced ? (
                              <span className="buzz-timeline__sync-badge buzz-timeline__sync-badge--yes">✓</span>
                            ) : (
                              <span className="buzz-timeline__sync-badge buzz-timeline__sync-badge--no">✗</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default BuzzHistoryTimeline;
