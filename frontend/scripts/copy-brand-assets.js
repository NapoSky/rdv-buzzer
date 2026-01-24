/**
 * Script de pre-build pour copier les assets du brand sélectionné
 * Usage: VITE_BRAND=rdv node scripts/copy-brand-assets.js
 */

import { existsSync, mkdirSync, cpSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const brand = process.env.VITE_BRAND || 'default';
const projectRoot = resolve(__dirname, '..');
const sourceDir = resolve(projectRoot, 'brand-assets', brand);
const targetDir = resolve(projectRoot, 'public', 'brand');

console.log(`📦 Copie des assets pour le brand: ${brand}`);

// Vérifier que le dossier source existe
if (!existsSync(sourceDir)) {
  console.error(`❌ Erreur: Le dossier brand-assets/${brand}/ n'existe pas.`);
  console.log(`   Brands disponibles: vérifiez le dossier brand-assets/`);
  process.exit(1);
}

// Nettoyer le dossier cible s'il existe
if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true });
  console.log(`🧹 Dossier public/brand/ nettoyé`);
}

// Créer le dossier cible
mkdirSync(targetDir, { recursive: true });

// Copier les assets
cpSync(sourceDir, targetDir, { recursive: true });

console.log(`✅ Assets copiés de brand-assets/${brand}/ vers public/brand/`);
