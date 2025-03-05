// src/hooks/useForceReconnect.js
import { useContext } from 'react';
import { SocketContext } from '../contexts/SocketContext';

export const useForceReconnect = () => {
    const context = useContext(SocketContext);
    if (!context) {
      return () => console.warn("forceReconnect n'est pas disponible"); // Fonction vide comme fallback
    }
    return context.forceReconnect;
  };