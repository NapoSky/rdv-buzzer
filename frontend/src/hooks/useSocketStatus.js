// src/hooks/useSocketStatus.js
import { useContext } from 'react';
import { SocketContext } from '../contexts/SocketContext';

export const useSocketStatus = () => {
  const context = useContext(SocketContext);
  if (!context) {
    return false; // Valeur par défaut sûre
  }
  return context.isConnected;
};