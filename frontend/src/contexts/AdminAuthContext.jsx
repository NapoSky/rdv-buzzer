import React, { createContext, useState, useEffect } from 'react';

export const AdminAuthContext = createContext();

export const AdminAuthProvider = ({ children }) => {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(
    localStorage.getItem('localAdminAuthenticated') === 'true'
  );

  useEffect(() => {
    const updateAdminAuth = () => {
      const authStatus = localStorage.getItem('localAdminAuthenticated') === 'true';
      setIsAdminAuthenticated(authStatus);
    };

    window.addEventListener('storage', updateAdminAuth);

    return () => {
      window.removeEventListener('storage', updateAdminAuth);
    };
  }, []);

  return (
    <AdminAuthContext.Provider value={{ isAdminAuthenticated, setIsAdminAuthenticated }}>
      {children}
    </AdminAuthContext.Provider>
  );
};