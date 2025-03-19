import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { BrowserRouter } from 'react-router-dom';
import { AdminAuthProvider } from './contexts/AdminAuthContext';
import './styles/variables.css'  // Importer en premier
import './index.css'
import './styles/global.css'
import './styles/themes/dark.css'
import './styles/themes/light.css'

// Import de React Toastify
import 'react-toastify/dist/ReactToastify.css';


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <AdminAuthProvider>
      <App />
    </AdminAuthProvider>
  </BrowserRouter>
);