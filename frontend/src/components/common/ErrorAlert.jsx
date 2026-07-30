import { AlertCircle } from 'lucide-react';

/**
 * Reusable soft red error alert banner.
 */
export default function ErrorAlert({ error }) {
  if (!error) return null;

  return (
    <div 
      className="alert alert--error" 
      role="alert" 
      style={{ 
        marginBottom: '24px', 
        padding: '16px', 
        background: '#fdf2f2', 
        border: '1px solid #f5c2c2', 
        borderRadius: 'var(--r-md)', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px', 
        color: '#9b1c1c' 
      }}
    >
      <AlertCircle size={20} />
      <div style={{ fontSize: '13px', textAlign: 'left' }}>
        <strong>Error:</strong> {error}
      </div>
    </div>
  );
}