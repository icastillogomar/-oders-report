import { Search, Trash2 } from 'lucide-react';

/**
 * Reusable Action Buttons for initiating search or clearing state.
 */
export default function ActionButtons({
  isSearchDisabled,
  onSearch,
  onClear,
  searchLabel = "Consultar"
}) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
      <button
        className="btn-primary"
        onClick={onSearch}
        disabled={isSearchDisabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0 24px',
          height: '42px',
          fontSize: '14px',
          fontWeight: '600',
          opacity: isSearchDisabled ? 0.5 : 1,
          cursor: isSearchDisabled ? 'not-allowed' : 'pointer',
          backgroundColor: isSearchDisabled ? 'var(--border-strong)' : 'var(--brand-primary)',
          color: isSearchDisabled ? 'var(--text-muted)' : '#ffffff',
          boxShadow: isSearchDisabled ? 'none' : '0 4px 12px -2px rgba(var(--brand-primary-rgb), 0.3)',
          border: 'none',
          borderRadius: 'var(--r-md)',
          transition: 'all var(--t-fast) ease'
        }}
      >
        <Search size={16} strokeWidth={2.4} />
        {searchLabel}
      </button>

      <button
        className="btn-secondary"
        onClick={onClear}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '0 16px',
          height: '42px',
          fontSize: '13px',
          color: 'var(--text-2)',
          borderColor: 'var(--border-strong)',
          background: 'transparent',
          borderRadius: 'var(--r-md)',
          cursor: 'pointer',
          transition: 'all var(--t-fast) ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-soft)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <Trash2 size={15} />
        Limpiar
      </button>
    </div>
  );
}