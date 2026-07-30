import { Hash, CheckCircle2, XCircle } from 'lucide-react';

/**
 * Tarjetas de resumen (KPI) para el módulo BigQuery Search.
 */
export default function BigQuerySearchSummary({ summary }) {
  if (!summary) return null;

  const { totalOrdersCount, found, notFound, uniqueOrdersCount } = summary;

  const foundPercent = totalOrdersCount > 0 ? Math.round((found / totalOrdersCount) * 100) : 0;
  const notFoundPercent = totalOrdersCount > 0 ? Math.round((notFound / totalOrdersCount) * 100) : 0;

  return (
    <div style={{ marginBottom: '24px' }}>
      <h2 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-1)', marginBottom: '12px' }}>
        Resumen de Resultados (Cruces con Excel)
      </h2>
      <div className="kpis-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '16px'
      }}>
        
        {/* KPI Total de Órdenes */}
        <div className="kpi-card" style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: '20px',
          boxShadow: 'var(--shadow-xs)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: 'var(--r-sm)',
            background: 'var(--bg)',
            color: 'var(--text-2)',
            display: 'grid',
            placeItems: 'center'
          }}>
            <Hash size={22} />
          </div>
          <div>
            <span className="subtitle" style={{ fontSize: '12px', display: 'block' }}>Total Órdenes</span>
            <strong style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-1)' }}>
              {totalOrdersCount}
            </strong>
            <span className="trend trend--neutral" style={{ display: 'block', fontSize: '11px', marginTop: '2px' }}>
              {uniqueOrdersCount} únicas extraídas del Excel
            </span>
          </div>
        </div>

        {/* KPI Órdenes Encontradas */}
        <div className="kpi-card" style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: '20px',
          boxShadow: 'var(--shadow-xs)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: 'var(--r-sm)',
            background: 'var(--success-soft)',
            color: 'var(--success)',
            display: 'grid',
            placeItems: 'center'
          }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <span className="subtitle" style={{ fontSize: '12px', display: 'block' }}>Encontradas en BigQuery</span>
            <strong style={{ fontSize: '24px', fontWeight: '700', color: 'var(--success)' }}>
              {found}
            </strong>
            <span className="trend trend--up" style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              fontSize: '11px', 
              marginTop: '2px', 
              color: 'var(--success)',
              background: 'var(--success-soft)',
              padding: '1px 6px',
              borderRadius: 'var(--r-full)',
              fontWeight: '600'
            }}>
              {foundPercent}% de coincidencia
            </span>
          </div>
        </div>

        {/* KPI Órdenes No Encontradas */}
        <div className="kpi-card" style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: '20px',
          boxShadow: 'var(--shadow-xs)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: 'var(--r-sm)',
            background: 'var(--danger-soft)',
            color: 'var(--danger)',
            display: 'grid',
            placeItems: 'center'
          }}>
            <XCircle size={22} />
          </div>
          <div>
            <span className="subtitle" style={{ fontSize: '12px', display: 'block' }}>No Encontradas</span>
            <strong style={{ fontSize: '24px', fontWeight: '700', color: 'var(--danger)' }}>
              {notFound}
            </strong>
            <span className="trend trend--down" style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              fontSize: '11px', 
              marginTop: '2px', 
              color: 'var(--danger)',
              background: 'var(--danger-soft)',
              padding: '1px 6px',
              borderRadius: 'var(--r-full)',
              fontWeight: '600'
            }}>
              {notFoundPercent}% de faltantes
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
