// src/contexts/ThemeContext.js
import React, { createContext, useState, useEffect } from 'react';

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  // Utiliser localStorage pour la persistance, avec préférence système comme fallback
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Vérifier d'abord si une préférence est stockée dans localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme !== null) {
      return savedTheme === 'dark';
    }
    // Sinon, utiliser la préférence système
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Effet pour gérer les préférences système
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Ne mettre à jour que si l'utilisateur n'a pas déjà choisi manuellement
    const handleChange = (e) => {
      if (localStorage.getItem('theme') === null) {
        setIsDarkMode(e.matches);
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Effet pour appliquer la classe dark-mode sur le body et sauvegarder dans localStorage
  useEffect(() => {
    document.body.classList.toggle('dark-mode', isDarkMode);
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Fonction pour basculer le thème tout en maintenant la cohérence
  const toggleDarkMode = () => {
    setIsDarkMode(prevMode => !prevMode);
  };

  return (
    <ThemeContext.Provider value={{ 
      isDarkMode, 
      setIsDarkMode,
      toggleDarkMode // Ajouter la fonction de bascule pour faciliter l'utilisation
    }}>
      {children}
    </ThemeContext.Provider>
  );
};