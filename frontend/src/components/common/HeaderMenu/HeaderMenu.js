// src/components/HeaderMenu.js
import React, { useState, useContext, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AdminAuthContext } from '../../../contexts/AdminAuthContext';
import { ThemeContext } from '../../../contexts/ThemeContext';

function HeaderMenu({ activeRoomCode }) {
  const [isNavCollapsed, setIsNavCollapsed] = useState(true);
  const { isAdminAuthenticated, setIsAdminAuthenticated } = useContext(AdminAuthContext);
  const { isDarkMode, setIsDarkMode } = useContext(ThemeContext);
  const navigate = useNavigate();
  const [storedRoomCode, setStoredRoomCode] = useState('');
  const [storedPseudo, setStoredPseudo] = useState('');

  useEffect(() => {
    const roomCode = localStorage.getItem('roomCode');
    const pseudo = localStorage.getItem('pseudo');
    if (roomCode && pseudo) {
      setStoredRoomCode(roomCode);
      setStoredPseudo(pseudo);
    }
  }, []);

  const handleToggle = () => {
    setIsNavCollapsed(!isNavCollapsed);
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('localAdminAuthenticated');
    setIsAdminAuthenticated(false);
    navigate('/');
  };

  return (
    <nav className={`navbar navbar-expand-lg navbar-${isDarkMode ? 'dark' : 'light'} bg-${isDarkMode ? 'dark' : 'light'} mb-3`}>
      <div className="container-fluid">
        <Link className="navbar-brand" to="/">
          Le RDV-SdB 🎙️
        </Link>

        {/* Bouton hamburger pour petits écrans */}
        <button
          className="navbar-toggler"
          type="button"
          onClick={handleToggle}
          aria-controls="navbarSupportedContent"
          aria-expanded={!isNavCollapsed}
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon" />
        </button>

        <div
          className={`collapse navbar-collapse ${!isNavCollapsed ? 'show' : ''}`}
          id="navbarSupportedContent"
        >
          {/* Liens sur la gauche */}
          <ul className="navbar-nav me-auto mb-2 mb-lg-0">
            <li className="nav-item">
              <Link
                className="nav-link"
                to="/"
                onClick={() => setIsNavCollapsed(true)}
              >
                Accueil
              </Link>
            </li>

            {storedRoomCode && storedPseudo && (
              <li className="nav-item">
                <Link
                  className="nav-link"
                  to={`/client?roomCode=${storedRoomCode}&pseudo=${storedPseudo}`}
                  onClick={() => setIsNavCollapsed(true)}
                >
                  Ma salle
                </Link>
              </li>
            )}

              <li className="nav-item">
                <Link
                  className="nav-link"
                  to="/classement"
                  onClick={() => setIsNavCollapsed(true)}
                >
                  Classement
                </Link>
              </li>

            {isAdminAuthenticated && (
              <li className="nav-item">
                <Link
                  className="nav-link"
                  to="/admin-panel"
                  onClick={() => setIsNavCollapsed(true)}
                >
                  Admin Panel
                </Link>
              </li>
            )}
          </ul>

          {/* Jour/Nuit et bouton Déconnexion à droite */}
          <ul className="navbar-nav ms-auto mb-2 mb-lg-0">
            <li className="nav-item d-flex align-items-center">
              <small className="fst-italic d-flex align-items-center me-2">
                <div className="d-flex flex-column text-end">
                  <span className="theme-text">Jour...</span>
                  <span className="theme-text">Nuit !</span>
                </div>
                <span className="ms-2">👉</span>
              </small>
              <button
                className="btn btn-link nav-link me-2"
                onClick={() => setIsDarkMode(!isDarkMode)}
                aria-label="Toggle dark mode"
              >
                {isDarkMode ? '☀️' : '🌙'}
              </button>
            </li>

            {isAdminAuthenticated && (
              <li className="nav-item">
                <button
                  className="btn btn-danger nav-link"
                  onClick={() => {
                    handleAdminLogout();
                    setIsNavCollapsed(true);
                  }}
                >
                  Me déconnecter
                </button>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}

export default HeaderMenu;