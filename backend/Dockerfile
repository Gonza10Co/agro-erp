# Dockerfile del backend (NestJS + Prisma). Build context = raíz del repo.
# Se trata el backend como app standalone: su package.json es completo,
# así evitamos el install del workspace (Angular) y las rarezas de Railpack
# (modo production + EBADPLATFORM con binarios nativos opcionales).
FROM node:22-bookworm

WORKDIR /app

# 1) Instalar dependencias del backend (incluye devDeps para nest build + prisma).
#    Sin lockfile: npm install saltea correctamente los binarios opcionales
#    de otra plataforma (@unrs/resolver-binding-win32-*).
COPY backend/package.json ./package.json
RUN npm install --include=dev

# 2) Copiar el código del backend y generar el cliente Prisma + compilar.
COPY backend/ ./
RUN npx prisma generate && npm run build

ENV NODE_ENV=production

# migrate deploy es idempotente (la DB ya está migrada); deja listas
# las migraciones futuras. Luego arranca la app (escucha en $PORT de Railway).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
