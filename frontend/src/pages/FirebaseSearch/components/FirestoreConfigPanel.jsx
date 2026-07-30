import { Settings } from 'lucide-react';

/**
 * Visual counterpart to BigQuery's config panel, displaying Firestore specific settings.
 */
export default function FirestoreConfigPanel() {
  return (
    <div 
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}
    >
      <h3 
        style={{ 
          fontSize: '15px', 
          fontWeight: '600', 
          color: 'var(--text-1)', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          borderBottom: '1px solid var(--border)', 
          paddingBottom: '12px', 
          marginBottom: '4px' 
        }}
      >
        <Settings size={16} /> Parámetros de Firestore
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.6' }}>
        <p style={{ margin: 0 }}>
          Este módulo busca ordenes en producción  <strong> Firestore</strong>.
        </p>

        <div>
          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>
            Colección origen:
          </label>
          <div 
            style={{ 
              background: 'var(--bg-soft)', 
              padding: '8px 12px', 
              borderRadius: 'var(--r-md)', 
              fontFamily: 'var(--font-mono)', 
              fontSize: '12.5px', 
              border: '1px solid var(--border-soft)', 
              color: 'var(--text-1)' 
            }}
          >
            tickets
          </div>
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>
            Campos de búsqueda (operación OR):
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {['noPedido', 'orderNo', 'ov', 'ovNo', 'noOrden', 'no_orden', 'ORDER_NO'].map(field => (
              <span 
                key={field} 
                style={{ 
                  background: 'var(--brand-soft)', 
                  color: 'var(--brand-primary)', 
                  padding: '4px 10px', 
                  borderRadius: 'var(--r-full)', 
                  fontSize: '11px', 
                  fontWeight: '600' 
                }}
              >
                {field}
              </span>
            ))}
          </div>
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>
            Método de consulta:
          </label>
          <div style={{ fontSize: '12.5px', color: 'var(--text-3)' }}>
            Lotes paralelos eficientes (tamaño máximo de 30 registros por consulta de lote).
          </div>
        </div>
      </div>
    </div>
  );
}