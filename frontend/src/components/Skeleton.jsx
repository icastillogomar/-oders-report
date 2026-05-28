/**
 * Skeleton loaders para KPIs y gráfica.
 * Se muestran mientras se obtiene la data del backend para que
 * el layout no haga "jump" cuando llegue la respuesta.
 */
export function KpiSkeleton() {
  return (
    <div className="skel-grid" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div className="skel-card" key={i}>
          <div className="skel-head">
            <div className="skeleton skel-row sm" style={{ width: '45%' }} />
            <div className="skeleton skel-icon" />
          </div>
          <div className="skeleton skel-row lg" />
          <div className="skeleton skel-row sm" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  // Alturas pseudo-aleatorias pero determinísticas
  const heights = [62, 78, 55, 84, 70, 90, 66, 74, 81, 58, 72, 87, 64, 79];
  return (
    <div className="skel-chart" aria-hidden="true">
      <div className="skel-head">
        <div>
          <div className="skeleton skel-row sm" style={{ width: 180 }} />
          <div className="skeleton skel-row sm" style={{ width: 240 }} />
        </div>
        <div className="skeleton skel-row sm" style={{ width: 120 }} />
      </div>
      <div className="skel-chart__bars">
        {heights.map((h, i) => (
          <span key={i} style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

export default { KpiSkeleton, ChartSkeleton };
