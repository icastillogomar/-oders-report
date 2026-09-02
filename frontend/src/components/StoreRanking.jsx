import { useState } from 'react';
import { Store, ShoppingBag, ChevronDown, ChevronUp } from 'lucide-react';

const TOP_N = 15;

/**
 * Ranking de asignaciones por tienda (columna `origen`).
 * Las líneas sin tienda de origen (bucket MKTP) se muestran aparte:
 * son en su mayoría Marketplace, surtidas por el vendedor externo.
 */
function StoreRanking({ stores }) {
  const [showAll, setShowAll] = useState(false);

  const mktp = stores.find((s) => s.tienda === 'MKTP');
  const ranked = stores.filter((s) => s.tienda !== 'MKTP');

  const totalConOrigen = ranked.reduce((acc, s) => acc + s.asignaciones, 0);
  const grandTotal = totalConOrigen + (mktp?.asignaciones || 0);
  const max = ranked.length ? ranked[0].asignaciones : 0;

  const visible = showAll ? ranked : ranked.slice(0, TOP_N);
  const fmt = (n) => n.toLocaleString('es-MX');
  const pct = (n, base) => (base ? ((n / base) * 100).toFixed(1) : '0.0');

  return (
    <div className="store-rank">
      {mktp && (
        <div className="store-rank__mktp">
          <ShoppingBag size={15} strokeWidth={2.2} />
          <span>
            <strong>{fmt(mktp.asignaciones)}</strong> líneas sin tienda de
            origen ({pct(mktp.asignaciones, grandTotal)}% · mayormente
            Marketplace, surte el vendedor externo)
          </span>
        </div>
      )}

      <ol className="store-rank__list">
        {visible.map((s, i) => (
          <li key={s.tienda} className="store-rank__row">
            <span className="store-rank__pos">#{i + 1}</span>
            <span className="store-rank__name">
              <Store size={13} strokeWidth={2.2} />
              Tienda {s.tienda}
            </span>
            <span className="store-rank__bar" aria-hidden="true">
              <span
                style={{ width: `${max ? (s.asignaciones / max) * 100 : 0}%` }}
              />
            </span>
            <span className="store-rank__value">{fmt(s.asignaciones)}</span>
            <span className="store-rank__pct">
              {pct(s.asignaciones, totalConOrigen)}%
            </span>
          </li>
        ))}
      </ol>

      {ranked.length > TOP_N && (
        <button
          type="button"
          className="store-rank__toggle"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? (
            <>
              <ChevronUp size={14} /> Ver solo top {TOP_N}
            </>
          ) : (
            <>
              <ChevronDown size={14} /> Ver las {ranked.length} tiendas
            </>
          )}
        </button>
      )}
    </div>
  );
}

export default StoreRanking;
