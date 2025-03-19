// src/components/HeaderMenu.js
import React, { useState, useContext, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { AdminAuthContext } from '../../../contexts/AdminAuthContext';
import { ThemeContext } from '../../../contexts/ThemeContext';
import './HeaderMenu.css';

function HeaderMenu({ activeRoomCode }) {
  const { isAdminAuthenticated, setIsAdminAuthenticated } = useContext(AdminAuthContext);
  const { isDarkMode, toggleDarkMode } = useContext(ThemeContext); // Utiliser toggleDarkMode au lieu de setIsDarkMode
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

  const handleAdminLogout = () => {
    localStorage.removeItem('localAdminAuthenticated');
    setIsAdminAuthenticated(false);
    navigate('/');
  };

  return (
    <header className="modern-header">
      <div className="header-container">
        {/* Groupe logo + navigation principale */}
        <div className="brand-nav-group">
          <Link className="brand" to="/">
            <span className="brand-emoji">🎙️</span>
            <span className="brand-text">Le RDV-SdB</span>
          </Link>

          <nav className="desktop-nav">
            <Link className="nav-item" to="/">Accueil</Link>
            {storedRoomCode && storedPseudo && (
              <Link className="nav-item" to={`/client?roomCode=${storedRoomCode}&pseudo=${storedPseudo}`}>
                Ma salle
              </Link>
            )}
            <Link className="nav-item" to="/classement">Classement</Link>
            {isAdminAuthenticated && (
              <>
                <Link className="nav-item" to="/admin-panel">Admin Panel</Link>
                <button className="nav-logout-btn" onClick={handleAdminLogout}>
                  Me déconnecter
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Actions (theme toggle + logout) */}
        <div className="desktop-actions">
          <div className="theme-toggle-wrapper">
            <span className="theme-label">
              {isDarkMode ? 'Mode clair' : 'Mode sombre'}
            </span>
            <button 
              className="theme-toggle" 
              onClick={toggleDarkMode} // Utiliser toggleDarkMode à la place
              aria-label="Toggle theme"
            >
              <span className="theme-icon">{isDarkMode ? '☀️' : '🌙'}</span>
            </button>
          </div>
        </div>

        {/* Menu mobile */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="mobile-menu-trigger" aria-label="Menu">
              <span className="hamburger"></span>
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content className="mobile-menu-content" sideOffset={5}>
              <DropdownMenu.Item className="mobile-menu-item">
                <Link to="/">Accueil</Link>
              </DropdownMenu.Item>

              {storedRoomCode && storedPseudo && (
                <DropdownMenu.Item className="mobile-menu-item">
                  <Link to={`/client?roomCode=${storedRoomCode}&pseudo=${storedPseudo}`}>
                    Ma salle
                  </Link>
                </DropdownMenu.Item>
              )}

              <DropdownMenu.Item className="mobile-menu-item">
                <Link to="/classement">Classement</Link>
              </DropdownMenu.Item>

              {isAdminAuthenticated && (
                <DropdownMenu.Item className="mobile-menu-item">
                  <Link to="/admin-panel">Admin Panel</Link>
                </DropdownMenu.Item>
              )}
              {isAdminAuthenticated && (
                <DropdownMenu.Item className="mobile-menu-item">
                  <button onClick={handleAdminLogout}>Me déconnecter</button>
                </DropdownMenu.Item>
              )}

              <DropdownMenu.Separator className="mobile-menu-separator" />

              <DropdownMenu.Item className="mobile-menu-item theme-item">
                <button onClick={toggleDarkMode}> {/* Utiliser toggleDarkMode à la place */}
                  {isDarkMode ? 'Mode clair ☀️' : 'Mode sombre 🌙'}
                </button>
              </DropdownMenu.Item>

            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}

export default HeaderMenu;