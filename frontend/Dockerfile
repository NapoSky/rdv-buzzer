# Étape de build
FROM node:22-alpine AS build

# Déclaration des arguments de build
ARG REACT_APP_BACKEND_URL
ARG REACT_APP_ADMIN_PASSWORD
ARG REACT_APP_SPOTIFY_CLIENT_ID
ARG REACT_APP_APP_SECRET

# Configuration des variables d'environnement pour le build
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
ENV REACT_APP_ADMIN_PASSWORD=$REACT_APP_ADMIN_PASSWORD
ENV REACT_APP_SPOTIFY_CLIENT_ID=$REACT_APP_SPOTIFY_CLIENT_ID
ENV REACT_APP_APP_SECRET=$REACT_APP_APP_SECRET

WORKDIR /app
COPY package*.json ./
RUN npm install --only=production && npm cache clean --force
COPY . .
RUN npm run build && rm -rf node_modules


# Étape de production
FROM nginx:alpine-slim
COPY --from=build /app/build /usr/share/nginx/html
# Copie de la config Nginx personnalisée
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]