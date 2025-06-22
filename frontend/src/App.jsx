// src/App.js
import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SocketProvider } from './contexts/SocketContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ToastContainer } from 'react-toastify';
import HeaderMenu from './components/common/HeaderMenu/HeaderMenu';
import HomePage from './pages/HomePage/HomePage';
import ClientView from './components/client/ClientView/ClientView';
import AdminRoomView from './components/admin/AdminRoomView/AdminRoomView';
import PublicRanking from './pages/PublicRanking/PublicRanking';
import AdminPanel from './components/admin/AdminPanel/AdminPanel';
import Changelog from './pages/Changelog/Changelog';
import { SpotifyProvider } from './contexts/SpotifyContext';
import SpotifyCallback from './pages/SpotifyCallBack/SpotifyCallback';

function App() {
  const [adminAuthenticated, setAdminAuthenticated] = useState(
    localStorage.getItem('adminAuthenticated') === 'true'
  );
  const [activeRoomCode, setActiveRoomCode] = useState(null);

  return (
    <ThemeProvider>
      <NotificationProvider>
        <ToastContainer />

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
          <Route path="/changelog" element={<Changelog />} />
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
            element={<AdminPanel />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;