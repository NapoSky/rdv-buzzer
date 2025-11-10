// src/services/api/analyticsApi.js

const BASE_URL = import.meta.env.VITE_BACKEND_URL;
const APP_SECRET = import.meta.env.VITE_APP_SECRET;

/**
 * Service API pour les analytics de salle
 * Toutes les requêtes sont protégées (admin uniquement)
 */

const getAuthHeaders = () => {
  return {
    'Authorization': `Bearer ${APP_SECRET}`,
    'Content-Type': 'application/json'
  };
};

/**
 * Récupère toutes les analytics d'une salle (combiné)
 */
export const getFullAnalytics = async (roomCode) => {
  const response = await fetch(`${BASE_URL}/api/admin/rooms/${roomCode}/analytics`, {
    method: 'GET',
    headers: getAuthHeaders()
  });

  if (!response.ok) {
    throw new Error('Erreur lors de la récupération des analytics');
  }

  return response.json();
};

/**
 * Récupère les données de synchronisation des clients
 */
export const getSyncAnalytics = async (roomCode) => {
  const response = await fetch(`${BASE_URL}/api/admin/rooms/${roomCode}/analytics/sync`, {
    method: 'GET',
    headers: getAuthHeaders()
  });

  if (!response.ok) {
    throw new Error('Erreur lors de la récupération des données de synchronisation');
  }

  return response.json();
};

/**
 * Récupère l'historique des buzz
 */
export const getBuzzHistory = async (roomCode, limit = 50) => {
  const response = await fetch(`${BASE_URL}/api/admin/rooms/${roomCode}/analytics/buzz-history?limit=${limit}`, {
    method: 'GET',
    headers: getAuthHeaders()
  });

  if (!response.ok) {
    throw new Error('Erreur lors de la récupération de l\'historique des buzz');
  }

  return response.json();
};

/**
 * Récupère le résumé statistique
 */
export const getStatsSummary = async (roomCode) => {
  const response = await fetch(`${BASE_URL}/api/admin/rooms/${roomCode}/analytics/summary`, {
    method: 'GET',
    headers: getAuthHeaders()
  });

  if (!response.ok) {
    throw new Error('Erreur lors de la récupération du résumé statistique');
  }

  return response.json();
};
