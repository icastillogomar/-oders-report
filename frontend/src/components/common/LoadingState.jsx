/**
 * Reusable centered loading indicator spinner card.
 */
export default function LoadingState({ isLoading, title, description }) {
  if (!isLoading) return null;

  return (
    <div 
      className="chart-card" 
      style={{ 
        padding: '32px', 
        background: 'var(--surface)', 
        border: '1px solid var(--border)', 
        borderRadius: 'var(--r-lg)', 
        textAlign: 'center', 
        marginBottom: '24px' 
      }}
    >
      <div 
        className="spinner" 
        style={{
          width: '40px',
          height: '40px',
          border: '3px solid var(--brand-soft)',
          borderTopColor: 'var(--brand-primary)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 16px'
        }} 
      />
      <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-1)', marginBottom: '6px' }}>
        {title}
      </h4>
      {description && (
        <p style={{ fontSize: '12px', color: 'var(--text-3)', margin: 0 }}>
          {description}
        </p>
      )}
    </div>
  );
}