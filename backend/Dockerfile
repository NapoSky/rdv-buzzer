FROM node:22-alpine AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --only=production
COPY . .

FROM gcr.io/distroless/nodejs22-debian12
WORKDIR /usr/src/app
# Copier d'abord les node_modules
COPY --from=build /usr/src/app/node_modules ./node_modules
# Copier uniquement les fichiers nécessaires de l'étape de build
COPY --from=build /usr/src/app/server.js ./server.js
COPY --from=build /usr/src/app/src ./src

CMD ["./server.js"]