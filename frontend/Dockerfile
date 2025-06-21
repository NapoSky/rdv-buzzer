# Étape de build
FROM node:22-alpine AS build

# Déclaration des arguments de build
ARG VITE_BACKEND_URL
ARG VITE_ADMIN_PASSWORD
ARG VITE_SPOTIFY_CLIENT_ID
ARG VITE_APP_SECRET

# Configuration des variables d'environnement pour le build
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_ADMIN_PASSWORD=$VITE_ADMIN_PASSWORD
ENV VITE_SPOTIFY_CLIENT_ID=$VITE_SPOTIFY_CLIENT_ID
ENV VITE_APP_SECRET=$VITE_APP_SECRET

WORKDIR /app
COPY package*.json ./
# Important : inclure les dépendances de développement pour Vite
RUN npm install && npm cache clean --force
COPY . .
RUN npm run build && rm -rf node_modules


# Étape de production
FROM nginx:alpine-slim
# Le dossier de build avec Vite est "dist" au lieu de "build"
COPY --from=build /app/dist /usr/share/nginx/html
# Copie de la config Nginx personnalisée
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]