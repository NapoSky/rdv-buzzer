// src/components/HomePage.js
import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminAuthContext } from '../../contexts/AdminAuthContext';
import { ThemeContext } from '../../contexts/ThemeContext';
import './HomePage.css';  // Import du CSS local

const ADMIN_PASSWORD = process.env.REACT_APP_ADMIN_PASSWORD;

function HomePage({ setActiveRoomCode }) {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState('');
  const { isAdminAuthenticated, setIsAdminAuthenticated } = useContext(AdminAuthContext);
  const { isDarkMode } = useContext(ThemeContext);

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
  const handleJoinRoom = () => {
    if (roomCode && pseudo) {
      // Vérifier si le joueur a été kické de cette salle auparavant
      const wasKicked = localStorage.getItem('kicked_from_' + roomCode) === 'true';
      
      if (wasKicked) {
        setError('Vous avez été expulsé de cette salle par l\'admin et ne pouvez pas la rejoindre à nouveau.');
        return;
      }
      
      // Le reste du code reste inchangé...
      localStorage.setItem('roomCode', roomCode);
      localStorage.setItem('pseudo', pseudo);
      
      // Si l'on rejoint une salle, on n'est plus admin
      localStorage.removeItem('localAdminAuthenticated');
      
      // Mettre à jour l'état global de la salle active
      setActiveRoomCode(roomCode);
      
      // Rediriger vers la page client
      navigate(`/client?roomCode=${roomCode}&pseudo=${pseudo}`);
    } else {
      setError('Le code de la salle et votre pseudo doivent être renseignés.');
    }
  };
  
  // Permettre de revenir dans une salle si les informations sont déjà enregistrées
  const handleRejoinRoom = () => {
    const savedRoomCode = localStorage.getItem('roomCode');
    const savedPseudo = localStorage.getItem('pseudo');
    
    // Vérifier si l'utilisateur a été kické de cette salle
    const wasKicked = localStorage.getItem('kicked_from_' + savedRoomCode) === 'true';
    
    if (savedRoomCode && savedPseudo && !wasKicked) {
      setActiveRoomCode(savedRoomCode);
      navigate(`/client?roomCode=${savedRoomCode}&pseudo=${savedPseudo}`);
    } else if (wasKicked) {
      setError('Vous avez été expulsé de cette salle par l\'admin.');
      // Nettoyer pour éviter de futurs problèmes
      localStorage.removeItem('roomCode');
      localStorage.removeItem('pseudo');
    }
  };

  // Connexion admin
  const handleAdminLogin = () => {
    if (adminPassword === ADMIN_PASSWORD) {
      localStorage.setItem('localAdminAuthenticated', 'true');
      setIsAdminAuthenticated(true);
      setAdminPassword('');
      setError('');
      // Si on est admin, on n'est plus client
      localStorage.removeItem('roomCode');
      localStorage.removeItem('pseudo');
    } else {
      setError('Mot de passe incorrect');
    }
  };

  // Exemple de création de salle (ou navigation vers AdminRoomView)
  const handleCreateRoom = () => {
    if (isAdminAuthenticated) {
      navigate('/admin-room');
    }
  };

  return (
    <div className={`container ${isDarkMode ? 'dark-mode' : ''}`}>
      <h1 className="mt-3 text-center fst-italic">Prêt(e) pour un blindtest ? 😏</h1>
      
      <div className="card my-3 p-3">
        <h2>Rejoindre une salle</h2>
        <div className="mb-3">
          <label>Code de la salle :</label>
          <input
            type="text"
            className="form-control"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          />
        </div>
        <div className="mb-3">
          <label>Pseudo :</label>
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
            className="btn btn-secondary mt-2" 
            onClick={handleRejoinRoom}
          >
            Revenir dans la salle où j'étais connecté
          </button>
        )}
        
        {/* Affichage de l'erreur */}
        {error && <p className="text-danger mt-2">{error}</p>}
      </div>

      <hr />

      {/* Zone Admin */}
      <div className="card my-3 p-3">
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
            {error && <p className="text-danger mt-2">{error}</p>}
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

      {/* Signature */}
      <footer className="text-center">
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
