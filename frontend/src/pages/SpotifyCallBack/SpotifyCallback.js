// frontend/src/components/SpotifyCallback.js
import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

// Importation de la constante APP_SECRET pour les appels API sécurisés
const APP_SECRET = process.env.REACT_APP_APP_SECRET;
const BASE_URL = process.env.REACT_APP_BACKEND_URL;

function SpotifyCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Fonction pour récupérer la valeur d'un cookie par son nom
  const getCookie = (name) => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
    return null;
  };
  
  // Fonction pour supprimer un cookie en utilisant le même domaine
  const deleteCookie = (name) => {
    // Extraire le domaine de base à partir de l'URL frontend
    const url = new URL(window.location.origin);
    
    // Utiliser la même logique d'extraction du domaine que dans handleConnectSpotify
    const domainParts = url.hostname.split('.');
    const baseDomain = domainParts.length >= 2 ?
      domainParts.slice(-(domainParts.length === 2 || domainParts[domainParts.length - 2].length <= 2 ? 2 : 3)).join('.') :
      url.hostname;
    
    // Ne pas ajouter le préfixe "." si on est sur localhost
    const cookieDomain = url.hostname === 'localhost' ? '' : `.${baseDomain}`;
    const cookieOptions = `path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT` + 
                         (cookieDomain ? `; domain=${cookieDomain}` : '');
    
    document.cookie = `${name}=; ${cookieOptions}`;
  };
  
  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // roomCode
    const error = searchParams.get('error');
    
    // Récupérer le chemin de redirection depuis le cookie
    const redirectPath = getCookie('spotify_redirect') || '/';
    console.log('Chemin de redirection récupéré du cookie:', redirectPath);
    
    // Supprimer le cookie de redirection
    deleteCookie('spotify_redirect');
    
    // Si une erreur est présente, rediriger
    if (error) {
      console.error(`Erreur d'authentification Spotify: ${error}`);
      navigate(redirectPath);
      return;
    }
    
    if (code && state) {
      // Informer le contexte de l'application que Spotify est connecté
      window.postMessage({ type: 'SPOTIFY_CONNECTED' }, window.location.origin);
      
      // Vérification avec le backend
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
