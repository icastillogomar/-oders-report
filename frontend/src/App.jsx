import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  Calendar,
  CalendarDays,
  RefreshCcw,
  AlertCircle,
  Inbox,
  Clock,
  BarChart3,
  Download,
} from 'lucide-react';
import KpiCards from './components/KpiCards.jsx';
import BarChart from './components/BarChart.jsx';
import { KpiSkeleton, ChartSkeleton } from './components/Skeleton.jsx';

/* ───────────────────────── helpers ───────────────────────── */
const toISO = (d) => d.toISOString().slice(0, 10);

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const startOfMonth = (date) => {
  const d = new Date(date);
  d.setDate(1);
  return d;
};

/** Calcula el rango anterior con la misma longitud para comparar tendencias */
const previousRange = (startISO, endISO) => {
  const s = new Date(startISO);
  const e = new Date(endISO);
  const days = Math.max(1, Math.round((e - s) / 86400000) + 1);
  const prevEnd = addDays(s, -1);
  const prevStart = addDays(prevEnd, -(days - 1));
  return { start: toISO(prevStart), end: toISO(prevEnd) };
};

/* ───────────────────────── config ────────────────────────── */
const QUICK_RANGES = [
  { key: 'today', label: 'Hoy', days: 0 },
  { key: '7d', label: 'Últimos 7 días', days: 6 },
  { key: '30d', label: 'Últimos 30 días', days: 29 },
  { key: 'mtd', label: 'Este mes', days: null },
];

const MULTISITE_DECOMM = ['WS', 'DCK', 'GAP', 'PB', 'PBK', 'BRU'];

function App() {
  const [data, setData] = useState([]);
  const [previousData, setPreviousData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState('2026-04-01');
  const [endDate, setEndDate] = useState('2026-05-27');
  const [company, setCompany] = useState('LP'); // LP, SBB, LP_DECOMM, SBB_DECOMM, LP_RECALC, etc.
  const [activeQuick, setActiveQuick] = useState(null);

  /* ── Fetch principal + rango previo (para tendencias) ── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const prev = previousRange(startDate, endDate);
      const isDecomm = company.includes('DECOMM');
      const isRecalc = company.includes('RECALC');
      
      let endpoint = '/api/orders-summary';
      if (isDecomm) endpoint = '/api/orders-decomm';
      if (isRecalc) endpoint = '/api/orders-recalculate';

      // Mapeo de compañías para BigQuery
      let finalCompany = company.replace('_DECOMM', '').replace('_RECALC', '');
      if ((isDecomm || isRecalc) && finalCompany === 'SBB') {
        finalCompany = 'SB';
      }

      const [resCurr, resPrev] = await Promise.all([
        fetch(
          `${endpoint}?start=${startDate}&end=${endDate}&company=${finalCompany}`
        ),
        fetch(
          `${endpoint}?start=${prev.start}&end=${prev.end}&company=${finalCompany}`
        ).catch(() => null),
      ]);

      if (!resCurr.ok) {
        const err = await resCurr.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${resCurr.status}`);
      }

      const json = await resCurr.json();
      setData(json.data || []);

      if (resPrev && resPrev.ok) {
        const jsonPrev = await resPrev.json();
        setPreviousData(jsonPrev.data || []);
      } else {
        setPreviousData([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, company]);

  const handleDownloadCSV = () => {
    const isDecomm = company.includes('DECOMM');
    const isRecalc = company.includes('RECALC');
    
    let type = 'summary';
    if (isDecomm) type = 'decomm';
    if (isRecalc) type = 'recalc';

    let finalCompany = company.replace('_DECOMM', '').replace('_RECALC', '');
    if ((isDecomm || isRecalc) && finalCompany === 'SBB') {
      finalCompany = 'SB';
    }

    const url = `/api/orders-csv?start=${startDate}&end=${endDate}&company=${finalCompany}&type=${type}`;
    window.open(url, '_blank');
  };

  useEffect(() => {
    fetchData();
    // Color de marca dinámico + data-attribute para el tema
    const isLP = company.startsWith('LP');
    const brandColor = isLP ? '#e10098' : '#552166';
    const brandRgb = isLP ? '225, 0, 152' : '85, 33, 102';
    document.documentElement.style.setProperty('--brand-primary', brandColor);
    document.documentElement.style.setProperty('--brand-primary-rgb', brandRgb);
    document.documentElement.setAttribute('data-company', company);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);

  /* ── Aplicar quick range ── */
  const applyQuickRange = (range) => {
    const today = new Date('2026-05-27'); // En prod: new Date()
    let start, end;
    if (range.key === 'mtd') {
      start = startOfMonth(today);
      end = today;
    } else if (range.days === 0) {
      start = today;
      end = today;
    } else {
      end = today;
      start = addDays(today, -range.days);
    }
    setStartDate(toISO(start));
    setEndDate(toISO(end));
    setActiveQuick(range.key);
  };

  const handleDateChange = (setter) => (e) => {
    setter(e.target.value);
    setActiveQuick(null);
  };

  const rangeLabel = useMemo(() => {
    const opts = { day: '2-digit', month: 'short', year: 'numeric' };
    const s = new Date(startDate).toLocaleDateString('es-MX', opts);
    const e = new Date(endDate).toLocaleDateString('es-MX', opts);
    return `${s} → ${e}`;
  }, [startDate, endDate]);

  const siteTitle = useMemo(() => {
    if (company.startsWith('LP')) return 'Liverpool';
    if (company.startsWith('SBB')) return 'Suburbia';
    return company.replace('_DECOMM', '').replace('_RECALC', '');
  }, [company]);

  const reportSource = useMemo(() => {
    if (company.includes('RECALC')) return 'FAC_EDD_RECALCULATE_TRN';
    if (company.includes('DECOMM')) return 'FAC_EDD_ORDERS_TRN';
    return 'tables_raw_changelog';
  }, [company]);

  return (
    <div className="container">
      {/* ─── Header ─── */}
      <header className="app-header">
        <div className="app-header__title">
          <div className="app-header__logo">
            <Activity size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h1>
              Reporte Ejecutivo · Pedidos {siteTitle}
              {company.includes('DECOMM') ? ' (Decomm)' : ''}
              {company.includes('RECALC') ? ' (Recalculo)' : ''}
            </h1>
            <p className="subtitle">
              Distribución diaria de pedidos por plan: A, B y Error · Compañía{' '}
              {company.replace('_DECOMM', '').replace('_RECALC', '')} · {reportSource}
            </p>
          </div>
        </div>

        <div className="app-header__meta">
          <span className="dot" aria-hidden="true" />
          <Clock size={12} />
          <span>{rangeLabel}</span>
        </div>
      </header>

      {/* ─── Tabs compañía ─── */}
      <div className="tabs" role="tablist" aria-label="Compañía">
        {/* Principales */}
        <button
          role="tab"
          aria-selected={company === 'LP'}
          className={`tab-btn ${company === 'LP' ? 'active' : ''}`}
          onClick={() => setCompany('LP')}
        >
          Liverpool · LP
        </button>
        <button
          role="tab"
          aria-selected={company === 'SBB'}
          className={`tab-btn ${company === 'SBB' ? 'active' : ''}`}
          onClick={() => setCompany('SBB')}
        >
          Suburbia · SBB
        </button>
        
        {/* Decomm Principales */}
        <button
          role="tab"
          aria-selected={company === 'LP_DECOMM'}
          className={`tab-btn ${company === 'LP_DECOMM' ? 'active' : ''}`}
          onClick={() => setCompany('LP_DECOMM')}
        >
          LP Decomm
        </button>
        <button
          role="tab"
          aria-selected={company === 'SBB_DECOMM'}
          className={`tab-btn ${company === 'SBB_DECOMM' ? 'active' : ''}`}
          onClick={() => setCompany('SBB_DECOMM')}
        >
          SBB Decomm
        </button>

        {/* Recalculo */}
        <button
          role="tab"
          aria-selected={company === 'LP_RECALC'}
          className={`tab-btn ${company === 'LP_RECALC' ? 'active' : ''}`}
          onClick={() => setCompany('LP_RECALC')}
        >
          Recalculo Decomm
        </button>

        {/* Multisite Decomm */}
        {MULTISITE_DECOMM.map((site) => (
          <button
            key={site}
            role="tab"
            aria-selected={company === `${site}_DECOMM`}
            className={`tab-btn ${company === `${site}_DECOMM` ? 'active' : ''}`}
            onClick={() => setCompany(`${site}_DECOMM`)}
          >
            {site} Decomm
          </button>
        ))}
      </div>

      {/* ─── Filtros ─── */}
      <div className="filters-card">
        <div className="quick-ranges" role="group" aria-label="Rangos rápidos">
          <span className="quick-ranges__label">
            <CalendarDays size={12} /> Rango rápido
          </span>
          {QUICK_RANGES.map((r) => (
            <button
              key={r.key}
              className={`chip ${activeQuick === r.key ? 'active' : ''}`}
              onClick={() => applyQuickRange(r)}
              type="button"
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="filters">
          <div className="field">
            <label htmlFor="start-date">Desde</label>
            <div className="input-wrap">
              <Calendar className="input-wrap__icon" size={16} />
              <input
                id="start-date"
                type="date"
                value={startDate}
                onChange={handleDateChange(setStartDate)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="end-date">Hasta</label>
            <div className="input-wrap">
              <Calendar className="input-wrap__icon" size={16} />
              <input
                id="end-date"
                type="date"
                value={endDate}
                onChange={handleDateChange(setEndDate)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <button
              className="btn-primary"
              onClick={fetchData}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Cargando…
                </>
              ) : (
                <>
                  <RefreshCcw size={15} strokeWidth={2.4} />
                  Actualizar
                </>
              )}
            </button>
            <button
              className="btn-secondary"
              onClick={handleDownloadCSV}
              disabled={loading || data.length === 0}
              title="Descargar pedidos con Error o Plan B en CSV"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '0 16px',
                height: '38px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--surface-color)',
                color: 'var(--text-color)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
              }}
            >
              <Download size={15} strokeWidth={2.4} />
              Exportar
            </button>
          </div>
        </div>
      </div>

      {/* ─── Estados ─── */}
      {error && (
        <div className="alert alert--error" role="alert">
          <AlertCircle className="alert__icon" size={18} />
          <div>
            <strong>Error al cargar datos.</strong> {error}
          </div>
        </div>
      )}

      {loading && (
        <>
          <KpiSkeleton />
          <ChartSkeleton />
        </>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="alert alert--empty">
          <Inbox className="alert__icon" size={18} />
          <div>
            <strong>Sin datos.</strong> No hay registros para el rango
            seleccionado. Ajusta las fechas o cambia de compañía.
          </div>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <>
          <KpiCards data={data} previousData={previousData} />

          <div className="chart-card">
            <div className="chart-card__head">
              <div>
                <h2>
                  <BarChart3 size={18} strokeWidth={2.2} />
                  Distribución diaria por plan
                </h2>
                <p className="subtitle">
                  Composición porcentual (100% apilado) por día
                </p>
              </div>
            </div>
            <BarChart data={data} />
          </div>
        </>
      )}

      <footer>
        Fuente: <code>{reportSource}</code> · Hora local: América/México
      </footer>
    </div>
  );
}

export default App;