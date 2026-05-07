import { useState, useEffect, useCallback } from 'react';
import KpiCards from './components/KpiCards.jsx';
import BarChart from './components/BarChart.jsx';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState('2026-04-01');
  const [endDate, setEndDate] = useState('2026-05-01');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/orders-summary?start=${startDate}&end=${endDate}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container">
      <header>
        <h1>Reporte Ejecutivo — Pedidos LP</h1>
        <p>
          Distribución diaria de pedidos por plan: A, B y Error · Compañía LP ·
          Soft Line
        </p>
      </header>

      <div className="filters">
        <label>
          Desde
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
        <button onClick={fetchData} disabled={loading}>
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <div className="alert error-alert">
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading && (
        <div className="alert info-alert">Cargando datos de BigQuery…</div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="alert info-alert">
          No hay datos para el rango seleccionado.
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <>
          <KpiCards data={data} />
          <div className="chart-card">
            <h2>Distribución diaria por plan</h2>
            <p className="subtitle">
              Composición porcentual (100% apilado) por día
            </p>
            <BarChart data={data} />
          </div>
        </>
      )}

      <footer>
        Fuente: <code>tables_raw_changelog</code> · Hora local: América/México
      </footer>
    </div>
  );
}

export default App;
