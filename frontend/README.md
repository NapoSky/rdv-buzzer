# 🎙️ RDV-Buzzer Frontend

Ce projet constitue une application web interactive qui permet de gérer des sessions de quiz avec un système de buzzer en temps réel. L'application facilite l'animation de jeux de type "Questions pour un champion" ou l'organisation de blindtests où les joueurs peuvent "buzzer" pour répondre, avec un suivi des scores et une interface administrateur complète.

---

## ✨ Fonctionnalités

### 🌐 Fonctionnalités générales

- **🚀 Système de salles** : Création et gestion de salles avec codes uniques
- **🔔 Système de buzzer** : Détection en temps réel du premier joueur à buzzer
- **📊 Suivi des scores** : Attribution automatique des points et classement
- **🌓 Mode jour/nuit** : Interface adaptative avec thème clair et sombre

### 👥 Fonctionnalités client

- **⚡ Connexion simplifiée** : Accès rapide avec code de salle et pseudo
- **🎯 Buzzer réactif** : Interface optimisée pour minimiser la latence
- **📈 Suivi du classement** : Visualisation en temps réel des scores
- **👀 Mode Spectateur** : Permet aux utilisateurs de suivre les sessions en temps réel sans participer activement

### 🛠️ Fonctionnalités admin

- **🔧 Gestion complète des salles** : Création, fermeture et modération
- **🚫 Contrôle des joueurs** : Possibilité d'expulser les joueurs indésirables
- **🔄 Gestion du buzzer** : Réinitialisation et pause du système
- **📋 Tableau de bord** : Historique des sessions et statistiques
- **🎵 Intégration Spotify** : Mise en pause automatique de la musique lors d'un buzz

---

## 🏗️ Structure du projet

```plaintext
frontend/
├── public/                    # Ressources statiques
│   └── index.html             # Point d'entrée HTML
├── src/
│   ├── assets/                # Élèments statiques (son, image)       
│   ├── components/            # Composants React
│   │   ├── admin/             # Composants pour les administrateurs
│   │   ├── client/            # Composants pour les participants
│   │   ├── common/            # Composants partagés
│   │   └── shared/            # Composants réutilisables et modaux
│   ├── contexts/              # Contextes React
│   │   ├── AdminAuthContext.jsx   # Authentification admin
│   │   ├── SocketContext.jsx      # Gestion des websockets
│   │   ├── SpotifyContext.jsx     # Intégration Spotify
│   │   └── ThemeContext.jsx       # Gestion thème clair/sombre
│   ├── hooks/                 # Hooks personnalisés
│   ├── pages/                 # Pages principales
│   ├── services/              # Services d'API et socket
│   │   ├── api/               # Appels API REST
│   │   └── socket/            # Gestion des websockets
│   ├── styles/                # Feuilles de style
│   │   ├── global.css         # Styles globaux
│   │   ├── variables.css      # Variables CSS
│   │   └── themes/            # Thèmes clair/sombre
│   ├── utils/                 # Utilitaires
│   ├── index.jsx              # Point d'entrée JS
│   └── App.jsx                # Composant racine
│── package.json               # Dépendances et scripts
│── .env.example               # Variables d'environnement exemples
│── Dockerfile                 # Configuration Docker
```

---

## ⚙️ Variables d'environnement

| Variable                  | Description                                      | Valeur par défaut         | Obligatoire |
|---------------------------|--------------------------------------------------|---------------------------|-------------|
| VITE_BACKEND_URL          | URL du serveur backend                           | `http://localhost:3001`   | ✅ Oui      |
| VITE_APP_SECRET           | Clé secrète pour l'API/rdv-backend               | -                         | ✅ Oui      |
| VITE_ADMIN_PASSWORD       | Mot de passe administrateur complet              | `secret`                  | ✅ Oui      |
| VITE_OPERATOR_PASSWORD    | Mot de passe opérateur (droits limités)          | `operator`                | ➖ Non      |
| VITE_SPOTIFY_CLIENT_ID    | ID client Spotify pour l'intégration             | -                         | ➖ Si activé|
| VITE_BRAND                | Identifiant du brand à utiliser                  | `default`                 | ➖ Non      |

### 🔐 Rôles administrateurs

Le système supporte deux niveaux d'accès administrateur :

- **👑 Administrateur complet** (`VITE_ADMIN_PASSWORD`) :
  - Créer des salles avec sauvegarde possible
  - Fermer des salles
  - Gérer le classement (modifier, supprimer, purger)
  - Accès complet à toutes les fonctionnalités

- **🔧 Opérateur** (`VITE_OPERATOR_PASSWORD`) :
  - Créer des salles (sauvegarde désactivée)
  - Rejoindre des sessions en cours
  - ❌ Pas d'accès au classement
  - ❌ Ne peut pas fermer les salles

---

## 🚀 Installation et démarrage

### 1️⃣ Installer les dépendances  
```bash
npm install
```

### 2️⃣ Configurer les variables d’environnement  
📌 **Windows**  
```bash
copy .env.example .env
```
📌 **Linux/macOS**  
```bash
cp .env.example .env
```

### 3️⃣ Lancer le serveur  
**🔹 Mode développement :**  
```bash
npm run dev
```
**🔹 Mode production :**  
```bash
npm start
```

### 4️⃣ Utilisation avec Docker  
💡 **Construire et lancer le conteneur Docker :**  
```bash
# Construction de l'image
docker build -t rdv-buzzer-frontend \
  --build-arg VITE_BACKEND_URL=http://localhost:3001 \
  --build-arg VITE_ADMIN_PASSWORD=your_admin_password \
  --build-arg VITE_OPERATOR_PASSWORD=your_operator_password \
  --build-arg VITE_APP_SECRET=your_backend_app_secret \
  --build-arg VITE_BRAND=default \
  .

# Exécution du conteneur
docker run -p 80:80 rdv-buzzer-frontend
```

---

## 🏷️ Système de Branding Multi-Instance

Le frontend supporte un système de branding qui permet de personnaliser l'application pour différents établissements.

### Structure des fichiers

```plaintext
frontend/
├── src/brands/
│   └── default.json          # Configuration par défaut (template)
├── brand-assets/
│   └── default/
│       └── logo.svg          # Logo de l'établissement
```

### Créer un nouveau brand

1. **Créer le fichier de configuration** `src/brands/monbrand.json` :
```json
{
  "name": "Mon Établissement",
  "title": "Mon-Buzzer",
  "logo": {
    "format": "png"
  },
  "instagram": {
    "url": "https://www.instagram.com/moncompte",
    "handle": "@moncompte"
  },
  "wifi": {
    "ssid": "MonWifi",
    "password": "monmotdepasse",
    "encryption": "WPA"
  },
  "promo": {
    "session": "🏆 Gagne la session et remporte un lot !",
    "monthly": "🥇 Termine 1er du mois pour un prix spécial !"
  }
}
```

2. **Créer le dossier d'assets** `brand-assets/monbrand/` avec :
   - `logo.png` ou `logo.svg` — Logo de l'établissement (le format doit correspondre à `logo.format` dans le JSON)

3. **Builder avec le brand** :
```bash
docker build -t mon-buzzer \
  --build-arg VITE_BRAND=monbrand \
  ...
```

> ⚠️ **Note** : Les brands personnalisés (hors `default`) sont automatiquement ignorés par git. Cela permet de garder les configurations privées hors du dépôt public.

---

## ℹ️ Note

Cette application frontend doit être connectée à un backend compatible (rdv-backend) pour fonctionner correctement. Assurez-vous que le backend est en cours d'exécution et accessible via l'URL spécifiée dans `VITE_BACKEND_URL` et que les deux applications partagent bien le même `VITE_APP_SECRET`.
