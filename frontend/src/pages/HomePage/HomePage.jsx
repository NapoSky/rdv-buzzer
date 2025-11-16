// src/components/HomePage.js
import React, { useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog'
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
  const [roomExists, setRoomExists] = useState(null); // null, true, false
  const [checkingRoom, setCheckingRoom] = useState(false);
  const { isAdminAuthenticated, setIsAdminAuthenticated } = useContext(AdminAuthContext);
  const { isDarkMode } = useContext(ThemeContext);
  const { info, warn, error, success } = useNotification();
  const [showCreateRoomDialog, setShowCreateRoomDialog] = useState(false);
  const [roomOptions, setRoomOptions] = useState({
    roomType: 'Standard',
    pointsCorrect: 10,
    pointsWrong: 9,
    penaltyDelay: 5,
    saveRoom: true,
  });

  // Fonction pour vérifier l'existence de la salle en temps réel
  const checkRoomExistsRealTime = async (code) => {
    if (!code || code.length < 5) {
      setRoomExists(null);
      return;
    }

    setCheckingRoom(true);
    
    try {
      const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
      const APP_SECRET = import.meta.env.VITE_APP_SECRET;
      
      const response = await fetch(`${BACKEND_URL}/api/rooms/list`, {
        headers: {
          'Authorization': `Bearer ${APP_SECRET}`
        }
      });
      
      if (!response.ok) {
        setRoomExists(false);
        return;
      }
      
      const rooms = await response.json();
      setRoomExists(!!rooms[code]);
      
    } catch (err) {
      setRoomExists(false);
    } finally {
      setCheckingRoom(false);
    }
  };

  // Debounce pour éviter trop de requêtes
  useEffect(() => {
    const timer = setTimeout(() => {
      checkRoomExistsRealTime(roomCode);
    }, 500); // Attendre 500ms après la dernière frappe

    return () => clearTimeout(timer);
  }, [roomCode]);

  // Récupérer les valeurs de roomCode et pseudo depuis le localStorage si le client s'est déjà connecté auparavant
  useEffect(() => {
    const savedRoomCode = localStorage.getItem('roomCode');
    const savedPseudo = localStorage.getItem('pseudo');

    // Restaurer le pseudo s'il existe
    if (savedPseudo) {
      setPseudo(savedPseudo);
    }

    // Restaurer le code de la salle s'il existe (optionnel, mais conserve la logique précédente pour le code)
    // Si vous voulez que le code de la salle soit aussi restauré indépendamment,
    // déplacez cette ligne en dehors du 'if (savedPseudo)'
    if (savedRoomCode) {
       setRoomCode(savedRoomCode);
    }
    // L'ancien code qui nécessitait les deux :
    // if (savedRoomCode && savedPseudo) {
    //   setRoomCode(savedRoomCode);
    //   setPseudo(savedPseudo);
    // }
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
    navigate(`/client?roomCode=${encodeURIComponent(roomCode)}&pseudo=${encodeURIComponent(pseudo)}`);
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
      return;
    }

    // Vérifier si la salle existe toujours
    const roomExists = await checkRoomExists(savedRoomCode, error, setRoomCode);
    
    if (!roomExists) {
      localStorage.removeItem('roomCode');
      return;
    }
    
    // La salle existe, on peut continuer
    setActiveRoomCode(savedRoomCode);
    navigate(`/client?roomCode=${encodeURIComponent(savedRoomCode)}&pseudo=${encodeURIComponent(savedPseudo)}`);
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
      setShowCreateRoomDialog(true);
    }
  };

  // Gérer les changements dans les options de la salle
  const handleOptionChange = (e) => {
    const { name, value, type, checked } = e.target;
    setRoomOptions(prevOptions => ({
      ...prevOptions,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? parseInt(value, 10) : value)
    }));
  };

  // Fonction pour finaliser la création (pour l'instant, ferme juste le dialogue)
  const handleFinalizeCreateRoom = () => {
    console.log("Options de la salle :", roomOptions);
    // Ici, plus tard, on enverra les options au backend ou à AdminRoomView
    setShowCreateRoomDialog(false);
    navigate('/admin-room', { state: { roomOptions } });
  };

  // Fonction pour rejoindre en tant que spectateur
  const handleJoinAsSpectator = () => {
    if (!roomCode || !roomExists) {
      error('Code de salle invalide');
      return;
    }
    
    // Naviguer vers la vue spectateur
    navigate(`/spectator/${roomCode}`);
  };

  return (
    <div className={`home-container ${isDarkMode ? 'dark-mode' : ''}`}>
      <h1 className="home-title">Prêt(e) pour un blindtest ? 😏</h1>
      
      <div className="card">
        <h2>Rejoindre une salle</h2>
        <div className="form-group">
          <label className="form-label">Code de la salle :</label>
          <div className="input-group">
            <input
              type="text"
              className={`form-control ${
                roomCode.length === 5 ? (
                  checkingRoom ? 'checking' : (
                    roomExists ? 'valid' : 'invalid'
                  )
                ) : ''
              }`}
              maxLength={5}  
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            />
            {checkingRoom && (
              <span className="input-status checking">⏳</span>
            )}
            {roomCode.length === 5 && !checkingRoom && (
              <span className={`input-status ${roomExists ? 'valid' : 'invalid'}`}>
                {roomExists ? '✅' : '❌'}
              </span>
            )}
          </div>
          {roomExists === false && roomCode.length === 5 && (
            <small className="text-danger">Cette salle n'existe pas</small>
          )}
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
        
        <div className="button-group">
          <button 
            className="btn btn-primary" 
            onClick={handleJoinRoom}
          >
            Rejoindre en tant que joueur
          </button>
          
          {/* Bouton spectateur conditionnel */}
          {roomExists && (
            <button 
              className="btn btn-outline-secondary spectator-btn" 
              onClick={handleJoinAsSpectator}
            >
              👁️ Regarder en spectateur
            </button>
          )}
        </div>
        
        {localStorage.getItem('roomCode') && localStorage.getItem('pseudo') && (
          <button 
            className="btn btn-secondary rejoin-btn" 
            onClick={handleRejoinRoom}
          >
            Revenir dans la salle
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

      {/* Dialogue de création de salle */}
      <Dialog.Root open={showCreateRoomDialog} onOpenChange={setShowCreateRoomDialog}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className={`dialog-content ${isDarkMode ? 'dark-mode' : ''}`}>
            <Dialog.Title className="dialog-title">Options de la nouvelle salle</Dialog.Title>
            <Dialog.Description className="dialog-description visually-hidden">
              Configurez les options pour la nouvelle salle de blindtest.
            </Dialog.Description>
            
            <div className="form-group mt-3">
              <label className="form-label">Type de blindtest :</label>
              <select 
                name="roomType" 
                className="form-control" 
                value={roomOptions.roomType} 
                onChange={handleOptionChange}
              >
                <option value="Standard">Standard</option>
                <option value="Titre/Artiste">Titre/Artiste</option>
              </select>
            </div>

            <div className="form-group mt-3">
              <label className="form-label">Points par bonne réponse :</label>
              <input 
                type="number" 
                name="pointsCorrect" 
                className="form-control" 
                value={roomOptions.pointsCorrect} 
                onChange={handleOptionChange} 
                min="1"
              />
            </div>

            <div className="form-group mt-3">
              <label className="form-label">Points retirés par mauvaise réponse :</label>
              <input 
                type="number" 
                name="pointsWrong" 
                className="form-control" 
                value={roomOptions.pointsWrong} 
                onChange={handleOptionChange} 
                min="0"
              />
            </div>

            <div className="form-group mt-3">
              <label className="form-label">Pénalité de buzzer (secondes) :</label>
              <input 
                type="number" 
                name="penaltyDelay" 
                className="form-control" 
                value={roomOptions.penaltyDelay} 
                onChange={handleOptionChange} 
                min="0"
              />
            </div>

            <div className="form-check mt-3">
              <input 
                type="checkbox" 
                name="saveRoom" 
                className="form-check-input" 
                id="saveRoomCheck"
                checked={roomOptions.saveRoom} 
                onChange={handleOptionChange} 
              />
              <label className="form-check-label" htmlFor="saveRoomCheck">
                Sauvegarder la session après fermeture
              </label>
            </div>

            <div className="dialog-footer mt-4">
              <Dialog.Close asChild>
                <button className="btn btn-secondary">Annuler</button>
              </Dialog.Close>
              <button className="btn btn-primary" onClick={handleFinalizeCreateRoom}>Créer la salle</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

    </div>
  );
}

export default HomePage;
