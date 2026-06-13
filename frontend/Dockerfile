# Dockerfile del frontend (Angular) → build estático servido por nginx.
# Build context = raíz del repo (igual que el backend). Se trata el frontend como
# app standalone usando su propio package.json (evita instalar el workspace completo).
FROM node:22-bookworm AS build

WORKDIR /app

# 1) Dependencias del frontend (incluye devDeps para `ng build`).
COPY frontend/package.json ./package.json
RUN npm install --include=dev

# 2) Código + build de producción (usa environment.prod.ts vía fileReplacements).
COPY frontend/ ./
RUN npm run build

# 3) Servir el bundle con nginx. La config es un template: ${PORT} se resuelve al arrancar.
FROM nginx:alpine
COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
