// src/pages/RoomAnalytics/components/SyncTable.jsx
import React from 'react';
import './SyncTable.css';

/**
 * Tableau affichant les données de synchronisation des clients
 */
function SyncTable({ syncData }) {
  if (!syncData || !syncData.players || syncData.players.length === 0) {
    return <div className="sync-table__empty">Aucun joueur connecté</div>;
  }

  const getQualityColor = (quality) => {
    switch (quality) {
      case 'excellent': return '#00c851';
      case 'good': return '#4caf50';
      case 'fair': return '#ff9800';
      case 'poor': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  const getQualityLabel = (quality) => {
    switch (quality) {
      case 'excellent': return 'Excellent';
      case 'good': return 'Bon';
      case 'fair': return 'Moyen';
      case 'poor': return 'Mauvais';
      default: return 'Inconnu';
    }
  };

  const formatLatency = (latency) => {
    if (latency === null || latency === undefined) return 'N/A';
    return `${Math.round(latency)}ms`;
  };

  const formatOffset = (offset) => {
    if (offset === null || offset === undefined) return 'N/A';
    return `${offset > 0 ? '+' : ''}${Math.round(offset)}ms`;
  };

  return (
    <div className="sync-table">
      <div className="sync-table__summary">
        <span>Total: {syncData.totalPlayers}</span>
        <span className="sync-table__synced">
          Synchronisés: {syncData.syncedPlayers}/{syncData.totalPlayers}
          ({Math.round((syncData.syncedPlayers / syncData.totalPlayers) * 100)}%)
        </span>
      </div>

      <div className="sync-table__container">
        <table className="sync-table__table">
          <thead>
            <tr>
              <th>Pseudo</th>
              <th>Score</th>
              <th>Sync</th>
              <th>Offset</th>
              <th>Latence moy.</th>
              <th>Jitter</th>
              <th>Samples</th>
              <th>Qualité</th>
            </tr>
          </thead>
          <tbody>
            {syncData.players.map((player) => (
              <tr key={player.socketId} className={!player.isSynced ? 'sync-table__row--unsynced' : ''}>
                <td className="sync-table__pseudo">{player.pseudo}</td>
                <td className="sync-table__score">{player.score}</td>
                <td className="sync-table__sync-status">
                  {player.isSynced ? (
                    <span className="sync-table__badge sync-table__badge--synced">✓ Synced</span>
                  ) : (
                    <span className="sync-table__badge sync-table__badge--unsynced">✗ Non synced</span>
                  )}
                </td>
                <td className="sync-table__offset">{formatOffset(player.timeOffset)}</td>
                <td className="sync-table__latency">{formatLatency(player.averageLatency)}</td>
                <td className="sync-table__jitter">{player.latencyJitter ? `±${player.latencyJitter}ms` : 'N/A'}</td>
                <td className="sync-table__samples">{player.latencySamples}</td>
                <td className="sync-table__quality">
                  <span
                    className="sync-table__quality-badge"
                    style={{ backgroundColor: getQualityColor(player.connectionQuality) }}
                  >
                    {getQualityLabel(player.connectionQuality)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default SyncTable;
