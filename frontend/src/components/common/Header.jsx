import { Activity } from 'lucide-react';

/**
 * Cabecera común y estilizada para toda la aplicación
 */
export default function Header({ title, subtitle, metaContent }) {
  return (
    <header className="app-header">
      <div className="app-header__title">
        <div className="app-header__logo">
          <Activity size={22} strokeWidth={2.2} />
        </div>
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="subtitle">{subtitle}</p>}
        </div>
      </div>

      {metaContent && (
        <div className="app-header__meta">
          {metaContent}
        </div>
      )}
    </header>
  );
}
