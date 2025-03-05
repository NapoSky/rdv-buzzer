// frontend/src/components/SpotifyCallback.js
import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

// Importation de la constante APP_SECRET pour les appels API sécurisés
const APP_SECRET = process.env.REACT_APP_APP_SECRET;
const BASE_URL = process.env.REACT_APP_BACKEND_URL;

function SpotifyCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // roomCode
    
    if (code && state) {
      const redirectPath = localStorage.getItem('spotify_redirect') || '/';
      localStorage.removeItem('spotify_redirect');
      
      // Informer le contexte de l'application que Spotify est connecté
      // Note: Cette partie est facultative, selon votre implémentation
      window.postMessage({ type: 'SPOTIFY_CONNECTED' }, window.location.origin);
      
      // Vérification supplémentaire avec le backend
      fetch(`${BASE_URL}/api/spotify/status/${state}`, {
        headers: { 'Authorization': `Bearer ${APP_SECRET}` }
      })
        .then(response => response.json())
        .then(data => {
          if (data.connected) {
            console.log('Spotify connecté avec succès pour la salle', state);
          } else {
            console.warn('État de connexion Spotify incertain');
          }
          navigate(redirectPath);
        })
        .catch(error => {
          console.error('Erreur lors de la vérification de l\'état Spotify:', error);
          navigate(redirectPath);
        });
    } else {
      navigate('/');
    }
  }, [navigate, searchParams]);

  return (
    <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
      <div className="text-center">
        <h2>Connexion à Spotify réussie</h2>
        <div className="spinner-border text-success" role="status">
          <span className="visually-hidden">Redirection en cours...</span>
        </div>
      </div>
    </div>
  );
}

export default SpotifyCallback;