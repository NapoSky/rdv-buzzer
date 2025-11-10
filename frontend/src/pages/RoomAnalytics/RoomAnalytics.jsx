// src/pages/RoomAnalytics/RoomAnalytics.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFullAnalytics } from '../../services/api/analyticsApi';
import SyncTable from './components/SyncTable';
import BuzzHistoryTimeline from './components/BuzzHistoryTimeline';
import GlobalStats from './components/GlobalStats';
import './RoomAnalytics.css';

/**
 * Page d'analytics pour une salle
 * Affiche les données de synchronisation, l'historique des buzz et les statistiques
 */
function RoomAnalytics() {
  const { roomCode } = useParams();
  const navigate = useNavigate();

  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fonction pour charger les analytics
  const loadAnalytics = useCallback(async () => {
    try {
      setRefreshing(true);
      const data = await getFullAnalytics(roomCode);
      setAnalytics(data);
      setError(null);
    } catch (err) {
      console.error('Erreur chargement analytics:', err);
      setError(err.response?.data?.error || 'Erreur lors du chargement des analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [roomCode]);

  // Chargement initial
  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // Auto-refresh toutes les 5 secondes
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadAnalytics();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh, loadAnalytics]);

  const handleBackClick = () => {
    navigate('/admin');
  };

  const handleRefreshClick = () => {
    if (!refreshing) {
      loadAnalytics();
    }
  };

  if (loading) {
    return (
      <div className="room-analytics">
        <div className="room-analytics__loading">
          Chargement des analytics...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="room-analytics">
        <div className="room-analytics__error">
          ❌ {error}
        </div>
        <button onClick={handleBackClick} className="room-analytics__back-btn">
          Retour au panneau admin
        </button>
      </div>
    );
  }

  return (
    <div className="room-analytics">
      <div className="room-analytics__header">
        <div>
          <h1 className="room-analytics__title">
            Analytics de la salle{' '}
            <span className="room-analytics__room-code">{roomCode}</span>
          </h1>
        </div>
        <button onClick={handleBackClick} className="room-analytics__back-btn">
          ← Retour
        </button>
      </div>

      <div className="room-analytics__refresh">
        <div className="room-analytics__auto-refresh">
          <input
            type="checkbox"
            id="auto-refresh"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          <label htmlFor="auto-refresh">
            Actualisation automatique (5s)
          </label>
        </div>
        <button
          onClick={handleRefreshClick}
          className="room-analytics__refresh-btn"
          disabled={refreshing}
        >
          {refreshing ? '⟳ Actualisation...' : '🔄 Actualiser'}
        </button>
      </div>

      <div className="room-analytics__content">
        {/* Section 1: Synchronisation clients */}
        <div className="room-analytics__section">
          <h2 className="room-analytics__section-title">
            <span className="room-analytics__section-icon">📡</span>
            Synchronisation des clients
          </h2>
          <SyncTable syncData={analytics?.sync} />
        </div>

        {/* Section 2: Statistiques globales */}
        <div className="room-analytics__section">
          <h2 className="room-analytics__section-title">
            <span className="room-analytics__section-icon">📊</span>
            Statistiques globales
          </h2>
          <GlobalStats summaryData={analytics?.summary} />
        </div>

        {/* Section 3: Historique des buzz */}
        <div className="room-analytics__section">
          <h2 className="room-analytics__section-title">
            <span className="room-analytics__section-icon">⏱️</span>
            Historique des buzz
          </h2>
          <BuzzHistoryTimeline historyData={analytics?.history} />
        </div>
      </div>
    </div>
  );
}

export default RoomAnalytics;
