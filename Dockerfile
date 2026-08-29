# Stage 1: Construcción del Frontend React
FROM node:20-alpine AS frontend-builder

# Aumentar la memoria para evitar "JavaScript heap out of memory"
ENV NODE_OPTIONS="--max-old-space-size=2048"

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Backend Node.js y Servidor Estático
FROM node:20-alpine

WORKDIR /app/backend

# Copiar dependencias e instalarlas (solo producción)
COPY backend/package*.json ./
RUN npm ci --only=production

# Copiar el código del backend
COPY backend/ .

# Copiar el build del frontend a la ruta exacta donde el backend lo espera:
# (__dirname en index.js es /app/backend/src, así que ../../frontend/build = /app/frontend/build)
COPY --from=frontend-builder /app/frontend/build /app/frontend/build

# Exponer el puerto
EXPOSE 3000

# Arrancar directamente con node (Docker gestionará los reinicios)
CMD ["node", "src/index.js"]
