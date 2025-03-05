// src/hooks/useSocketError.js
import { useContext } from 'react';
import { SocketContext } from '../contexts/SocketContext';

export const useSocketError = () => {
  const context = useContext(SocketContext);
  if (!context) {
    return null; // Valeur par défaut sûre
  }
  return context.socketError;
};