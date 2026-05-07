# Reporte Pedidos LP — BigQuery + React + Vite

Dashboard ejecutivo que consulta BigQuery (compañía LP, Soft Line) y muestra la distribución diaria de pedidos por plan (A, B, Error) con KPIs sumarizados y una gráfica de barras 100% apilada.

## Arquitectura

```
reporte-pedidos-lp/
├── backend/         Node.js + Express + @google-cloud/bigquery
│                    Mantiene la Service Account y expone /api/orders-summary
└── frontend/        Vite + React + Chart.js
                     Consume /api/* y renderiza KPIs + gráfica
```

> ⚠️ **Seguridad**: la Service Account vive ÚNICAMENTE en el backend. Nunca se incluye ni se expone en el frontend (sería visible para cualquier visitante).

## Setup rápido

### 1. Service Account de Google

1. Crea una SA en GCP Console → IAM & Admin → Service Accounts.
2. Asígnale los roles `BigQuery Data Viewer` y `BigQuery Job User` sobre el proyecto `fechaestimadaentregaprod` (o el que corresponda).
3. Descarga la llave JSON y guárdala como `backend/service-account.json` (ya está en `.gitignore`).

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edita .env si necesitas cambiar paths o el projectId
npm install
npm run dev
```

El backend queda corriendo en `http://localhost:3001`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

El dashboard queda en `http://localhost:5173`. Vite hace proxy de `/api/*` → `http://localhost:3001`.

## Endpoint disponible

`GET /api/orders-summary?start=YYYY-MM-DD&end=YYYY-MM-DD`

- `start` (default `2026-04-01`): inicio del rango (inclusive).
- `end` (default `2026-05-01`): fin del rango (exclusive).

Devuelve `{ data: [{ Fecha, Plan_A, Plan_B, Error, Total }, ...] }`.
