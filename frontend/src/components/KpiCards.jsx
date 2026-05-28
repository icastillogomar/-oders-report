import {
  Package,
  CheckCircle2,
  Truck,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';

/**
 * Calcula la variación porcentual entre dos valores.
 * Devuelve null si no se puede comparar (sin data previa).
 */
function delta(current, previous) {
  if (previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function Trend({ value }) {
  if (value == null) {
    return (
      <span className="trend trend--flat" title="Sin periodo previo para comparar">
        <Minus size={11} />
        —
      </span>
    );
  }
  const abs = Math.abs(value).toFixed(1);
  if (value > 0.5) {
    return (
      <span className="trend trend--up" title="vs. periodo anterior">
        <ArrowUpRight size={11} />
        {abs}%
      </span>
    );
  }
  if (value < -0.5) {
    return (
      <span className="trend trend--down" title="vs. periodo anterior">
        <ArrowDownRight size={11} />
        {abs}%
      </span>
    );
  }
  return (
    <span className="trend trend--flat" title="vs. periodo anterior">
      <Minus size={11} />
      {abs}%
    </span>
  );
}

function KpiCard({
  variant,
  icon: Icon,
  label,
  value,
  share,
  trend,
  showBar = false,
}) {
  return (
    <div className={`kpi-card ${variant}`}>
      <div className="kpi-card__head">
        <span className="kpi-card__label">{label}</span>
        <span className="kpi-card__icon">
          <Icon size={18} strokeWidth={2.2} />
        </span>
      </div>

      <div className="kpi-card__value">{value}</div>

      <div className="kpi-card__foot">
        <span className="kpi-card__share">
          {share != null ? (
            <>
              <span className="big">{share}%</span> del total
            </>
          ) : (
            'Rango seleccionado'
          )}
        </span>
        <Trend value={trend} />
      </div>

      {showBar && share != null && (
        <div className="kpi-card__bar" aria-hidden="true">
          <span style={{ '--scale': Math.min(share, 100) / 100 }} />
        </div>
      )}
    </div>
  );
}

function KpiCards({ data, previousData = [] }) {
  const sum = (rows) =>
    rows.reduce(
      (acc, row) => ({
        planA: acc.planA + (row.Plan_A || 0),
        planB: acc.planB + (row.Plan_B || 0),
        error: acc.error + (row.Error || 0),
        total: acc.total + (row.Total || 0),
      }),
      { planA: 0, planB: 0, error: 0, total: 0 }
    );

  const totals = sum(data);
  const prev = sum(previousData);

  const pct = (n) =>
    totals.total ? +((n / totals.total) * 100).toFixed(2) : 0;

  const fmt = (n) => n.toLocaleString('es-MX');

  return (
    <div className="kpi-grid">
      <KpiCard
        variant="total"
        icon={Package}
        label="Total de registros"
        value={fmt(totals.total)}
        trend={delta(totals.total, prev.total)}
      />

      <KpiCard
        variant="plan-a"
        icon={CheckCircle2}
        label="Plan A"
        value={fmt(totals.planA)}
        share={pct(totals.planA)}
        trend={delta(totals.planA, prev.planA)}
        showBar
      />

      <KpiCard
        variant="plan-b"
        icon={Truck}
        label="Plan B"
        value={fmt(totals.planB)}
        share={pct(totals.planB)}
        trend={delta(totals.planB, prev.planB)}
        showBar
      />

      <KpiCard
        variant="error-card"
        icon={AlertTriangle}
        label="Errores"
        value={fmt(totals.error)}
        share={pct(totals.error)}
        trend={delta(totals.error, prev.error)}
        showBar
      />
    </div>
  );
}

export default KpiCards;
