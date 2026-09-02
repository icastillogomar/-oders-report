import {
  Package,
  Zap,
  CalendarClock,
  Truck,
  AlertTriangle,
} from 'lucide-react';

/**
 * KPIs de tipos de entrega: Flash Mismo Día, Siguiente Día,
 * Estándar y Sin EDD, con su participación sobre el total.
 */
function DeliveryKpi({ variant, icon: Icon, label, value, share, showBar = false }) {
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
      </div>

      {showBar && share != null && (
        <div className="kpi-card__bar" aria-hidden="true">
          <span style={{ '--scale': Math.min(share, 100) / 100 }} />
        </div>
      )}
    </div>
  );
}

function DeliveryKpis({ totals }) {
  const pct = (n) =>
    totals.total ? +((n / totals.total) * 100).toFixed(2) : 0;
  const fmt = (n) => n.toLocaleString('es-MX');

  return (
    <div className="kpi-grid kpi-grid--5">
      <DeliveryKpi
        variant="total"
        icon={Package}
        label="Líneas totales"
        value={fmt(totals.total)}
      />
      <DeliveryKpi
        variant="flash"
        icon={Zap}
        label="Flash Mismo Día"
        value={fmt(totals.flash)}
        share={pct(totals.flash)}
        showBar
      />
      <DeliveryKpi
        variant="nextday"
        icon={CalendarClock}
        label="Siguiente Día"
        value={fmt(totals.siguienteDia)}
        share={pct(totals.siguienteDia)}
        showBar
      />
      <DeliveryKpi
        variant="standard"
        icon={Truck}
        label="Estándar"
        value={fmt(totals.estandar)}
        share={pct(totals.estandar)}
        showBar
      />
      <DeliveryKpi
        variant="noedd"
        icon={AlertTriangle}
        label="Sin EDD"
        value={fmt(totals.sinEDD)}
        share={pct(totals.sinEDD)}
        showBar
      />
    </div>
  );
}

export default DeliveryKpis;
