import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3001;

// exposedHeaders: el navegador necesita leer Content-Disposition para nombrar
// las descargas por segmento cuando el front no se sirve desde este Express.
app.use(
  cors({ exposedHeaders: ['Content-Disposition', 'X-Total-Rows', 'X-Truncated'] })
);
app.use(express.json());

// ─── BigQuery client ────────────────────────────────────────────────
// La Service Account NUNCA debe exponerse en el frontend.
// Se carga desde el path indicado por GOOGLE_APPLICATION_CREDENTIALS.
const bigquery = new BigQuery({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  projectId: process.env.GCP_PROJECT_ID,
});

// ─── Health check ───────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Orders summary (ATG) ──────────────────────────────────────────
// Devuelve el conteo diario de pedidos clasificados como Plan A, Plan B y Error.
// Valores permitidos para el filtro de tipo de surtido
const FULFILLMENT_TYPES = ['Liverpool_CNC_PICK_PACK', 'Fulfillment_Type_Liverpool'];

// Variantes de productType en las tablas: conviven el nombre completo y
// su abreviatura ('Soft Line'/'SL', 'Big Ticket'/'BT').
const productTypeVariants = (productType) => {
  const pt = String(productType || 'Soft Line').toUpperCase().trim();
  if (pt === 'BIG TICKET' || pt === 'BT') return ['BIG TICKET', 'BT'];
  if (pt === 'SOFT LINE' || pt === 'SL') return ['SOFT LINE', 'SL'];
  return [pt];
};

// Normaliza errorCode igual que el frontend (errorCatalog.normalizeCode):
// NULL o vacío → 'SIN CÓDIGO', '04' → '4', 'abc' → 'ABC'. Así la dona, sus
// porcentajes y el CSV de cada rebanada hablan siempre del mismo grupo.
const ERROR_CODE_NORM_SQL = `
        CASE
          WHEN errorCode IS NULL OR TRIM(errorCode) = '' THEN 'SIN CÓDIGO'
          WHEN REGEXP_CONTAINS(TRIM(errorCode), r'^\\d+$')
            THEN IFNULL(CAST(SAFE_CAST(TRIM(errorCode) AS INT64) AS STRING), UPPER(TRIM(errorCode)))
          ELSE UPPER(TRIM(errorCode))
        END`;

// ─── CSV helpers ────────────────────────────────────────────────────
/** Serializa un valor de BigQuery (incluidos {value} de DATE/TIMESTAMP) a CSV */
const csvValue = (raw) => {
  if (raw === null || raw === undefined) return '';
  let value = raw;
  if (typeof value === 'object') {
    value = value.value !== undefined ? value.value : JSON.stringify(value);
  }
  value = String(value).replace(/"/g, '""');
  return /[",\n\r]/.test(value) ? `"${value}"` : value;
};

/** Los campos se toman de la primera fila: BigQuery devuelve el mismo shape */
const toCSV = (rows) => {
  const fields = Object.keys(rows[0]);
  return [
    fields.join(','),
    ...rows.map((r) => fields.map((f) => csvValue(r[f])).join(',')),
  ].join('\n');
};

/** BOM al inicio: sin él Excel en Windows rompe los acentos del payload */
const BOM = '\uFEFF';

const sendCSV = (res, rows, filename) => {
  res.header('Content-Type', 'text/csv; charset=utf-8');
  res.attachment(filename);
  res.send(BOM + toCSV(rows));
};

/** Nombre de archivo seguro a partir de una etiqueta de la dona */
const slugify = (text, fallback) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || fallback;

app.get('/api/orders-summary', async (req, res) => {
  try {
    const start = req.query.start || '2026-04-01';
    const end = req.query.end || '2026-05-01';
    const company = req.query.company || 'LP';
    const productType = req.query.productType || 'Soft Line';
    const fulfillmentType = req.query.fulfillmentType;

    // Validación básica
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start) || !dateRegex.test(end)) {
      return res.status(400).json({
        error: 'Parámetros start y end deben tener formato YYYY-MM-DD',
      });
    }

    if (fulfillmentType && !FULFILLMENT_TYPES.includes(fulfillmentType)) {
      return res.status(400).json({ error: 'fulfillmentType inválido' });
    }

    const query = `
      WITH base AS (
        SELECT
          JSON_EXTRACT_SCALAR(data, '$.noPedido') AS noPedido,
          FORMAT_TIMESTAMP(
            '%Y-%m-%d',
            TIMESTAMP_SECONDS(CAST(JSON_EXTRACT_SCALAR(data, '$.createdAt._seconds') AS INT64)),
            'America/Mexico_City'
          ) AS Fecha,
          JSON_EXTRACT_SCALAR(data, '$.plan') AS plan,
          JSON_EXTRACT_SCALAR(data, '$.edd1') AS edd1,
          JSON_EXTRACT_SCALAR(data, '$.edd2') AS edd2
        FROM \`fechaestimadaentregaprod.alltables.tables_raw_changelog\`
        WHERE JSON_EXTRACT_SCALAR(data, '$.company') = @company
          AND UPPER(TRIM(JSON_EXTRACT_SCALAR(data, '$.productType'))) IN UNNEST(@productTypes)
          ${fulfillmentType ? "AND JSON_EXTRACT_SCALAR(data, '$.fulfillmentType') = @fulfillmentType" : ''}
          AND timestamp >= TIMESTAMP(@start, 'America/Mexico_City')
          AND timestamp <  TIMESTAMP(@end,   'America/Mexico_City')
      ),
      clasificado AS (
        SELECT
          Fecha,
          noPedido,
          CASE
            WHEN UPPER(plan) = 'B' THEN 'Plan B'
            WHEN edd1 IS NOT NULL AND edd1 <> ''
             AND edd2 IS NOT NULL AND edd2 <> '' THEN 'Plan A'
            ELSE 'Error'
          END AS clasificacion
        FROM base
      )
      SELECT
        Fecha,
        COUNTIF(clasificacion = 'Plan A') AS Plan_A,
        COUNTIF(clasificacion = 'Plan B') AS Plan_B,
        COUNTIF(clasificacion = 'Error')  AS Error,
        COUNT(*)                          AS Total
      FROM clasificado
      GROUP BY Fecha
      ORDER BY Fecha
    `;

    const productTypes = productTypeVariants(productType);

    const params = {
      start: `${start} 00:00:00`,
      end: `${end} 00:00:00`,
      company: company,
      productTypes: productTypes,
    };
    if (fulfillmentType) params.fulfillmentType = fulfillmentType;

    const [rows] = await bigquery.query({
      query,
      params,
      location: process.env.BQ_LOCATION || 'US',
    });

    // Asegurar que los conteos vengan como números nativos
    const data = rows.map((r) => ({
      Fecha: r.Fecha,
      Plan_A: Number(r.Plan_A),
      Plan_B: Number(r.Plan_B),
      Error: Number(r.Error),
      Total: Number(r.Total),
    }));

    res.json({ data, range: { start, end }, company, productType });
  } catch (error) {
    console.error('BigQuery error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Orders Decomm summary ──────────────────────────────────────────
// Devuelve métricas de la tabla FAC_EDD_ORDERS_TRN
app.get('/api/orders-decomm', async (req, res) => {
  try {
    const start = req.query.start || '2026-05-01';
    const end = req.query.end || '2026-05-28';
    const company = req.query.company || 'LP';
    const productType = req.query.productType; // Opcional para Decomm si no se filtra por defecto
    const fulfillmentType = req.query.fulfillmentType;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start) || !dateRegex.test(end)) {
      return res.status(400).json({ error: 'Formato de fecha inválido' });
    }

    if (fulfillmentType && !FULFILLMENT_TYPES.includes(fulfillmentType)) {
      return res.status(400).json({ error: 'fulfillmentType inválido' });
    }

    let filterProductType = '';
    const params = {
      start: `${start} 00:00:00`,
      end: `${end} 00:00:00`,
      company: company,
    };

    if (productType) {
      filterProductType = 'AND UPPER(TRIM(productType)) IN UNNEST(@productTypes)';
      params.productTypes = productTypeVariants(productType);
    }

    let filterFulfillment = '';
    if (fulfillmentType) {
      filterFulfillment = 'AND fulfillmentType = @fulfillmentType';
      params.fulfillmentType = fulfillmentType;
    }

    const query = `
      WITH base AS (
        SELECT
          FORMAT_TIMESTAMP('%Y-%m-%d', ingestionTimestamp, 'America/Mexico_City') AS Fecha,
          plan,
          edd1,
          edd2
        FROM \`crp-pro-dig-edd.mus_pro_digital_prd_tbls.FAC_EDD_ORDERS_TRN\`
        WHERE company = @company
          ${filterProductType}
          ${filterFulfillment}
          AND ingestionTimestamp >= TIMESTAMP(@start, 'America/Mexico_City')
          AND ingestionTimestamp <  TIMESTAMP(@end,   'America/Mexico_City')
      ),
      clasificado AS (
        SELECT
          Fecha,
          CASE
            WHEN plan = 'B' THEN 'Plan B'
            WHEN plan = 'A' AND edd1 IS NOT NULL AND edd2 IS NOT NULL THEN 'Plan A'
            ELSE 'Error'
          END AS clasificacion
        FROM base
      )
      SELECT
        Fecha,
        COUNTIF(clasificacion = 'Plan A') AS Plan_A,
        COUNTIF(clasificacion = 'Plan B') AS Plan_B,
        COUNTIF(clasificacion = 'Error')  AS Error,
        COUNT(*)                          AS Total
      FROM clasificado
      GROUP BY Fecha
      ORDER BY Fecha
    `;

    const [rows] = await bigquery.query({
      query,
      params,
      // Forzamos el proyecto para esta consulta específica
      projectId: 'crp-pro-dig-edd'
    });

    const data = rows.map((r) => ({
      Fecha: r.Fecha,
      Plan_A: Number(r.Plan_A),
      Plan_B: Number(r.Plan_B),
      Error: Number(r.Error),
      Total: Number(r.Total),
    }));

    res.json({ data, range: { start, end }, company, productType });
  } catch (error) {
    console.error('BigQuery Decomm error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Orders Recalculate summary ─────────────────────────────────────
// Devuelve métricas de la tabla FAC_EDD_RECALCULATE_TRN
app.get('/api/orders-recalculate', async (req, res) => {
  try {
    const start = req.query.start || '2026-05-01';
    const end = req.query.end || '2026-05-28';
    let company = req.query.company || 'LP';
    
    // Mapeo de códigos de empresa al nombre esperado en el JSON (EnterpriseCode)
    let enterpriseCode = company === 'SB' || company === 'SBB' ? 'Suburbia' : 'Liverpool';

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start) || !dateRegex.test(end)) {
      return res.status(400).json({ error: 'Formato de fecha inválido' });
    }

    const query = `
      WITH base AS (
        SELECT
          FORMAT_TIMESTAMP('%Y-%m-%d', _ingested_at, 'America/Mexico_City') AS Fecha,
          JSON_EXTRACT_SCALAR(rawPayload, '$.Order.OrderLines.OrderLine[0].Extn.ExtnPromiseEDD1') as edd1,
          JSON_EXTRACT_SCALAR(rawPayload, '$.Order.OrderLines.OrderLine[0].Extn.ExtnPromiseEDD2') as edd2
        FROM \`crp-pro-dig-edd.mus_pro_digital_prd_tbls.FAC_EDD_RECALCULATE_TRN\`
        WHERE messageType = 'ORDER_CREATED'
          AND JSON_EXTRACT_SCALAR(rawPayload, '$.Order.EnterpriseCode') = @enterpriseCode
          AND _ingested_at >= TIMESTAMP(@start, 'America/Mexico_City')
          AND _ingested_at <  TIMESTAMP(@end,   'America/Mexico_City')
      ),
      clasificado AS (
        SELECT
          Fecha,
          CASE
            WHEN edd1 IS NOT NULL AND edd2 IS NOT NULL THEN 'Plan A'
            ELSE 'Error'
          END AS clasificacion
        FROM base
      )
      SELECT
        Fecha,
        COUNTIF(clasificacion = 'Plan A') AS Plan_A,
        0 AS Plan_B,
        COUNTIF(clasificacion = 'Error')  AS Error,
        COUNT(*)                          AS Total
      FROM clasificado
      GROUP BY Fecha
      ORDER BY Fecha
    `;

    const [rows] = await bigquery.query({
      query,
      params: {
        start: `${start} 00:00:00`,
        end: `${end} 00:00:00`,
        enterpriseCode: enterpriseCode,
      },
      projectId: 'crp-pro-dig-edd'
    });

    const data = rows.map((r) => ({
      Fecha: r.Fecha,
      Plan_A: Number(r.Plan_A),
      Plan_B: Number(r.Plan_B),
      Error: Number(r.Error),
      Total: Number(r.Total),
    }));

    res.json({ data, range: { start, end }, company });
  } catch (error) {
    console.error('BigQuery Recalculate error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Error codes breakdown (Decomm) ────────────────────────────────
// Agrupa por errorCode los registros que la vista clasifica como "Error",
// usando exactamente el mismo CASE que /api/orders-decomm para que los
// totales cuadren con el KPI y la barra de % Error.
app.get('/api/error-codes', async (req, res) => {
  try {
    const start = req.query.start || '2026-05-01';
    const end = req.query.end || '2026-05-28';
    const company = req.query.company || 'SB';
    const productType = req.query.productType;
    const fulfillmentType = req.query.fulfillmentType;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start) || !dateRegex.test(end)) {
      return res.status(400).json({ error: 'Formato de fecha inválido' });
    }

    if (fulfillmentType && !FULFILLMENT_TYPES.includes(fulfillmentType)) {
      return res.status(400).json({ error: 'fulfillmentType inválido' });
    }

    const params = {
      start: `${start} 00:00:00`,
      end: `${end} 00:00:00`,
      company,
    };

    let filterProductType = '';
    if (productType) {
      filterProductType = 'AND UPPER(TRIM(productType)) IN UNNEST(@productTypes)';
      params.productTypes = productTypeVariants(productType);
    }

    let filterFulfillment = '';
    if (fulfillmentType) {
      filterFulfillment = 'AND fulfillmentType = @fulfillmentType';
      params.fulfillmentType = fulfillmentType;
    }

    const query = `
      WITH base AS (
        SELECT
          ${ERROR_CODE_NORM_SQL} AS errorCode,
          errorMessage,
          CASE
            WHEN plan = 'B' THEN 'Plan B'
            WHEN plan = 'A' AND edd1 IS NOT NULL AND edd2 IS NOT NULL THEN 'Plan A'
            ELSE 'Error'
          END AS clasificacion
        FROM \`crp-pro-dig-edd.mus_pro_digital_prd_tbls.FAC_EDD_ORDERS_TRN\`
        WHERE company = @company
          ${filterProductType}
          ${filterFulfillment}
          AND ingestionTimestamp >= TIMESTAMP(@start, 'America/Mexico_City')
          AND ingestionTimestamp <  TIMESTAMP(@end,   'America/Mexico_City')
      )
      SELECT
        errorCode,
        ANY_VALUE(NULLIF(TRIM(errorMessage), '')) AS errorMessage,
        COUNT(*)                                  AS total
      FROM base
      WHERE clasificacion = 'Error'
      GROUP BY errorCode
      ORDER BY total DESC
    `;

    const [rows] = await bigquery.query({
      query,
      params,
      projectId: 'crp-pro-dig-edd',
    });

    const data = rows.map((r) => ({
      errorCode: r.errorCode,
      errorMessage: r.errorMessage || null,
      total: Number(r.total),
    }));

    const total = data.reduce((a, d) => a + d.total, 0);

    res.json({ data, total, range: { start, end }, company, productType });
  } catch (error) {
    console.error('BigQuery Error Codes error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── CSV de un segmento de la dona de errorCode ────────────────────
// Descarga los registros crudos detrás de una rebanada de "Composición del
// % Error por errorCode": un código suelto, un grupo (categoría u "Otros")
// o todo el universo de errores del rango.
//   ?codes=4            → solo inventario insuficiente
//   ?codes=5,6          → categoría Capacidad
//   ?codes=SIN CÓDIGO   → los que llegan sin errorCode
//   sin codes (o all)   → todos los errores
// Reproduce filtro por filtro el WHERE de /api/error-codes, así el número de
// filas del CSV cuadra con el que muestra la leyenda de la dona.
const ERROR_CSV_MAX_ROWS = 100000;
const ERROR_CSV_MAX_CODES = 60;

app.get('/api/error-codes-csv', async (req, res) => {
  try {
    const start = req.query.start || '2026-05-01';
    const end = req.query.end || '2026-05-28';
    const company = req.query.company || 'SB';
    const productType = req.query.productType;
    const fulfillmentType = req.query.fulfillmentType;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start) || !dateRegex.test(end)) {
      return res.status(400).send('Formato de fecha inválido');
    }

    if (fulfillmentType && !FULFILLMENT_TYPES.includes(fulfillmentType)) {
      return res.status(400).send('fulfillmentType inválido');
    }

    const rawCodes = String(req.query.codes ?? '').trim();
    const codes =
      rawCodes && rawCodes.toLowerCase() !== 'all'
        ? [...new Set(rawCodes.split(',').map((c) => c.trim()).filter(Boolean))]
        : null;

    if (codes && codes.length === 0) {
      return res.status(400).send('El parámetro codes no trae ningún código válido');
    }
    if (codes && codes.length > ERROR_CSV_MAX_CODES) {
      return res
        .status(400)
        .send(`Máximo ${ERROR_CSV_MAX_CODES} códigos por descarga`);
    }
    if (codes && codes.some((c) => c.length > 64)) {
      return res.status(400).send('Código de error demasiado largo');
    }

    const params = {
      start: `${start} 00:00:00`,
      end: `${end} 00:00:00`,
      company,
    };

    let filterProductType = '';
    if (productType) {
      filterProductType = 'AND UPPER(TRIM(productType)) IN UNNEST(@productTypes)';
      params.productTypes = productTypeVariants(productType);
    }

    let filterFulfillment = '';
    if (fulfillmentType) {
      filterFulfillment = 'AND fulfillmentType = @fulfillmentType';
      params.fulfillmentType = fulfillmentType;
    }

    let filterCodes = '';
    if (codes) {
      filterCodes = 'AND errorCodeNormalizado IN UNNEST(@codes)';
      params.codes = codes;
    }

    const query = `
      WITH base AS (
        SELECT
          *,
          ${ERROR_CODE_NORM_SQL} AS errorCodeNormalizado,
          CASE
            WHEN plan = 'B' THEN 'Plan B'
            WHEN plan = 'A' AND edd1 IS NOT NULL AND edd2 IS NOT NULL THEN 'Plan A'
            ELSE 'Error'
          END AS clasificacion
        FROM \`crp-pro-dig-edd.mus_pro_digital_prd_tbls.FAC_EDD_ORDERS_TRN\`
        WHERE company = @company
          ${filterProductType}
          ${filterFulfillment}
          AND ingestionTimestamp >= TIMESTAMP(@start, 'America/Mexico_City')
          AND ingestionTimestamp <  TIMESTAMP(@end,   'America/Mexico_City')
      )
      SELECT * FROM base
      WHERE clasificacion = 'Error'
        ${filterCodes}
      ORDER BY ingestionTimestamp
      LIMIT ${ERROR_CSV_MAX_ROWS}
    `;

    const [rows] = await bigquery.query({
      query,
      params,
      ...(codes ? { types: { codes: ['STRING'] } } : {}),
      projectId: 'crp-pro-dig-edd',
    });

    if (rows.length === 0) {
      return res
        .status(404)
        .send('No hay registros con Error para ese segmento en el rango seleccionado.');
    }

    // Un CSV truncado en silencio se lee como si fuera el universo completo:
    // el corte se anuncia en el nombre del archivo y en las cabeceras.
    const truncated = rows.length >= ERROR_CSV_MAX_ROWS;
    const segmento = slugify(
      req.query.label || (codes ? codes.join('-') : 'todos'),
      'segmento'
    );
    const filename = `errores_${company}_${segmento}_${start}_${end}${
      truncated ? `_PARCIAL-primeros-${ERROR_CSV_MAX_ROWS}` : ''
    }.csv`;

    res.header('X-Total-Rows', String(rows.length));
    res.header('X-Truncated', truncated ? 'true' : 'false');
    sendCSV(res, rows, filename);
  } catch (error) {
    console.error('BigQuery Error Codes CSV error:', error);
    res.status(500).send('Error generando CSV: ' + error.message);
  }
});

// ─── Delivery types (Flash / Siguiente Día / Estándar) ─────────────
// Clasifica cada línea según la promesa de entrega:
//   edd1 = edd2 = día de compra      → Flash Mismo Día
//   edd1 = edd2 = día siguiente      → Siguiente Día
//   cualquier otro caso con fechas   → Estándar
//   sin edd1 o edd2                  → Sin EDD
// Además regresa las asignaciones por tienda (columna origen).
app.get('/api/delivery-types', async (req, res) => {
  try {
    const start = req.query.start || '2026-07-31';
    const end = req.query.end || '2026-08-01';
    const company = req.query.company || 'LP';
    const productType = req.query.productType;

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start) || !dateRegex.test(end)) {
      return res.status(400).json({ error: 'Formato de fecha inválido' });
    }

    let filterProductType = '';
    const params = {
      start: `${start} 00:00:00`,
      end: `${end} 00:00:00`,
      company: company,
    };

    if (productType) {
      filterProductType = 'AND UPPER(TRIM(productType)) IN UNNEST(@productTypes)';
      params.productTypes = productTypeVariants(productType);
    }

    const baseCTE = `
      WITH base AS (
        SELECT
          FORMAT_TIMESTAMP('%Y-%m-%d', ingestionTimestamp, 'America/Mexico_City') AS Fecha,
          DATE(createdAt, 'America/Mexico_City') AS fechaCompra,
          edd1,
          edd2,
          origen
        FROM \`crp-pro-dig-edd.mus_pro_digital_prd_tbls.FAC_EDD_ORDERS_TRN\`
        WHERE company = @company
          ${filterProductType}
          AND ingestionTimestamp >= TIMESTAMP(@start, 'America/Mexico_City')
          AND ingestionTimestamp <  TIMESTAMP(@end,   'America/Mexico_City')
      ),
      clasificado AS (
        SELECT
          Fecha,
          origen,
          CASE
            WHEN edd1 IS NULL OR edd2 IS NULL THEN 'SinEDD'
            WHEN edd1 = edd2 AND edd1 = fechaCompra THEN 'Flash'
            WHEN edd1 = edd2 AND edd1 = DATE_ADD(fechaCompra, INTERVAL 1 DAY) THEN 'SiguienteDia'
            ELSE 'Estandar'
          END AS tipo
        FROM base
      )
    `;

    const queryByDay = `${baseCTE}
      SELECT
        Fecha,
        COUNTIF(tipo = 'Flash')        AS Flash,
        COUNTIF(tipo = 'SiguienteDia') AS Siguiente_Dia,
        COUNTIF(tipo = 'Estandar')     AS Estandar,
        COUNTIF(tipo = 'SinEDD')       AS Sin_EDD,
        COUNT(*)                       AS Total
      FROM clasificado
      GROUP BY Fecha
      ORDER BY Fecha
    `;

    // origen NULL = línea surtida fuera de la red propia (mayormente Marketplace)
    const queryStores = `${baseCTE}
      SELECT
        IFNULL(origen, 'MKTP') AS tienda,
        COUNT(*) AS asignaciones
      FROM clasificado
      GROUP BY tienda
      ORDER BY asignaciones DESC
    `;

    const [[byDayRows], [storeRows]] = await Promise.all([
      bigquery.query({ query: queryByDay, params, projectId: 'crp-pro-dig-edd' }),
      bigquery.query({ query: queryStores, params, projectId: 'crp-pro-dig-edd' }),
    ]);

    const byDay = byDayRows.map((r) => ({
      Fecha: r.Fecha,
      Flash: Number(r.Flash),
      Siguiente_Dia: Number(r.Siguiente_Dia),
      Estandar: Number(r.Estandar),
      Sin_EDD: Number(r.Sin_EDD),
      Total: Number(r.Total),
    }));

    const stores = storeRows.map((r) => ({
      tienda: r.tienda,
      asignaciones: Number(r.asignaciones),
    }));

    const totals = byDay.reduce(
      (acc, d) => ({
        flash: acc.flash + d.Flash,
        siguienteDia: acc.siguienteDia + d.Siguiente_Dia,
        estandar: acc.estandar + d.Estandar,
        sinEDD: acc.sinEDD + d.Sin_EDD,
        total: acc.total + d.Total,
      }),
      { flash: 0, siguienteDia: 0, estandar: 0, sinEDD: 0, total: 0 }
    );

    res.json({ byDay, stores, totals, range: { start, end }, company, productType });
  } catch (error) {
    console.error('BigQuery Delivery Types error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Order search ───────────────────────────────────────────────────
// Busca una orden/remisión por número en FAC_EDD_ORDERS_TRN (Decomm),
// sobre los últimos 180 días, sin importar la compañía. Devuelve todas
// las líneas (SKUs) con su tipo de entrega ya clasificado.
app.get('/api/order-search', async (req, res) => {
  try {
    const orderNumber = String(req.query.orderNumber || '').trim();

    if (!/^\d{6,20}$/.test(orderNumber)) {
      return res.status(400).json({
        error: 'El número de orden debe tener entre 6 y 20 dígitos',
      });
    }

    const query = `
      SELECT
        orderNumber,
        sku,
        quantity,
        origen,
        storeSelected,
        fulfillmentType,
        productType,
        company,
        channel,
        CAST(marketPlace AS STRING) AS marketPlace,
        paymentMethod,
        zipCode,
        destinationCity,
        destinationMunicipality,
        destinationSuburb,
        destinationStreet,
        FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', createdAt, 'America/Mexico_City') AS createdAt,
        CAST(edd1 AS STRING) AS edd1,
        CAST(edd2 AS STRING) AS edd2,
        estimatedDeliveryLabel,
        plan,
        CAST(hasError AS STRING) AS hasError,
        errorCode,
        errorMessage,
        CAST(isOk AS STRING) AS isOk,
        ticket,
        recordId,
        CASE
          WHEN edd1 IS NULL OR edd2 IS NULL THEN 'sin_edd'
          WHEN edd1 = edd2 AND edd1 = DATE(createdAt, 'America/Mexico_City') THEN 'flash'
          WHEN edd1 = edd2 AND edd1 = DATE_ADD(DATE(createdAt, 'America/Mexico_City'), INTERVAL 1 DAY) THEN 'siguiente_dia'
          ELSE 'estandar'
        END AS tipoEntrega
      FROM \`crp-pro-dig-edd.mus_pro_digital_prd_tbls.FAC_EDD_ORDERS_TRN\`
      WHERE ingestionTimestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 180 DAY)
        AND orderNumber = @orderNumber
      ORDER BY edd1 NULLS LAST, sku
    `;

    const [rows] = await bigquery.query({
      query,
      params: { orderNumber },
      projectId: 'crp-pro-dig-edd',
    });

    res.json({ orderNumber, found: rows.length > 0, lines: rows });
  } catch (error) {
    console.error('BigQuery Order Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Bulk order check (cotejo masivo desde CSV/Excel) ───────────────
// Recibe un lote de números de orden y devuelve, para cada uno, sus líneas
// en FAC_EDD_ORDERS_TRN (últimos 180 días, todas las compañías) más un
// resumen listo para calcular porcentajes en el frontend.
// Las remisiones no son numéricas: conviven `sg2608090011688` (Suburbia),
// `KS0000438222` y UUIDs. Aceptamos cualquier identificador alfanumérico y,
// como red de seguridad, buscamos también la variante sin prefijo de letras
// (sg2608090011688 → 2608090011688) por si la tabla la guarda sin él.
const BULK_MAX_BATCH = 500;
const ORDER_ID_RE = /^[A-Za-z0-9._-]{6,64}$/;
// Solo aplica a IDs tipo `sg2608090011688` o `KS0000438222`: prefijo de letras
// seguido únicamente de dígitos. Un UUID (d0088ff0-5363-…) no genera variante.
const bareId = (id) => {
  const m = /^[A-Za-z]+(\d{6,})$/.exec(id);
  return m ? m[1] : null;
};

app.post('/api/orders-bulk-check', async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.orderNumbers) ? req.body.orderNumbers : null;

    if (!raw || raw.length === 0) {
      return res.status(400).json({ error: 'Envía un arreglo orderNumbers con al menos un elemento' });
    }

    const orderNumbers = [
      ...new Set(raw.map((n) => String(n ?? '').trim()).filter((n) => ORDER_ID_RE.test(n))),
    ];

    const invalidCount = raw.length - orderNumbers.length;

    if (orderNumbers.length === 0) {
      return res.status(400).json({
        error: 'Ningún identificador del lote es válido (6 a 64 caracteres alfanuméricos)',
      });
    }

    if (orderNumbers.length > BULK_MAX_BATCH) {
      return res.status(400).json({
        error: `El lote excede el máximo de ${BULK_MAX_BATCH} órdenes. Divide la petición.`,
      });
    }

    // Mapa variante → id original solicitado, para regresar los resultados
    // con el mismo identificador que mandó el usuario.
    const lookup = new Map();
    const variants = new Set();
    for (const id of orderNumbers) {
      variants.add(id);
      lookup.set(id, id);
      const bare = bareId(id);
      if (bare && !lookup.has(bare)) {
        variants.add(bare);
        lookup.set(bare, id);
      }
    }

    const query = `
      SELECT
        orderNumber,
        sku,
        quantity,
        origen,
        storeSelected,
        fulfillmentType,
        productType,
        company,
        channel,
        paymentMethod,
        zipCode,
        destinationCity,
        FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', createdAt, 'America/Mexico_City') AS createdAt,
        CAST(edd1 AS STRING) AS edd1,
        CAST(edd2 AS STRING) AS edd2,
        plan,
        CAST(hasError AS STRING) AS hasError,
        errorCode,
        errorMessage,
        ticket,
        recordId
      FROM \`crp-pro-dig-edd.mus_pro_digital_prd_tbls.FAC_EDD_ORDERS_TRN\`
      WHERE ingestionTimestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 180 DAY)
        AND orderNumber IN UNNEST(@candidates)
      ORDER BY orderNumber, edd1 NULLS LAST, sku
    `;

    const candidates = [...variants];

    const [rows] = await bigquery.query({
      query,
      params: { candidates },
      types: { candidates: ['STRING'] },
      projectId: 'crp-pro-dig-edd',
    });

    // Agrupamos por orden y calculamos el veredicto de cada una.
    const byOrder = new Map();
    for (const num of orderNumbers) {
      byOrder.set(num, {
        orderNumber: num,
        matchedAs: null,
        found: false,
        lines: 0,
        linesWithError: 0,
        errorCodes: [],
        company: null,
        channel: null,
        createdAt: null,
        plans: [],
        detail: [],
      });
    }

    for (const r of rows) {
      const requested = lookup.get(String(r.orderNumber));
      const entry = requested ? byOrder.get(requested) : null;
      if (!entry) continue;
      entry.found = true;
      entry.matchedAs = entry.matchedAs ?? String(r.orderNumber);
      entry.lines += 1;
      entry.company = entry.company ?? r.company;
      entry.channel = entry.channel ?? r.channel;
      entry.createdAt = entry.createdAt ?? r.createdAt;
      if (r.plan && !entry.plans.includes(r.plan)) entry.plans.push(r.plan);

      const code = r.errorCode ? String(r.errorCode).trim() : '';
      const flagged = String(r.hasError) === 'true';
      if (code || flagged) {
        entry.linesWithError += 1;
        if (code && !entry.errorCodes.includes(code)) entry.errorCodes.push(code);
      }
      entry.detail.push(r);
    }

    const orders = [...byOrder.values()].map((o) => ({
      ...o,
      hasError: o.linesWithError > 0,
    }));

    // Resumen agregado del lote (el frontend acumula lote por lote).
    const totalLines = rows.length;
    const linesWithError = orders.reduce((a, o) => a + o.linesWithError, 0);
    const foundOrders = orders.filter((o) => o.found);
    const errorOrders = foundOrders.filter((o) => o.hasError);

    // Conteo por código de error, a nivel línea.
    const errorCodeCounts = {};
    for (const r of rows) {
      const code = r.errorCode ? String(r.errorCode).trim() : '';
      const flagged = String(r.hasError) === 'true';
      if (!code && !flagged) continue;
      const key = code || 'SIN_CODIGO';
      errorCodeCounts[key] = (errorCodeCounts[key] || 0) + 1;
    }

    res.json({
      orders,
      summary: {
        requested: orderNumbers.length,
        invalid: invalidCount,
        found: foundOrders.length,
        notFound: orderNumbers.length - foundOrders.length,
        ordersWithError: errorOrders.length,
        // Diagnóstico: órdenes que solo aparecieron al quitarles el prefijo (sg, KS…)
        matchedWithoutPrefix: foundOrders.filter((o) => o.matchedAs !== o.orderNumber).length,
        totalLines,
        linesWithError,
        errorCodeCounts,
      },
    });
  } catch (error) {
    console.error('BigQuery Bulk Check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── CSV Export for Error and Plan B ──────────────────────────────────
app.get('/api/orders-csv', async (req, res) => {
  try {
    const { start, end, company, type, productType, fulfillmentType } = req.query;

    if (!start || !end || !company || !type) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos (start, end, company, type)' });
    }

    if (fulfillmentType && !FULFILLMENT_TYPES.includes(fulfillmentType)) {
      return res.status(400).json({ error: 'fulfillmentType inválido' });
    }

    let query = '';
    let params = { start: `${start} 00:00:00`, end: `${end} 00:00:00` };
    let location = 'US'; // default
    if (fulfillmentType) params.fulfillmentType = fulfillmentType;

    const productTypes = productTypeVariants(productType);

    if (type === 'summary') {
      params.company = company;
      params.productTypes = productTypes;
      location = process.env.BQ_LOCATION || 'US';
      query = `
        WITH base AS (
          SELECT
            JSON_EXTRACT_SCALAR(data, '$.plan') AS plan_ext,
            JSON_EXTRACT_SCALAR(data, '$.edd1') AS edd1_ext,
            JSON_EXTRACT_SCALAR(data, '$.edd2') AS edd2_ext,
            *
          FROM \`fechaestimadaentregaprod.alltables.tables_raw_changelog\`
          WHERE JSON_EXTRACT_SCALAR(data, '$.company') = @company
            AND UPPER(TRIM(JSON_EXTRACT_SCALAR(data, '$.productType'))) IN UNNEST(@productTypes)
            ${fulfillmentType ? "AND JSON_EXTRACT_SCALAR(data, '$.fulfillmentType') = @fulfillmentType" : ''}
            AND timestamp >= TIMESTAMP(@start, 'America/Mexico_City')
            AND timestamp <  TIMESTAMP(@end,   'America/Mexico_City')
        ),
        clasificado AS (
          SELECT *,
            CASE
              WHEN UPPER(plan_ext) = 'B' THEN 'Plan B'
              WHEN edd1_ext IS NOT NULL AND edd1_ext <> '' AND edd2_ext IS NOT NULL AND edd2_ext <> '' THEN 'Plan A'
              ELSE 'Error'
            END AS clasificacion
          FROM base
        )
        SELECT * EXCEPT(plan_ext, edd1_ext, edd2_ext) FROM clasificado WHERE clasificacion IN ('Error', 'Plan B')
      `;
    } else if (type === 'decomm') {
      params.company = company;
      let filterProductType = '';
      if (productType) {
        filterProductType = 'AND UPPER(TRIM(productType)) IN UNNEST(@productTypes)';
        params.productTypes = productTypeVariants(productType);
      }
      query = `
        WITH base AS (
          SELECT *,
            CASE
              WHEN plan = 'B' THEN 'Plan B'
              WHEN plan = 'A' AND edd1 IS NOT NULL AND edd2 IS NOT NULL THEN 'Plan A'
              ELSE 'Error'
            END AS clasificacion
          FROM \`crp-pro-dig-edd.mus_pro_digital_prd_tbls.FAC_EDD_ORDERS_TRN\`
          WHERE company = @company
            ${filterProductType}
            ${fulfillmentType ? 'AND fulfillmentType = @fulfillmentType' : ''}
            AND ingestionTimestamp >= TIMESTAMP(@start, 'America/Mexico_City')
            AND ingestionTimestamp <  TIMESTAMP(@end,   'America/Mexico_City')
        )
        SELECT * FROM base WHERE clasificacion IN ('Error', 'Plan B')
      `;
    } else if (type === 'recalc') {
      params.enterpriseCode = company === 'SB' || company === 'SBB' ? 'Suburbia' : 'Liverpool';
      query = `
        WITH base AS (
          SELECT *,
            CASE
              WHEN JSON_EXTRACT_SCALAR(rawPayload, '$.Order.OrderLines.OrderLine[0].Extn.ExtnPromiseEDD1') IS NOT NULL 
               AND JSON_EXTRACT_SCALAR(rawPayload, '$.Order.OrderLines.OrderLine[0].Extn.ExtnPromiseEDD2') IS NOT NULL THEN 'Plan A'
              ELSE 'Error'
            END AS clasificacion
          FROM \`crp-pro-dig-edd.mus_pro_digital_prd_tbls.FAC_EDD_RECALCULATE_TRN\`
          WHERE messageType = 'ORDER_CREATED'
            AND JSON_EXTRACT_SCALAR(rawPayload, '$.Order.EnterpriseCode') = @enterpriseCode
            AND _ingested_at >= TIMESTAMP(@start, 'America/Mexico_City')
            AND _ingested_at <  TIMESTAMP(@end,   'America/Mexico_City')
        )
        SELECT * FROM base WHERE clasificacion IN ('Error', 'Plan B')
      `;
    } else {
      return res.status(400).json({ error: 'Tipo inválido (summary, decomm, recalc)' });
    }

    const [rows] = await bigquery.query({
      query,
      params,
      projectId: type === 'summary' ? process.env.GCP_PROJECT_ID : 'crp-pro-dig-edd',
      location: location,
    });

    if (rows.length === 0) {
      return res.status(404).send('No se encontraron registros de Error o Plan B para este rango.');
    }

    sendCSV(res, rows, `reporte_${company}_${type}_${start}_${end}.csv`);

  } catch (error) {
    console.error('BigQuery CSV Export error:', error);
    res.status(500).send('Error generando CSV: ' + error.message);
  }
});

// ─── Serve Frontend ──────────────────────────────────────────────────
// Sirve los archivos estáticos desde la carpeta 'dist'
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Cualquier otra ruta sirve el index.html (para soporte de SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`✓ Servidor corriendo en el puerto ${port}`);
});
