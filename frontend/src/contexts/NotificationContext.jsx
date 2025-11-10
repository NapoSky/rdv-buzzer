import React, { createContext, useContext, useEffect, useState, useRef, useEffectEvent } from 'react';
import { toast } from 'react-toastify';
import { ThemeContext } from './ThemeContext';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
  const { isDarkMode } = useContext(ThemeContext);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // Référence pour suivre les notifications récentes
  const recentNotificationsRef = useRef({});
  
  // ✅ Effect Event pour gérer le resize
  const onResize = useEffectEvent(() => {
    setIsMobile(window.innerWidth < 768);
  });
  
  // Détecter les changements de taille d'écran
  useEffect(() => {
    const handleResize = () => onResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []); // ✅ Pas de dépendances
  
  // Méthodes de notification avec style moderne 2025 et dédoublonnage
  const showNotification = (type, message) => {
    // Vérifier si une notification identique a été envoyée récemment
    const notificationKey = `${type}-${message}`;
    const now = Date.now();
    const lastShown = recentNotificationsRef.current[notificationKey];
    
    // Ne pas montrer la notification si une identique a été envoyée il y a moins de 1000ms
    if (lastShown && (now - lastShown < 1000)) {
      console.log(`Notification ignorée (doublon): ${type} - ${message}`);
      return null;
    }
    
    // Enregistrer cette notification
    recentNotificationsRef.current[notificationKey] = now;
    
    // Nettoyer les anciennes entrées toutes les 10 secondes pour éviter une accumulation infinie
    if (Object.keys(recentNotificationsRef.current).length > 50) {
      const threshold = now - 10000;
      const newEntries = {};
      Object.entries(recentNotificationsRef.current).forEach(([key, timestamp]) => {
        if (timestamp > threshold) {
          newEntries[key] = timestamp;
        }
      });
      recentNotificationsRef.current = newEntries;
    }
    
    // Configuration commune pour toutes les notifications
    const options = {
      position: isMobile ? "bottom-center" : "bottom-right", 
      autoClose: 4000,
      hideProgressBar: true, 
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      theme: isDarkMode ? "dark" : "light",
      style: {
        borderRadius: '12px',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        backgroundColor: isDarkMode 
          ? 'rgba(28, 28, 30, 0.85)' 
          : 'rgba(250, 250, 250, 0.85)',
        boxShadow: isDarkMode 
          ? '0 8px 32px rgba(0, 0, 0, 0.4)' 
          : '0 8px 32px rgba(0, 0, 0, 0.1)',
        border: isDarkMode 
          ? '1px solid rgba(255, 255, 255, 0.08)' 
          : '1px solid rgba(0, 0, 0, 0.08)',
        color: isDarkMode ? '#ffffff' : '#1c1c1e',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: isMobile ? '0.9rem' : '0.95rem',
        fontWeight: '500',
        maxWidth: isMobile ? '90%' : '400px',
        width: isMobile ? '90%' : 'auto',
        padding: isMobile ? '12px' : '16px',
        margin: '0 auto',
        // Ajouter une marge en bas pour éviter que le toast soit collé au bas de l'écran sur mobile
        marginBottom: isMobile ? '16px' : '0',
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
      },
      className: `tw-border-l-4 ${
        type === 'success' ? 'tw-border-emerald-500' :
        type === 'error' ? 'tw-border-rose-500' :
        type === 'info' ? 'tw-border-blue-500' :
        'tw-border-amber-500'
      }`,
      icon: ({theme, type}) => {
        const baseStyle = {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: isMobile ? '20px' : '24px',
          height: isMobile ? '20px' : '24px',
          borderRadius: '50%',
          marginRight: isMobile ? '8px' : '12px',
          backgroundColor: 
            type === 'success' ? (isDarkMode ? 'rgba(52, 211, 153, 0.2)' : 'rgba(52, 211, 153, 0.15)') :
            type === 'error' ? (isDarkMode ? 'rgba(244, 63, 94, 0.2)' : 'rgba(244, 63, 94, 0.15)') :
            type === 'info' ? (isDarkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)') :
            (isDarkMode ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.15)'),
          color:
            type === 'success' ? '#34D399' :
            type === 'error' ? '#F43F5E' :
            type === 'info' ? '#3B82F6' :
            '#F59E0B',
          fontWeight: 'bold',
          fontSize: isMobile ? '0.8rem' : '0.9rem',
        };
        
        const symbol = 
          type === 'success' ? '✓' : 
          type === 'error' ? '×' : 
          type === 'info' ? 'i' : 
          '!';
          
        return (
          <div style={baseStyle}>
            {symbol}
          </div>
        );
      },
      // Utiliser le message comme ID stable pour le même contenu
      toastId: notificationKey,
    };
    
    // Utilise les méthodes existantes de react-toastify avec un ID stable basé sur le contenu
    return toast[type](message, options);
  };

  // Fonctions d'aide
  const success = (message) => showNotification('success', message);
  const error = (message) => showNotification('error', message);
  const info = (message) => showNotification('info', message);
  const warning = (message) => showNotification('warning', message);

  return (
    <NotificationContext.Provider value={{ 
      showNotification, success, error, info, warning, isMobile
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification doit être utilisé à l'intérieur d'un NotificationProvider");
  }
  return context;
};