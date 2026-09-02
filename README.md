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

### Catálogo de errorCode

`frontend/src/errorCatalog.js` es la fuente única de verdad: etiqueta, descripción,
categoría y color de cada código. El color está fijado **por código**, no por
frecuencia, para que el mismo error se vea igual entre rangos de fecha y entre
vistas.

| Código | Etiqueta | Categoría | Significado |
|---|---|---|---|
| 0 | Sin error | Sin error | EDD calculada correctamente |
| 2 | Nodos en hold | Operación | El o los nodos están en hold (`edd_nodo_item_hold`) |
| 3 | Sin trazos para el CP | Cobertura | No hay trazos logísticos para ese código postal |
| 4 | Inventario insuficiente | Inventario | El inventario de la red no cubre la cantidad |
| 5 | Sin capacidad operativa | Capacidad | Sin capacidad operativa OMS |
| 6 | Sin capacidad 4PL | Capacidad | Sin capacidad del par (nodo, carrier) |
| 7 | Falla del solver | Motor | Falla real del solver (CBC). Genérico y ya poco frecuente: cuando la demanda no cabe en las cotas se reporta 4/5/6 con la causa real |
| 8 | Error inesperado de fecha | Motor | El motor no devolvió rutas, o devolvió una fecha vacía o malformada |
| 99 | Error del motor | Motor | Error del motor para ese CP (mensaje dinámico), o el motor no devolvió resultado para el SKU |

`normalizeCode` colapsa las variantes del dato (`'04'`, `4`, `' 4 '` → `'4'`).
Los códigos que no estén en la tabla reciben etiqueta genérica y un color
determinista derivado del propio código; los registros sin código caen en
**Sin código**.

### Desglose por errorCode

`GET /api/error-codes?start=YYYY-MM-DD&end=YYYY-MM-DD&company=SB&fulfillmentType=…`

Agrupa por `errorCode` los registros de `FAC_EDD_ORDERS_TRN` que caen en la
clasificación **Error**, usando el mismo `CASE` que `/api/orders-decomm` para que
el total cuadre exactamente con el KPI y la barra de % Error. Los `errorCode`
vacíos o nulos se agrupan como `SIN CÓDIGO`.

Devuelve `{ data: [{ errorCode, errorMessage, total }, ...], total }`.

Lo consume la gráfica de dona de la pestaña **SBB Decomm** (vista Planes A/B),
que se refresca con el rango de fechas y el filtro de tipo de surtido. Muestra
los 8 códigos más frecuentes y agrupa el resto en «Otros».

### Cotejo masivo de órdenes

`POST /api/orders-bulk-check`

```json
{ "orderNumbers": ["6310116494", "6310116495"] }
```

- Máximo **500 órdenes por petición** (el frontend divide la lista en lotes de 400).
- Acepta identificadores alfanuméricos de 6 a 64 caracteres: remisiones Suburbia
  (`sg2608090011688`), folios `KS0000438222`, UUIDs y órdenes numéricas.
- Para los IDs con prefijo de letras + dígitos busca **ambas variantes**
  (`sg2608090011688` y `2608090011688`) y reporta en `matchedWithoutPrefix`
  cuántas coincidieron solo sin prefijo. Los UUIDs no generan variante.
- Consulta `FAC_EDD_ORDERS_TRN` sobre los últimos **180 días**, todas las compañías.

Devuelve:

```json
{
  "orders": [{ "orderNumber", "found", "hasError", "lines", "linesWithError",
               "errorCodes": [], "plans": [], "company", "channel", "createdAt",
               "detail": [] }],
  "summary": { "requested", "invalid", "found", "notFound", "ordersWithError",
               "totalLines", "linesWithError", "errorCodeCounts": {} }
}
```

La vista **Cotejar Lista** del dashboard consume este endpoint: sube un CSV/Excel,
confirma las columnas de **remisión** y **SKU** (ambas se autodetectan) y obtiene
KPIs con porcentajes —con `errorCode`, sin error, sin coincidencia (orden no
encontrada vs. SKU no encontrado en la orden)—, el desglose por `errorCode` y la
exportación a CSV, que conserva las columnas originales del archivo y agrega las
columnas `_estatus`, `_errorCode`, `_errorMessage`, `_plan`, `_edd1`, `_edd2`,
`_origen`, `_company` y `_matchedAs`.

El cotejo por par remisión + SKU compara los SKU ignorando ceros a la izquierda.
Si se deja la columna de SKU en «Cotejar solo por orden», el veredicto es por orden.
