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

    // Validación básica de formato YYYY-MM-DD
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
        WHERE JSON_EXTRACT_SCALAR(data, '$.company') = 'LP'
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

    res.json({ data, range: { start, end } });
  } catch (error) {
    console.error('BigQuery error:', error);
    res.status(500).json({ error: error.message });
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
