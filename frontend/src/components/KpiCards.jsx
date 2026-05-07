function KpiCards({ data }) {
  const totals = data.reduce(
    (acc, row) => ({
      planA: acc.planA + (row.Plan_A || 0),
      planB: acc.planB + (row.Plan_B || 0),
      error: acc.error + (row.Error || 0),
      total: acc.total + (row.Total || 0),
    }),
    { planA: 0, planB: 0, error: 0, total: 0 }
  );

  const pct = (n) =>
    totals.total ? ((n / totals.total) * 100).toFixed(2) : '0.00';

  const fmt = (n) => n.toLocaleString('en-US');

  return (
    <div className="kpi-grid">
      <div className="kpi-card total">
        <div className="kpi-label">Total de registros</div>
        <div className="kpi-value">{fmt(totals.total)}</div>
        <div className="kpi-pct">Rango seleccionado</div>
      </div>

      <div className="kpi-card plan-a">
        <div className="kpi-label">Plan A</div>
        <div className="kpi-value">{fmt(totals.planA)}</div>
        <div className="kpi-pct">
          <span className="big">{pct(totals.planA)}%</span> del total
        </div>
      </div>

      <div className="kpi-card plan-b">
        <div className="kpi-label">Plan B</div>
        <div className="kpi-value">{fmt(totals.planB)}</div>
        <div className="kpi-pct">
          <span className="big">{pct(totals.planB)}%</span> del total
        </div>
      </div>

      <div className="kpi-card error">
        <div className="kpi-label">Error</div>
        <div className="kpi-value">{fmt(totals.error)}</div>
        <div className="kpi-pct">
          <span className="big">{pct(totals.error)}%</span> del total
        </div>
      </div>
    </div>
  );
}

export default KpiCards;
