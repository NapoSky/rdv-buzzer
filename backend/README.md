# RDV-Buzzer Backend

Ce projet constitue le backend de l’application **RDV-Buzzer**, permettant de gérer en temps réel des sessions de "buzzer" pour des jeux ou des événements interactifs. Il offre une **API REST** ainsi qu’une **communication en temps réel** via **Socket.IO**.

---

## 🚀 Fonctionnalités

### 🎯 **Création et gestion de salles**
✅ Création de salles avec code unique  
✅ Connexion/déconnexion des participants  
✅ Gestion des accès et des droits d’administrateur  

### 🔥 **Système de buzzer en temps réel**
✅ Capture du premier participant à buzzer  
✅ Réinitialisation et gestion de l’ordre de passage  

### ⚡ **Communication instantanée**
✅ Notifications en temps réel via Socket.IO  
✅ Mise à jour dynamique des états des salles  

### 🛠 **Intégration d’autres services**
✅ Possibilité d’étendre les fonctionnalités (ex. connexion à Spotify, services tiers, etc.)

---

## 📂 **Structure du projet**
```bash
.
├── .env.example                  # Variables d'environnement exemples
├── Dockerfile                    # Configuration Docker
├── package.json                  # Dépendances et scripts (ex. "npm start")
├── server.js                     # Point d'entrée principal du serveur
├── src/
│   ├── app.js                    # Configuration d'Express et routes principales
│   ├── config/                   # Configuration générale
│   │   ├── db.js                 # Connexion à Redis
│   │   ├── index.js              # Exports centralisés de la configuration
│   │   ├── socket.js             # Configuration Socket.IO
│   │   └── spotify.js            # Configuration API Spotify
│   ├── controllers/              # Gestion des actions principales
│   │   ├── rankingController.js  # Gestion du classement
│   │   ├── roomController.js     # Actions sur les salles
│   │   └── spotifyController.js  # Intégration Spotify
│   ├── middlewares/              # Middlewares API
│   │   ├── auth.js               # Vérification du token admin
│   │   └── logger.js             # Middleware de logging
│   ├── models/                   # Modèles de données
│   │   ├── Ranking.js            # Modèle du classement
│   │   └── Room.js               # Gestion des salles en mémoire
│   ├── routes/                   # Définition des routes API
│   │   ├── index.js              # Montage global des routes API
│   │   ├── roomRoutes.js         # Gestion des salles
│   │   ├── rankingRoutes.js      # Gestion du classement
│   │   ├── adminRoutes.js        # Routes sécurisées Admin
│   │   └── spotifyRoutes.js      # Routes Spotify
│   ├── services/                 # Services externes
│   │   ├── redisService.js       # Interaction avec Redis
│   │   └── spotifyService.js     # Interaction avec l'API Spotify
│   ├── socket/                   # Gestion des événements en temps réel
│   │   ├── handlers/             # Gestion des événements spécifiques
│   │   │   ├── buzzHandlers.js   # Gestion des buzzers
│   │   │   ├── playerHandlers.js # Gestion des mises à jour de score
│   │   │   └── roomHandlers.js   # Gestion des salles via WebSocket
│   │   └── index.js              # Initialisation Socket.IO
│   └── utils/                    # Outils et helpers
│       ├── helpers.js            # Fonctions utilitaires
│       └── logger.js             # Outils de logging
```
---

## ⚙️ **Variables d'environnement**
Avant de lancer l’application, configurez vos variables d’environnement. Vous pouvez vous inspirer du fichier **`.env.example`**.

| Variable                | Description                                 | Valeur par défaut     | Obligatoire  |
|------------------------|--------------------------------------------|-------------------------|--------------|
| `APP_SECRET`           | Clé secrète JWT                            | —                       | ✅ Oui       |
| `PORT`                 | Port du serveur                            | `3001`                  | ❌ Optionnel |
| `NODE_ENV`             | Mode (`development` / `production`)        | `development`           | ❌ Optionnel |
| `CORS_ORIGIN`          | Origine des requêtes CORS                  | `*`                     | ❌ Optionnel |
| `SOCKET_CORS_ORIGIN`   | Origine autorisée pour WebSockets          | `*`                     | ❌ Optionnel |
| `REDIS_URL`            | URL de connexion Redis                     | `redis://redis:6379`    | ❌ Optionnel |
| `SPOTIFY_CLIENT_ID`    | Identifiant API Spotify                    | —                       |  |
| `SPOTIFY_CLIENT_SECRET`| Clé secrète API Spotify                    | —                       | ➖ Si activé |
| `SPOTIFY_REDIRECT_URI` | URL de redirection OAuth côté Backend      | —                       | ➖ Si activé |
| `FRONTEND_URL`         | URL de callback frontend pour Spotify      | `http://localhost`      | ➖ Si activé |

---

## 🛠 **Installation et démarrage**

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
docker build -t rdv-buzzer-backend .
docker run -p 3001:3001 rdv-buzzer-backend
```

---

## Comment contribuer

1. Forkez le dépôt.
2. Créez une branche pour vos modifications.
3. Ouvrez une Pull Request pour examiner et fusionner vos changements.