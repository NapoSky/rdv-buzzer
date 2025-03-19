// src/components/HomePage.js
import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminAuthContext } from '../../contexts/AdminAuthContext';
import { ThemeContext } from '../../contexts/ThemeContext';
import './HomePage.css';  // Import du CSS local
import { useNotification } from '../../contexts/NotificationContext';

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;

// Modifier cette fonction en dehors du composant HomePage
const checkRoomExists = async (roomCode, error, setRoomCodeFn = null) => {
  try {
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
    const APP_SECRET = import.meta.env.VITE_APP_SECRET;
    
    const response = await fetch(`${BACKEND_URL}/api/rooms/list`, {
      headers: {
        'Authorization': `Bearer ${APP_SECRET}`
      }
    });
    
    if (!response.ok) {
      error('Erreur lors de la vérification de la salle');
      return false;
    }
    
    const rooms = await response.json();
    
    // Vérifier si la salle existe dans la liste
    if (!rooms[roomCode]) {
      error('La salle n\'existe pas');
      localStorage.removeItem('roomCode');
      // Si une fonction setRoomCode est fournie, effacer l'input
      if (setRoomCodeFn) {
        setRoomCodeFn('');
      }
      return false;
    }
    
    return true;
  } catch (err) {
    error('Erreur de connexion au serveur');
    return false;
  }
};

function HomePage({ setActiveRoomCode }) {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const { isAdminAuthenticated, setIsAdminAuthenticated } = useContext(AdminAuthContext);
  const { isDarkMode } = useContext(ThemeContext);
  const { info, warn, error, success } = useNotification();

  // Récupérer les valeurs de roomCode et pseudo depuis le localStorage si le client s'est déjà connecté auparavant
  useEffect(() => {
    const savedRoomCode = localStorage.getItem('roomCode');
    const savedPseudo = localStorage.getItem('pseudo');
    if (savedRoomCode && savedPseudo) {
      setRoomCode(savedRoomCode);
      setPseudo(savedPseudo);
    }
  }, []);

  // Rejoindre en tant que client
  const handleJoinRoom = async () => {
    // Vérifier les champs séparément
    if (!roomCode && !pseudo) {
      info('Le code de la salle et votre pseudo doivent être renseignés.');
      return;
    }
    
    if (!roomCode) {
      info('Veuillez saisir un code de salle.');
      return;
    }
    
    if (!pseudo) {
      info('Veuillez saisir un pseudo.');
      return;
    }
    
    // Vérifier si le joueur a été kické de cette salle auparavant
    const wasKicked = localStorage.getItem('kicked_from_' + roomCode) === 'true';
    
    if (wasKicked) {
      warn('Vous avez été expulsé de cette salle par l\'admin et ne pouvez pas la rejoindre à nouveau.');
      return;
    }

    // Vérifier l'existence de la salle
    const roomExists = await checkRoomExists(roomCode, error, setRoomCode);
    
    if (!roomExists) {
      return;
    }
    
    // La salle existe, on peut continuer
    localStorage.setItem('roomCode', roomCode);
    localStorage.setItem('pseudo', pseudo);
    
    // Si l'on rejoint une salle, on n'est plus admin
    localStorage.removeItem('localAdminAuthenticated');
    
    // Mettre à jour l'état global de la salle active
    setActiveRoomCode(roomCode);
    
    // Rediriger vers la page client
    navigate(`/client?roomCode=${roomCode}&pseudo=${pseudo}`);
  };
  
  // Permettre de revenir dans une salle si les informations sont déjà enregistrées
  const handleRejoinRoom = async () => {
    const savedRoomCode = localStorage.getItem('roomCode');
    const savedPseudo = localStorage.getItem('pseudo');
    
    // Vérifier si l'utilisateur a été kické de cette salle
    const wasKicked = localStorage.getItem('kicked_from_' + savedRoomCode) === 'true';
    
    if (!savedRoomCode || !savedPseudo) {
      error('Pas d\'informations de connexion sauvegardées');
      return;
    }
    
    if (wasKicked) {
      error('Vous avez été expulsé de cette salle par l\'admin.');
      // Nettoyer pour éviter de futurs problèmes
      localStorage.removeItem('roomCode');
      localStorage.removeItem('pseudo');
      return;
    }

    // Vérifier si la salle existe toujours
    const roomExists = await checkRoomExists(savedRoomCode, error, setRoomCode);
    
    if (!roomExists) {
      localStorage.removeItem('roomCode');
      localStorage.removeItem('pseudo');
      return;
    }
    
    // La salle existe, on peut continuer
    setActiveRoomCode(savedRoomCode);
    navigate(`/client?roomCode=${savedRoomCode}&pseudo=${savedPseudo}`);
  };

  // Connexion admin
  const handleAdminLogin = () => {
    if (adminPassword === ADMIN_PASSWORD) {
      localStorage.setItem('localAdminAuthenticated', 'true');
      setIsAdminAuthenticated(true);
      setAdminPassword('');
      success('Connexion admin réussie!');
      // Si on est admin, on n'est plus client
      localStorage.removeItem('roomCode');
      localStorage.removeItem('pseudo');
    } else {
      error('Mot de passe incorrect');
    }
  };

  // Exemple de création de salle (ou navigation vers AdminRoomView)
  const handleCreateRoom = () => {
    if (isAdminAuthenticated) {
      navigate('/admin-room');
    }
  };

  return (
    <div className={`home-container ${isDarkMode ? 'dark-mode' : ''}`}>
      <h1 className="home-title">Prêt(e) pour un blindtest ? 😏</h1>
      
      <div className="card">
        <h2>Rejoindre une salle</h2>
        <div className="form-group">
          <label className="form-label">Code de la salle :</label>
          <input
            type="text"
            className="form-control"
            maxLength={5}  
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Pseudo :</label>
          <input
            type="text"
            placeholder="30 caractères max"  
            className="form-control"
            maxLength={30}  
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
          />
        </div>
        <button 
          className="btn btn-primary" 
          onClick={handleJoinRoom}
        >
          Rejoindre
        </button>
        
        {localStorage.getItem('roomCode') && localStorage.getItem('pseudo') && (
          <button 
            className="btn btn-secondary rejoin-btn" 
            onClick={handleRejoinRoom}
          >
            Revenir dans la salle où j'étais connecté
          </button>
        )}
      </div>

      <div className="card admin-card">
        <h2>La cave du patron</h2>
        {!isAdminAuthenticated ? (
          <div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAdminLogin();
              }}
            >
              <input
                type="text"
                name="username"
                value="admin"
                style={{ display: 'none' }}
                readOnly
                autoComplete="username"
              />
              <input
                type="password"
                placeholder="Mot de passe admin"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="form-control my-2"
                autoComplete="current-password"
              />
              <button type="submit" className="btn btn-secondary">
                Se connecter en tant qu'admin
              </button>
            </form>
          </div>
        ) : (
          <div>
            <p>Vous êtes authentifié en tant qu'admin.</p>
            <button className="btn btn-primary me-2" onClick={handleCreateRoom}>
              Créer une salle
            </button>
          </div>
        )}
      </div>

      <footer className="page-footer">
        {/* Lien Instagram ajouté */}
        <p className={`mb-0 fst-italic ${isDarkMode ? 'text-light-muted' : 'text-muted'}`}>
          Suivez le RDV sur{' '}
          <a
            href="https://www.instagram.com/lerdvlille"
            target="_blank"
            rel="noopener noreferrer"
            className={`${isDarkMode ? 'link-light' : 'link-dark'}`}
          >
            Instagram
            <img 
              src="https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/instagram.png" 
              alt="Instagram icon" 
              style={{ height: '1em', marginLeft: '0.3em' }} 
            />
          </a>
        </p>
        <p className={`mb-0 fst-italic ${isDarkMode ? 'text-light-muted' : 'text-muted'}`}>
          Made with 💖 (and 🍺) by <a 
            href="https://naposky.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className={`${isDarkMode ? 'link-light' : 'link-dark'}`}
          >NapoSky</a>
        </p>
      </footer>
    </div>
  );
}

export default HomePage;
