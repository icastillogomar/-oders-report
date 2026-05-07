# Etapa 1: Construir el Frontend
FROM node:22-alpine as frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Etapa 2: Backend y Ejecución
FROM node:22-alpine
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production
COPY backend/ ./backend/
# Copia los archivos construidos del frontend a la carpeta dist del backend
COPY --from=frontend-builder /app/frontend/dist ./backend/dist

# Variables de entorno por defecto para Cloud Run
ENV PORT=3001
ENV BQ_LOCATION=US
ENV GCP_PROJECT_ID=fechaestimadaentregaprod

EXPOSE 3001
CMD ["node", "backend/server.js"]
