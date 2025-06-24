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
│   ├── buzz-sound.mp3         # Son joué lors d'un buzz
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

| Variable               | Description                          | Valeur par défaut         | Obligatoire |
|------------------------|--------------------------------------|---------------------------|-------------|
| VITE_BACKEND_URL       | URL du serveur backend               | `http://localhost:3001`   | ✅ Oui      |
| VITE_APP_SECRET        | Clé secrète pour l'API/rdv-backend   | -                         | ✅ Oui      |
| VITE_ADMIN_PASSWORD    | Mot de passe administrateur          | `secret`                  | ✅ Oui      |
| VITE_SPOTIFY_CLIENT_ID | ID client Spotify pour l'intégration | -                         | ➖ Si activé|

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
  --build-arg VITE_APP_SECRET=your_backend_app_secret \
  .

# Exécution du conteneur
docker run -p 80:80 rdv-buzzer-frontend
```

---

## ℹ️ Note

Cette application frontend doit être connectée à un backend compatible (rdv-backend) pour fonctionner correctement. Assurez-vous que le backend est en cours d'exécution et accessible via l'URL spécifiée dans `VITE_BACKEND_URL` et que les deux applications partagent bien le même `VITE_APP_SECRET`.
