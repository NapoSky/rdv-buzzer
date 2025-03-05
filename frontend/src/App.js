// src/App.js
import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SocketProvider } from './contexts/SocketContext';
import { ThemeProvider } from './contexts/ThemeContext';
import HeaderMenu from './components/common/HeaderMenu/HeaderMenu';
import HomePage from './pages/HomePage/HomePage';
import ClientView from './components/client/ClientView/ClientView';
import AdminRoomView from './components/admin/AdminRoomView/AdminRoomView';
import PublicRanking from './pages/PublicRanking/PublicRanking';
import AdminPanel from './components/admin/AdminPanel/AdminPanel';
import { SpotifyProvider } from './contexts/SpotifyContext';
import SpotifyCallback from './pages/SpotifyCallBack/SpotifyCallback';
import './styles/global.css';
import './styles/variables.css';
import './styles/themes/dark.css'; 
import './styles/themes/light.css';

function App() {
  const [adminAuthenticated, setAdminAuthenticated] = useState(
    localStorage.getItem('adminAuthenticated') === 'true'
  );
  const [activeRoomCode, setActiveRoomCode] = useState(null);

  return (
    <ThemeProvider>
      <HeaderMenu
        adminAuthenticated={adminAuthenticated}
        activeRoomCode={activeRoomCode}
      />
      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              setAdminAuthenticated={setAdminAuthenticated}
              setActiveRoomCode={setActiveRoomCode}
            />
          }
        />
        <Route
          path="/client"
          element={
            <SocketProvider>
              <ClientView setActiveRoomCode={setActiveRoomCode} />
            </SocketProvider>
          }
        />
        <Route path="/classement" element={<PublicRanking />} />
        <Route path="/spotify-callback" element={<SpotifyCallback />} />
        <Route
          path="/admin-room"
          element={
            <SocketProvider>
              <SpotifyProvider>
                <AdminRoomView />
              </SpotifyProvider>
            </SocketProvider>
          }
        />
        <Route
          path="/admin-panel"
          element={<AdminPanel/>}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  );
}

export default App;