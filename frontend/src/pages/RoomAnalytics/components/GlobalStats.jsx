// src/pages/RoomAnalytics/components/GlobalStats.jsx
import React from 'react';
import './GlobalStats.css';

/**
 * Affiche les statistiques globales de la salle
 */
function GlobalStats({ summaryData }) {
  if (!summaryData || !summaryData.stats) {
    return <div className="global-stats__empty">Aucune statistique disponible</div>;
  }

  const { stats } = summaryData;

  const statsCards = [
    {
      icon: '🎯',
      label: 'Total Buzz',
      value: stats.totalBuzzes,
      color: '#2196F3'
    },
    {
      icon: '⚖️',
      label: "Buzz avec égalité",
      value: `${stats.totalWithEquality} (${stats.equalityRate}%)`,
      color: '#FF9800'
    },
    {
      icon: '🎲',
      label: 'Départages aléatoires',
      value: `${stats.totalRandomTiebreak} (${stats.randomTiebreakRate}%)`,
      color: '#9C27B0'
    },
    {
      icon: '⏱️',
      label: 'Période de grâce moy.',
      value: `${stats.avgGracePeriod}ms`,
      color: '#4CAF50'
    },
    {
      icon: '📏',
      label: "Seuil d'égalité moy.",
      value: `${stats.avgEqualityThreshold}ms`,
      color: '#00BCD4'
    },
    {
      icon: '👥',
      label: 'Candidats moy. par buzz',
      value: stats.avgCandidatesPerBuzz,
      color: '#FFC107'
    }
  ];

  return (
    <div className="global-stats">
      <div className="global-stats__grid">
        {statsCards.map((card, index) => (
          <div 
            key={index} 
            className="global-stats__card"
            style={{ borderLeftColor: card.color }}
          >
            <div className="global-stats__card-icon">{card.icon}</div>
            <div className="global-stats__card-content">
              <div className="global-stats__card-label">{card.label}</div>
              <div className="global-stats__card-value">{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      {summaryData.historySize > 0 && (
        <div className="global-stats__info">
          <p>
            📊 Données basées sur les <strong>{summaryData.historySize}</strong> derniers buzz enregistrés
          </p>
        </div>
      )}
    </div>
  );
}

export default GlobalStats;
