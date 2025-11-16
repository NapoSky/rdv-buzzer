// Utilitaire de stockage compatible Safari iOS
// Utilise les cookies en fallback si localStorage est bloqué/effacé

const COOKIE_EXPIRY_DAYS = 365; // 1 an

// Fonction pour définir un cookie
function setCookie(name, value, days = COOKIE_EXPIRY_DAYS) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

// Fonction pour lire un cookie
function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) {
      return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
  }
  return null;
}

// Fonction pour supprimer un cookie
function removeCookie(name) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
}

// Stockage hybride : essaie localStorage d'abord, puis cookie en fallback
export const storage = {
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
      // Si localStorage fonctionne, on supprime le cookie (pas besoin de doublon)
      removeCookie(key);
    } catch (e) {
      // Si localStorage est bloqué, utiliser les cookies en fallback
      console.warn('localStorage non disponible, utilisation des cookies', e);
      setCookie(key, value);
    }
  },

  getItem: (key) => {
    try {
      // Essayer localStorage d'abord
      const localValue = localStorage.getItem(key);
      if (localValue !== null) {
        return localValue;
      }
    } catch (e) {
      console.warn('localStorage non disponible', e);
    }
    // Fallback sur cookie
    return getCookie(key);
  },

  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('localStorage non disponible', e);
    }
    removeCookie(key);
  }
};
