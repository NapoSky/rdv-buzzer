/**
 * Loader de configuration de branding
 * Importe dynamiquement le JSON du brand sélectionné via VITE_BRAND
 */

// Import statique de tous les brands disponibles
// Vite résoudra au build et n'inclura que celui utilisé via tree-shaking
import defaultBrand from '../brands/default.json';

// Mapping des brands (ajouter ici les nouveaux brands)
const brands = {
  default: defaultBrand,
};

// Récupérer le brand depuis les variables d'environnement
const brandName = import.meta.env.VITE_BRAND || 'default';

// Tenter de charger le brand dynamiquement (pour les brands privés non listés)
let brandConfig;

try {
  // Essayer d'importer dynamiquement le brand privé
  const dynamicBrand = await import(`../brands/${brandName}.json`);
  brandConfig = dynamicBrand.default || dynamicBrand;
} catch {
  // Fallback sur le mapping statique ou default
  brandConfig = brands[brandName] || brands.default;
  
  if (!brands[brandName] && brandName !== 'default') {
    console.warn(`⚠️ Brand "${brandName}" non trouvé, utilisation de "default"`);
  }
}

/**
 * Configuration du brand actuel
 * @type {{
 *   name: string,
 *   title: string,
 *   instagram: { url: string, handle: string },
 *   wifi: { ssid: string, password: string, encryption: string },
 *   promo: { session: string, monthly: string }
 * }}
 */
export const brand = brandConfig;

/**
 * Chemin vers les assets du brand (copié par le script prebuild)
 * Le format du logo est défini dans le JSON du brand (logo.format)
 */
const logoFormat = brand.logo?.format || 'png';

export const brandAssets = {
  logo: `/brand/logo.${logoFormat}`,
};

/**
 * Génère la chaîne WiFi pour QR code
 * Format: WIFI:T:<encryption>;S:<ssid>;P:<password>;;
 */
export const getWifiQRString = () => {
  const { ssid, password, encryption } = brand.wifi;
  return `WIFI:T:${encryption};S:${ssid};P:${password};;`;
};

/**
 * Initialise le branding (titre de page, etc.)
 * À appeler au démarrage de l'application
 */
export const initBranding = () => {
  document.title = brand.title;
};

// Auto-initialisation
initBranding();

export default brand;
