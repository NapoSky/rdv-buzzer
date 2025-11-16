import React, { createContext, useState, useEffect } from 'react';

export const AdminAuthContext = createContext();

export const AdminAuthProvider = ({ children }) => {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(
    localStorage.getItem('localAdminAuthenticated') === 'true'
  );
  
  const [adminRole, setAdminRole] = useState(
    localStorage.getItem('adminRole') || null
  );

  useEffect(() => {
    const updateAdminAuth = () => {
      const authStatus = localStorage.getItem('localAdminAuthenticated') === 'true';
      const role = localStorage.getItem('adminRole');
      setIsAdminAuthenticated(authStatus);
      setAdminRole(role);
    };

    window.addEventListener('storage', updateAdminAuth);

    return () => {
      window.removeEventListener('storage', updateAdminAuth);
    };
  }, []);
  
  // Fonction helper pour vérifier les permissions
  const isFullAdmin = () => adminRole === 'admin_full';
  const isOperator = () => adminRole === 'admin_operator';

  return (
    <AdminAuthContext.Provider value={{ 
      isAdminAuthenticated, 
      setIsAdminAuthenticated,
      adminRole,
      setAdminRole,
      isFullAdmin,
      isOperator
    }}>
      {children}
    </AdminAuthContext.Provider>
  );
};