import { useEffect, useState } from 'react';
import { AlertCircle, Inbox, Settings2 } from 'lucide-react';

/* ───────────────────────── helpers ───────────────────────── */

/* Secciones de la pantalla, por prefijo/semántica de la key. keys es el
   orden en que se listan dentro de la sección; cualquier key que llegue de
   la API y no esté aquí cae en "Otros" (fallback), para que una variable
   nueva siga apareciendo sin tocar este archivo. */
const SECTIONS = [
  { title: 'General', keys: ['IsLoggingEnabled', 'IsPlanBEnabled'] },
  { title: 'Plan A y Plan B', keys: ['PlanB1', 'PlanB2', 'Edd2'] },
  { title: 'Marketplace', keys: ['MarketplaceSLCC2', 'MarketplaceSLS2H2', 'MarketplaceBTS2H2'] },
  { title: 'Big Ticket', keys: ['BtAsa1', 'BtAsa2', 'Bt1', 'BtAsaNotice'] },
];

/* El tipo de control se decide por la forma del value que manda la API, no
   por una lista de keys: así una variable nueva se renderiza con el control
   correcto sin cambios de código. */
const controlTypeFor = (value) => {
  if (value === 'true' || value === 'false') return 'boolean';
  if (/^\d+$/.test(value)) return 'number';
  return 'text';
};

function groupVariables(variables) {
  const byKey = new Map(variables.map((v) => [v.key, v]));
  const used = new Set();

  const sections = SECTIONS.map((section) => {
    const items = section.keys
      .map((key) => byKey.get(key))
      .filter(Boolean);
    items.forEach((item) => used.add(item.key));
    return { title: section.title, items };
  }).filter((section) => section.items.length > 0);

  const rest = variables.filter((v) => !used.has(v.key));
  if (rest.length > 0) {
    sections.push({ title: 'Otros', items: rest });
  }

  return sections;
}

/* ───────────────────────── skeleton ───────────────────────── */

function OperationalConfigSkeleton() {
  return (
    <div className="op-config" aria-hidden="true">
      {[0, 1].map((s) => (
        <div className="op-config__section" key={s}>
          <div className="skeleton skel-row sm" style={{ width: 160, marginBottom: 16 }} />
          {[0, 1, 2].map((r) => (
            <div className="op-config__row" key={r}>
              <div style={{ flex: 1 }}>
                <div className="skeleton skel-row sm" style={{ width: '70%' }} />
                <div className="skeleton skel-row sm" style={{ width: '35%', marginTop: 6 }} />
              </div>
              <div className="skeleton skel-row sm" style={{ width: 80 }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── componente ───────────────────────── */

/**
 * Módulo de Configuración: consulta las variables operativas y las
 * presenta agrupadas, en controles editables. Alcance actual: solo lectura
 * contra el backend — los cambios quedan en estado local de React, no hay
 * guardado (ni botón ni PUT) todavía.
 */
function OperationalConfig() {
  const [variables, setVariables] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/operational-configurations-variables');
        const json = await res.json();
        if (!res.ok || json.success === false) {
          throw new Error(json.error || json.message || `HTTP ${res.status}`);
        }
        if (cancelled) return;

        const list = json.data || [];
        setVariables(list);
        setValues(Object.fromEntries(list.map((v) => [v.key, v.value])));
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) return <OperationalConfigSkeleton />;

  if (error) {
    return (
      <div className="alert alert--error" role="alert">
        <AlertCircle className="alert__icon" size={18} />
        <div>
          <strong>Error al cargar la configuración.</strong> {error}
        </div>
      </div>
    );
  }

  if (variables.length === 0) {
    return (
      <div className="alert alert--empty">
        <Inbox className="alert__icon" size={18} />
        <div>
          <strong>Sin variables.</strong> No hay configuraciones operativas registradas.
        </div>
      </div>
    );
  }

  const sections = groupVariables(variables);

  return (
    <div className="op-config">
      {sections.map((section) => (
        <div className="op-config__section" key={section.title}>
          <h2>
            <Settings2 size={18} strokeWidth={2.2} />
            {section.title}
          </h2>

          {section.items.map((item) => {
            const type = controlTypeFor(item.value);
            const inputId = `op-config-${item.key}`;
            const value = values[item.key] ?? item.value;

            return (
              <div className="op-config__row" key={item.id}>
                <div className="op-config__row-label">
                  <label htmlFor={inputId}>{item.description}</label>
                  <span className="op-config__row-key">{item.key}</span>
                </div>

                {type === 'boolean' ? (
                  <label className="op-config__switch">
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={value === 'true'}
                      onChange={(e) => handleChange(item.key, e.target.checked ? 'true' : 'false')}
                    />
                    <span className="op-config__switch-track" aria-hidden="true" />
                  </label>
                ) : (
                  <input
                    id={inputId}
                    className="op-config__input"
                    type={type === 'number' ? 'number' : 'text'}
                    inputMode={type === 'number' ? 'numeric' : undefined}
                    min={type === 'number' ? 0 : undefined}
                    value={value}
                    onChange={(e) => handleChange(item.key, e.target.value)}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default OperationalConfig;
