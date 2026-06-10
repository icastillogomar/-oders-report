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

app.use(cors());
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

// ─── Orders summary ─────────────────────────────────────────────────
// Devuelve el conteo diario de pedidos clasificados como Plan A, Plan B y Error.
app.get('/api/orders-summary', async (req, res) => {
  try {
    const start = req.query.start || '2026-04-01';
    const end = req.query.end || '2026-05-01';
    const company = req.query.company || 'LP';

    // Validación básica
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start) || !dateRegex.test(end)) {
      return res.status(400).json({
        error: 'Parámetros start y end deben tener formato YYYY-MM-DD',
      });
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
          AND JSON_EXTRACT_SCALAR(data, '$.productType') = 'Soft Line'
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

    const [rows] = await bigquery.query({
      query,
      params: {
        start: `${start} 00:00:00`,
        end: `${end} 00:00:00`,
        company: company,
      },
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

    res.json({ data, range: { start, end }, company });
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

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start) || !dateRegex.test(end)) {
      return res.status(400).json({ error: 'Formato de fecha inválido' });
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
      params: {
        start: `${start} 00:00:00`,
        end: `${end} 00:00:00`,
        company: company,
      },
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

    res.json({ data, range: { start, end }, company });
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

// ─── CSV Export for Error and Plan B ──────────────────────────────────
app.get('/api/orders-csv', async (req, res) => {
  try {
    const { start, end, company, type } = req.query;
    
    if (!start || !end || !company || !type) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos (start, end, company, type)' });
    }

    let query = '';
    let params = { start: `${start} 00:00:00`, end: `${end} 00:00:00` };
    let location = 'US'; // default

    if (type === 'summary') {
      params.company = company;
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
            AND JSON_EXTRACT_SCALAR(data, '$.productType') = 'Soft Line'
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

    // Obtener campos dinámicamente
    const fields = Object.keys(rows[0]);
    const csvHeader = fields.join(',') + '\n';
    
    const csvRows = rows.map(r => {
      return fields.map(field => {
        let value = r[field];
        if (value === null || value === undefined) return '';
        
        // Manejar objetos como fechas de BigQuery
        if (typeof value === 'object') {
           if (value.value) {
             value = value.value;
           } else {
             value = JSON.stringify(value);
           }
        }
        
        // Convertir a string y escapar comillas
        value = String(value).replace(/"/g, '""');
        
        // Envolver en comillas si es necesario
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value}"`;
        }
        return value;
      }).join(',');
    });
    const csvString = csvHeader + csvRows.join('\n');

    res.header('Content-Type', 'text/csv');
    res.attachment(`reporte_${company}_${type}_${start}_${end}.csv`);
    res.send(csvString);

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
