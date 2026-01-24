# 🎙️ RDV-Buzzer : Vue d'ensemble

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)

Ce dépôt contient deux applications principales qui forment un système complet de quiz avec buzzer en temps réel :

> ⚠️ **Licence** : Ce projet est sous licence [CC BY-NC 4.0](LICENSE). L'utilisation commerciale est interdite sauf pour l'auteur original.

---

## 1. RDV-Buzzer Frontend
- **Type :** Application React
- **Fonctionnalités clés :**  
  - **🚀 Création et gestion de salles** avec codes 
  - **👀 Mode Spectateur pour visionner la salle sur grand écran !**
  - **🔔 Système de buzzer en temps réel**  
  - **📊 Suivi des scores et mode admin**  
  - **🌓 Thème clair/sombre**

### Installation & Lancement
1. Installer les dépendances :  
   ```bash
   npm install
   ```
2. Copier le fichier \`.env.example\` vers \`.env\` et ajuster les variables.  
3. Démarrer en mode développement :  
   ```bash
   npm run dev
   ```

---

## 2. RDV-Buzzer Backend
- **Type :** Serveur Node.js (Express + Socket.IO)
- **Fonctionnalités clés :**
  - **🏗️ Création et gestion de salles**  
  - **🔄 Gestion du buzzer en temps réel**  
  - **🌐 API REST et WebSockets**  
  - **🎵 Intégration de services externes (ex. Spotify)**

### Installation & Lancement

1. Installer les dépendances :  
   ```bash
   npm install
   ```
2. Copier le fichier \`.env.example\` vers \`.env\` et ajuster les variables.  
3. Démarrer en mode développement :  
   ```bash
   npm run dev
   ```

---

## Utilisation "out-of-the-box"
### Déploiement via Docker Compose
Vous disposez d’un fichier `docker-compose.example.yml` à la racine du dépôt. Pour lancer l’application grâce à Docker Compose, placez-vous dans le répertoire racine, puis exécutez :
```bash
cp docker-compose.example.yml docker-compose.yml
docker-compose up -d --build
```

## Architecture Globale
1. **Frontend** gère l’interface utilisateur et communique avec le **Backend** via HTTP et WebSockets.  
2. **Backend** assure la logique métier (buzzer, sessions de quiz, scores) et expose des routes API ainsi qu’un serveur WebSocket.

Assurez-vous de configurer correctement les variables d’environnement pour que les deux parties puissent communiquer et partager la même clé de sécurité (`APP_SECRET` / `VITE_APP_SECRET`).
