import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  Download,
  RotateCcw,
  ListChecks,
  Columns3,
  Loader2,
  Copy,
  Check,
  PackageSearch,
  Info,
} from 'lucide-react';
import { getError } from '../errorCatalog.js';

/* ─────────────────── constantes ─────────────────── */

const BATCH_SIZE = 400;
const MAX_ORDERS = 20000;
const ACCEPTED = '.csv,.txt,.tsv,.xlsx,.xls,.xlsm';

/** Identificadores válidos: sg2608090011688, KS0000438222, UUIDs, 6310116494… */
const ORDER_ID_RE = /^[A-Za-z0-9._-]{6,64}$/;

const ORDER_HEADER_HINTS = [
  'remisión', 'remision', 'ordernumber', 'order number', 'order_number', 'orden',
  'no_pedido', 'nopedido', 'no pedido', 'no. pedido', 'numero de orden',
  'número de orden', 'num orden', 'pedido', 'order', 'order id', 'folio',
];

const SKU_HEADER_HINTS = ['sku', 'sku_cve', 'sku cve', 'skucve', 'clave sku', 'cve sku', 'articulo', 'artículo'];

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'error', label: 'Con errorCode' },
  { key: 'ok', label: 'Sin error' },
  { key: 'nosku', label: 'SKU no encontrado' },
  { key: 'notfound', label: 'Orden no encontrada' },
];

const STATUS = {
  error:    { label: 'Con error',           badge: 'badge--noedd' },
  ok:       { label: 'Sin error',           badge: 'badge--plan' },
  nosku:    { label: 'SKU no encontrado',   badge: 'badge--planb' },
  notfound: { label: 'Orden no encontrada', badge: 'badge--standard' },
};

/* ─────────────────── helpers ─────────────────── */

const pct = (part, total) => (total > 0 ? (part / total) * 100 : 0);
const fmtPct = (n) => `${n.toFixed(1).replace(/\.0$/, '')}%`;
const fmtNum = (n) => n.toLocaleString('es-MX');
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Normaliza una celda a identificador de orden/remisión.
 *  Devuelve '' si claramente no lo es (fechas, decimales, celdas vacías).
 *  Excel guarda fechas como serial flotante: sin este filtro una columna de
 *  fechas parecería una lista de órdenes válidas. */
const cellToId = (cell) => {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return '';
  if (typeof cell === 'number') return Number.isInteger(cell) ? String(cell) : '';
  const s = String(cell).trim();
  if (!s) return '';
  if (/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(s)) return ''; // 2026-08-01, 01/08/2026
  if (/^-?\d+[.,]\d+$/.test(s)) return ''; // montos
  return ORDER_ID_RE.test(s) ? s : '';
};

/** SKU: cualquier texto corto no vacío; se compara sin ceros a la izquierda */
const cellToSku = (cell) => {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'number') return Number.isInteger(cell) ? String(cell) : '';
  return String(cell).trim();
};
const skuKey = (s) => String(s ?? '').trim().replace(/^0+(?=\d)/, '').toUpperCase();

/** Lee CSV/TSV/XLSX y devuelve { headers, rows }.
 *  SheetJS pesa ~430 kB, se carga solo al subir un archivo. */
async function parseFile(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('El archivo no tiene hojas legibles.');
  // raw: true evita que Excel formatee identificadores largos como notación
  // científica (6310116494 → "6.31E+09"), lo que rompería el cotejo.
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1, blankrows: false, defval: '', raw: true,
  });
  if (matrix.length === 0) throw new Error('El archivo está vacío.');

  const first = matrix[0].map((c) => String(c ?? '').trim());
  const numericCells = first.filter((c) => c && /^\d[\d\s-]*$/.test(c)).length;
  const hasHeader = first.some(Boolean) && numericCells < Math.max(1, first.filter(Boolean).length);

  const headers = hasHeader
    ? first.map((h, i) => h || `Columna ${i + 1}`)
    : first.map((_, i) => `Columna ${i + 1}`);
  const rows = hasHeader ? matrix.slice(1) : matrix;

  return { headers, rows };
}

/** Elige columna por nombre conocido; si no, por cantidad de valores válidos */
function guessColumn(headers, rows, hints, valueFn) {
  const sample = rows.slice(0, 200);
  let best = { index: -1, score: -1 };
  headers.forEach((h, i) => {
    const named = hints.includes(norm(h)) ? 1000 : 0;
    const hits = sample.filter((r) => valueFn(r?.[i])).length;
    const score = hits + named;
    if (score > best.score) best = { index: i, score };
  });
  return best.score > 0 ? best.index : -1;
}

function toCSV(rows, fields) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [fields.join(','), ...rows.map((r) => fields.map((f) => esc(r[f])).join(','))].join('\n');
}

function download(filename, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─────────────────── subcomponentes ─────────────────── */

function StatCard({ tone = 'neutral', icon: Icon, label, value, sub, bar }) {
  return (
    <div className={`bulk-stat bulk-stat--${tone}`}>
      <div className="bulk-stat__head">
        <Icon size={15} strokeWidth={2.2} />
        <span>{label}</span>
      </div>
      <strong className="bulk-stat__value">{value}</strong>
      {sub && <span className="bulk-stat__sub">{sub}</span>}
      {typeof bar === 'number' && (
        <div className="bulk-stat__bar" role="presentation">
          <span style={{ width: `${Math.min(100, Math.max(0, bar))}%` }} />
        </div>
      )}
    </div>
  );
}

function CopyList({ values, label }) {
  const [copied, setCopied] = useState(false);
  if (values.length === 0) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(values.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* sin clipboard */
    }
  };
  return (
    <button type="button" className="chip" onClick={copy}>
      {copied ? <Check size={12} /> : <Copy size={12} />} {label}
    </button>
  );
}

/* ─────────────────── vista principal ─────────────────── */

function BulkOrderCheck() {
  const [stage, setStage] = useState('upload'); // upload | mapping | running | results
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null);
  const [orderCol, setOrderCol] = useState(0);
  const [skuCol, setSkuCol] = useState(-1);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);

  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [ordersMap, setOrdersMap] = useState(new Map());
  const [prefixMatches, setPrefixMatches] = useState(0);
  const [ranWith, setRanWith] = useState(null); // snapshot del mapeo usado

  const [filter, setFilter] = useState('all');
  const [codeFilter, setCodeFilter] = useState(null);
  const [search, setSearch] = useState('');

  const inputRef = useRef(null);
  const cancelRef = useRef(false);

  useEffect(() => () => { cancelRef.current = true; }, []);

  /* ── carga de archivo ── */
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setError(null);
    try {
      const result = await parseFile(file);
      const oc = guessColumn(result.headers, result.rows, ORDER_HEADER_HINTS, (c) => !!cellToId(c));
      const sc = guessColumn(
        result.headers.map((h, i) => (i === oc ? ' ' : h)),
        result.rows,
        SKU_HEADER_HINTS,
        () => false
      );
      setFileName(file.name);
      setParsed(result);
      setOrderCol(oc >= 0 ? oc : 0);
      setSkuCol(sc);
      setStage('mapping');
    } catch (e) {
      setError(e.message || 'No se pudo leer el archivo.');
      setStage('upload');
    }
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  /* ── registros extraídos del archivo ── */
  const extracted = useMemo(() => {
    if (!parsed) return { records: [], ids: [], invalid: 0, duplicates: 0 };
    const seenPair = new Set();
    const ids = new Set();
    const records = [];
    let invalid = 0;
    let duplicates = 0;

    parsed.rows.forEach((row, rowIndex) => {
      const cell = row?.[orderCol];
      if (cell === undefined || String(cell).trim() === '') return;
      const id = cellToId(cell);
      if (!id) { invalid += 1; return; }
      const sku = skuCol >= 0 ? cellToSku(row?.[skuCol]) : '';
      const key = `${id} ${skuKey(sku)}`;
      if (seenPair.has(key)) { duplicates += 1; return; }
      seenPair.add(key);
      ids.add(id);
      records.push({ id, sku, rowIndex, row });
    });

    return { records, ids: [...ids], invalid, duplicates };
  }, [parsed, orderCol, skuCol]);

  /* ── ejecución por lotes ── */
  const run = async () => {
    const ids = extracted.ids.slice(0, MAX_ORDERS);
    if (ids.length === 0) {
      setError('No se encontraron identificadores válidos en la columna seleccionada.');
      return;
    }
    cancelRef.current = false;
    setError(null);
    setStage('running');
    setOrdersMap(new Map());
    setPrefixMatches(0);
    setRanWith({ orderCol, skuCol, headers: parsed.headers, records: extracted.records });
    setProgress({ done: 0, total: ids.length });

    const map = new Map();
    let prefixHits = 0;

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      if (cancelRef.current) return;
      const batch = ids.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch('/api/orders-bulk-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderNumbers: batch }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);

        for (const o of json.orders) map.set(o.orderNumber, o);
        prefixHits += json.summary.matchedWithoutPrefix || 0;

        setOrdersMap(new Map(map));
        setPrefixMatches(prefixHits);
        setProgress({ done: Math.min(i + BATCH_SIZE, ids.length), total: ids.length });
      } catch (e) {
        setError(`Se detuvo en el lote ${Math.floor(i / BATCH_SIZE) + 1}: ${e.message}`);
        setStage(map.size > 0 ? 'results' : 'mapping');
        return;
      }
    }

    setStage('results');
  };

  const reset = () => {
    cancelRef.current = true;
    setStage('upload');
    setParsed(null);
    setFileName('');
    setOrdersMap(new Map());
    setRanWith(null);
    setError(null);
    setFilter('all');
    setCodeFilter(null);
    setSearch('');
    if (inputRef.current) inputRef.current.value = '';
  };

  /* ── cotejo: un resultado por registro del archivo ── */
  const results = useMemo(() => {
    if (!ranWith) return [];
    const pairMode = ranWith.skuCol >= 0;

    return ranWith.records.map((rec) => {
      const order = ordersMap.get(rec.id);
      const base = { ...rec, order, matchedAs: order?.matchedAs || null };

      if (!order || !order.found) {
        return { ...base, status: 'notfound', errorCodes: [], lines: 0 };
      }

      if (!pairMode) {
        return {
          ...base,
          status: order.hasError ? 'error' : 'ok',
          errorCodes: order.errorCodes,
          lines: order.lines,
        };
      }

      const target = skuKey(rec.sku);
      const matches = order.detail.filter((l) => skuKey(l.sku) === target);
      if (matches.length === 0) {
        return { ...base, status: 'nosku', errorCodes: [], lines: 0 };
      }

      const codes = [
        ...new Set(matches.map((l) => (l.errorCode ? String(l.errorCode).trim() : '')).filter(Boolean)),
      ];
      const flagged = matches.some((l) => String(l.hasError) === 'true' || l.errorCode);
      return {
        ...base,
        status: flagged ? 'error' : 'ok',
        errorCodes: codes,
        lines: matches.length,
        line: matches[0],
      };
    });
  }, [ranWith, ordersMap]);

  const pairMode = ranWith?.skuCol >= 0;

  /* ── métricas ── */
  const stats = useMemo(() => {
    const total = results.length;
    const by = (s) => results.filter((r) => r.status === s);
    const err = by('error');
    const ok = by('ok');
    const nosku = by('nosku');
    const notfound = by('notfound');
    return {
      total,
      error: err.length,
      ok: ok.length,
      nosku: nosku.length,
      notfound: notfound.length,
      sinCoincidencia: nosku.length + notfound.length,
      errorList: [...new Set(err.map((r) => r.id))],
      notFoundList: [...new Set(notfound.map((r) => r.id))],
      noSkuList: nosku.map((r) => `${r.id},${r.sku}`),
      orders: ordersMap.size,
      ordersFound: [...ordersMap.values()].filter((o) => o.found).length,
    };
  }, [results, ordersMap]);

  const codeRows = useMemo(() => {
    const counts = {};
    for (const r of results) {
      if (r.status !== 'error') continue;
      const codes = r.errorCodes.length ? r.errorCodes : ['SIN_CODIGO'];
      for (const c of codes) counts[c] = (counts[c] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([code, count]) => ({ code, count, meta: getError(code) }))
      .sort((a, b) => b.count - a.count);
  }, [results]);

  const visible = useMemo(() => {
    let list = results;
    if (filter !== 'all') list = list.filter((r) => r.status === filter);
    if (codeFilter) list = list.filter((r) => r.errorCodes.includes(codeFilter));
    const q = norm(search);
    if (q) list = list.filter((r) => norm(r.id).includes(q) || norm(r.sku).includes(q));
    return list;
  }, [results, filter, codeFilter, search]);

  /* ── exportación: conserva las columnas originales del archivo ── */
  const exportRows = () => {
    if (visible.length === 0) return;
    const origHeaders = ranWith.headers;
    const rows = visible.map((r) => {
      const out = {};
      origHeaders.forEach((h, i) => { out[h] = r.row?.[i] ?? ''; });
      const metas = r.errorCodes.map(getError);
      out['_estatus'] = STATUS[r.status].label;
      out['_errorCode'] = metas.map((m) => m.code).join(' | ');
      out['_errorLabel'] = metas.map((m) => m.label).join(' | ');
      out['_errorCategoria'] = [...new Set(metas.map((m) => m.category))].join(' | ');
      out['_errorMessage'] = r.line?.errorMessage || '';
      out['_plan'] = r.line?.plan || (r.order?.plans || []).join(' | ');
      out['_edd1'] = r.line?.edd1 || '';
      out['_edd2'] = r.line?.edd2 || '';
      out['_origen'] = r.line?.origen || '';
      out['_company'] = r.order?.company || '';
      out['_matchedAs'] = r.matchedAs || '';
      return out;
    });
    download(
      `cotejo_${new Date().toISOString().slice(0, 10)}.csv`,
      toCSV(rows, Object.keys(rows[0]))
    );
  };

  const progressPct = progress.total ? (progress.done / progress.total) * 100 : 0;
  const showResults = stage === 'results' || (stage === 'running' && results.length > 0);

  /* ─────────────────── render ─────────────────── */

  return (
    <div className="bulk-check">
      {error && (
        <div className="alert alert--error" role="alert">
          <AlertTriangle className="alert__icon" size={18} />
          <div><strong>Algo salió mal.</strong> {error}</div>
        </div>
      )}

      {/* ── Paso 1: subir archivo ── */}
      {stage === 'upload' && (
        <>
          <div
            className={`dropzone ${dragging ? 'dropzone--active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          >
            <UploadCloud size={40} strokeWidth={1.5} />
            <h3>Arrastra tu archivo de órdenes</h3>
            <p>
              CSV, TXT o Excel. Detectamos solas las columnas de remisión y SKU —
              tú las confirmas antes de correr el cotejo.
            </p>
            <span className="btn-primary btn-primary--ghost">Seleccionar archivo</span>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED}
              hidden
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          <ol className="bulk-steps">
            <li><span>1</span> Sube la lista de remisiones</li>
            <li><span>2</span> Confirma las columnas de remisión y SKU</li>
            <li><span>3</span> Revisa errorCode, porcentajes y no encontradas</li>
          </ol>
        </>
      )}

      {/* ── Paso 2: mapeo de columnas ── */}
      {stage === 'mapping' && parsed && (
        <section className="bulk-panel">
          <header className="bulk-panel__head">
            <div className="bulk-panel__title">
              <FileSpreadsheet size={18} strokeWidth={2.1} />
              <div>
                <h3>{fileName}</h3>
                <p>{fmtNum(parsed.rows.length)} filas leídas</p>
              </div>
            </div>
            <button type="button" className="chip" onClick={reset}>
              <RotateCcw size={12} /> Cambiar archivo
            </button>
          </header>

          <div className="bulk-mapping">
            <div className="bulk-mapping__field">
              <label htmlFor="bulk-col-order">
                <Columns3 size={13} /> Remisión / orden
              </label>
              <select
                id="bulk-col-order"
                value={orderCol}
                onChange={(e) => setOrderCol(Number(e.target.value))}
              >
                {parsed.headers.map((h, i) => (
                  <option key={i} value={i}>{h}</option>
                ))}
              </select>
            </div>

            <div className="bulk-mapping__field">
              <label htmlFor="bulk-col-sku">
                <Columns3 size={13} /> SKU <span className="muted">(opcional)</span>
              </label>
              <select
                id="bulk-col-sku"
                value={skuCol}
                onChange={(e) => setSkuCol(Number(e.target.value))}
              >
                <option value={-1}>Cotejar solo por orden</option>
                {parsed.headers.map((h, i) => (
                  <option key={i} value={i} disabled={i === orderCol}>{h}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bulk-preview">
            <span className="bulk-preview__label">Vista previa</span>
            <div className="bulk-preview__chips">
              {extracted.records.slice(0, 6).map((r, i) => (
                <code key={i}>
                  {r.id}
                  {skuCol >= 0 && r.sku && <em> · {r.sku}</em>}
                </code>
              ))}
              {extracted.records.length > 6 && (
                <span className="bulk-preview__more">
                  +{fmtNum(extracted.records.length - 6)} más
                </span>
              )}
              {extracted.records.length === 0 && (
                <span className="bulk-preview__more">
                  Ningún identificador válido en esta columna. Prueba con otra.
                </span>
              )}
            </div>
          </div>

          <div className="bulk-mapping__facts">
            <span>
              <strong>{fmtNum(extracted.records.length)}</strong>{' '}
              {skuCol >= 0 ? 'pares remisión + SKU' : 'órdenes'} a cotejar
            </span>
            <span className="muted">
              {fmtNum(extracted.ids.length)} órdenes únicas a consultar
            </span>
            {extracted.duplicates > 0 && (
              <span className="muted">{fmtNum(extracted.duplicates)} duplicados omitidos</span>
            )}
            {extracted.invalid > 0 && (
              <span className="muted">{fmtNum(extracted.invalid)} valores no válidos ignorados</span>
            )}
          </div>

          <button
            type="button"
            className="btn-primary"
            onClick={run}
            disabled={extracted.records.length === 0}
          >
            <ListChecks size={15} /> Cotejar {fmtNum(extracted.records.length)} registros
          </button>
          <p className="bulk-hint">
            Busca en <code>FAC_EDD_ORDERS_TRN</code> — últimos 180 días, todas las compañías.
            Si la tabla guarda la remisión sin prefijo, también se prueba{' '}
            <code>sg2608090011688 → 2608090011688</code>.
          </p>
        </section>
      )}

      {/* ── Paso 3: ejecución ── */}
      {stage === 'running' && (
        <section className="bulk-panel bulk-panel--running">
          <Loader2 className="bulk-spin" size={30} strokeWidth={2} />
          <h3>Cotejando contra BigQuery…</h3>
          <div className="bulk-progress">
            <span style={{ width: `${progressPct}%` }} />
          </div>
          <p>
            {fmtNum(progress.done)} de {fmtNum(progress.total)} órdenes · {Math.round(progressPct)}%
          </p>
          <button type="button" className="chip" onClick={reset}>Cancelar</button>
        </section>
      )}

      {/* ── Paso 4: resultados ── */}
      {showResults && (
        <>
          {stage === 'results' && (
            <header className="bulk-results__head">
              <div>
                <h2>Resultado del cotejo</h2>
                <p>
                  {fileName} · {fmtNum(stats.total)}{' '}
                  {pairMode ? 'pares remisión + SKU' : 'órdenes'} ·{' '}
                  {fmtNum(stats.ordersFound)} de {fmtNum(stats.orders)} órdenes localizadas
                </p>
              </div>
              <div className="bulk-results__actions">
                <button type="button" className="chip" onClick={exportRows}>
                  <Download size={12} /> Exportar CSV
                </button>
                <button type="button" className="chip" onClick={reset}>
                  <RotateCcw size={12} /> Nuevo cotejo
                </button>
              </div>
            </header>
          )}

          {prefixMatches > 0 && (
            <div className="alert alert--info">
              <Info className="alert__icon" size={18} />
              <div>
                <strong>{fmtNum(prefixMatches)} órdenes</strong> coincidieron solo al quitarles
                el prefijo de letras. La tabla guarda la remisión sin <code>sg</code>.
              </div>
            </div>
          )}

          <div className="bulk-stats">
            <StatCard
              tone="neutral"
              icon={ListChecks}
              label={pairMode ? 'Registros cotejados' : 'Órdenes cotejadas'}
              value={fmtNum(stats.total)}
              sub={`${fmtNum(stats.ordersFound)} de ${fmtNum(stats.orders)} órdenes localizadas`}
            />
            <StatCard
              tone="danger"
              icon={AlertTriangle}
              label="Con errorCode"
              value={fmtNum(stats.error)}
              sub={`${fmtPct(pct(stats.error, stats.total))} del total · ${fmtPct(pct(stats.error, stats.error + stats.ok))} de los cotejados con éxito`}
              bar={pct(stats.error, stats.total)}
            />
            <StatCard
              tone="success"
              icon={CheckCircle2}
              label="Sin error"
              value={fmtNum(stats.ok)}
              sub={`${fmtPct(pct(stats.ok, stats.total))} del total`}
              bar={pct(stats.ok, stats.total)}
            />
            <StatCard
              tone="warning"
              icon={XCircle}
              label="Sin coincidencia"
              value={fmtNum(stats.sinCoincidencia)}
              sub={
                pairMode
                  ? `${fmtNum(stats.notfound)} orden no encontrada · ${fmtNum(stats.nosku)} SKU no encontrado`
                  : `${fmtPct(pct(stats.notfound, stats.total))} del total`
              }
              bar={pct(stats.sinCoincidencia, stats.total)}
            />
          </div>

          <div className="bulk-linestat">
            <CopyList values={stats.errorList} label="Copiar órdenes con error" />
            <CopyList values={stats.notFoundList} label="Copiar órdenes no encontradas" />
            {pairMode && <CopyList values={stats.noSkuList} label="Copiar pares sin SKU" />}
          </div>

          {codeRows.length > 0 && (
            <section className="bulk-codes">
              <h3>
                Desglose por errorCode{' '}
                <span>({pairMode ? 'registros del archivo' : 'órdenes'})</span>
              </h3>
              <table>
                <thead>
                  <tr>
                    <th>errorCode</th>
                    <th>Qué significa</th>
                    <th>Categoría</th>
                    <th>Registros</th>
                    <th>% de los que traen error</th>
                    <th aria-label="Distribución" />
                  </tr>
                </thead>
                <tbody>
                  {codeRows.map(({ code, count, meta }) => {
                    const share = pct(count, stats.error);
                    const active = codeFilter === code;
                    return (
                      <tr
                        key={code}
                        className={active ? 'is-active' : ''}
                        onClick={() => { setCodeFilter(active ? null : code); setFilter('error'); }}
                      >
                        <td>
                          <span className="bulk-codes__dot" style={{ background: meta.color }} />
                          <code>{meta.code}</code>
                        </td>
                        <td>
                          <strong className="bulk-codes__label">{meta.label}</strong>
                          <span className="bulk-codes__desc">{meta.desc}</span>
                        </td>
                        <td><span className="chip chip--static">{meta.category}</span></td>
                        <td>{fmtNum(count)}</td>
                        <td>{fmtPct(share)}</td>
                        <td>
                          <div className="bulk-codes__bar">
                            <span style={{ width: `${share}%`, background: meta.color }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {codeFilter && (
                <button type="button" className="chip" onClick={() => setCodeFilter(null)}>
                  Quitar filtro <code>{codeFilter}</code>
                </button>
              )}
            </section>
          )}

          <section className="bulk-table">
            <header className="bulk-table__head">
              <div className="bulk-table__filters" role="tablist">
                {FILTERS.filter((f) => pairMode || f.key !== 'nosku').map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={filter === f.key}
                    className={`chip ${filter === f.key ? 'active' : ''}`}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="bulk-table__search">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Filtrar por remisión o SKU"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </header>

            <div className="bulk-table__scroll">
              <table>
                <thead>
                  <tr>
                    <th>Remisión</th>
                    {pairMode && <th>SKU</th>}
                    <th>Estatus</th>
                    <th>errorCode</th>
                    <th>Mensaje</th>
                    <th>Plan</th>
                    <th>Origen</th>
                    <th>Compañía</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, 500).map((r, i) => (
                    <tr key={`${r.id}-${r.sku}-${i}`}>
                      <td><code>{r.id}</code></td>
                      {pairMode && <td><code>{r.sku || '—'}</code></td>}
                      <td>
                        <span className={`badge ${STATUS[r.status].badge}`}>
                          {r.status === 'error' && <AlertTriangle size={11} strokeWidth={2.4} />}
                          {r.status === 'ok' && <Check size={11} strokeWidth={2.8} />}
                          {STATUS[r.status].label}
                        </span>
                      </td>
                      <td className="bulk-table__code">
                        {r.errorCodes.length
                          ? r.errorCodes.map((c) => {
                              const m = getError(c);
                              return (
                                <span key={c} className="bulk-table__errcode" title={m.desc}>
                                  <span className="bulk-codes__dot" style={{ background: m.color }} />
                                  <code>{m.code}</code> {m.label}
                                </span>
                              );
                            })
                          : '—'}
                      </td>
                      <td className="bulk-table__msg">{r.line?.errorMessage || '—'}</td>
                      <td>{r.line?.plan || (r.order?.plans || []).join(', ') || '—'}</td>
                      <td>{r.line?.origen || '—'}</td>
                      <td>{r.order?.company || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {visible.length === 0 && (
                <div className="search-empty">
                  <PackageSearch size={34} strokeWidth={1.6} />
                  <h3>Sin resultados con este filtro</h3>
                  <p>Cambia el filtro o limpia la búsqueda.</p>
                </div>
              )}
            </div>

            {visible.length > 500 && (
              <p className="bulk-hint">
                Mostrando los primeros 500 de {fmtNum(visible.length)}. Exporta el CSV para ver todo.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default BulkOrderCheck;
