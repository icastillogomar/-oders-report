/* ═══════════════════════════════════════════════════════════════
   Catálogo de errorCode del motor de EDD
   ───────────────────────────────────────────────────────────────
   Fuente única de verdad para etiquetas, descripciones, categoría
   y color. El color se fija POR CÓDIGO, no por frecuencia: así el
   mismo error se ve igual entre rangos de fecha y entre vistas, y
   comparar dos periodos no exige releer la leyenda.
   ═══════════════════════════════════════════════════════════════ */

export const ERROR_CATALOG = {
  0: {
    label: 'Sin error',
    desc: 'EDD calculada correctamente',
    category: 'Sin error',
    color: '#12b76a',
  },
  2: {
    label: 'Nodos en hold',
    desc: 'El o los nodos están en hold (edd_nodo_item_hold)',
    category: 'Operación',
    color: '#f59e0b',
  },
  3: {
    label: 'Sin trazos para el CP',
    desc: 'No hay trazos logísticos para ese código postal',
    category: 'Cobertura',
    color: '#3b82f6',
  },
  4: {
    label: 'Inventario insuficiente',
    desc: 'El inventario de la red no cubre la cantidad solicitada',
    category: 'Inventario',
    color: '#f97316',
  },
  5: {
    label: 'Sin capacidad operativa',
    desc: 'Sin capacidad operativa OMS',
    category: 'Capacidad',
    color: '#8b5cf6',
  },
  6: {
    label: 'Sin capacidad 4PL',
    desc: 'Sin capacidad del par (nodo, carrier)',
    category: 'Capacidad',
    color: '#14b8a6',
  },
  7: {
    label: 'Falla del solver',
    desc:
      'Falla real del solver (CBC). Genérico y ya poco frecuente: cuando la ' +
      'demanda no cabe en las cotas se reporta 4, 5 o 6 con la causa real',
    category: 'Motor',
    color: '#ec4899',
  },
  8: {
    label: 'Error inesperado de fecha',
    desc: 'El motor no devolvió rutas, o devolvió una fecha vacía o malformada',
    category: 'Motor',
    color: '#ef4444',
  },
  99: {
    label: 'Error del motor',
    desc:
      'Error del motor para ese CP (mensaje dinámico), o el motor no devolvió ' +
      'resultado para el SKU',
    category: 'Motor',
    color: '#b91c1c',
  },
};

/** Registros que la vista clasifica como Error pero que llegan sin código */
export const NO_CODE = {
  label: 'Sin código',
  desc: 'Clasificado como Error pero el registro no trae errorCode',
  category: 'Sin clasificar',
  color: '#94a3b8',
};

/** Colores para códigos que aparezcan y no estén en el catálogo */
const FALLBACK_COLORS = ['#0ea5e9', '#65a30d', '#c026d3', '#0f766e', '#a16207'];

const FALLBACK_KEY = ['SIN CÓDIGO', 'SIN_CODIGO', 'SIN CODIGO', ''];

/** Normaliza el errorCode tal como viene de BigQuery ('04', ' 4 ', 4 → '4') */
export const normalizeCode = (code) => {
  const s = String(code ?? '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  return s.toUpperCase();
};

/**
 * Resuelve un errorCode a su entrada del catálogo.
 * Nunca devuelve null: los códigos desconocidos reciben etiqueta genérica y
 * un color estable derivado del propio código, para no colisionar entre sí.
 */
export function getError(rawCode) {
  const code = normalizeCode(rawCode);

  if (FALLBACK_KEY.includes(code)) {
    return { code: 'SIN CÓDIGO', known: false, ...NO_CODE };
  }

  const hit = ERROR_CATALOG[code];
  if (hit) return { code, known: true, ...hit };

  // Color determinista para códigos nuevos: mismo código → mismo color
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  return {
    code,
    known: false,
    label: `Código ${code}`,
    desc: 'Código no catalogado. Revisa el mensaje del motor.',
    category: 'Sin clasificar',
    color: FALLBACK_COLORS[hash % FALLBACK_COLORS.length],
  };
}

/** Etiqueta corta para tablas: "4 · Inventario insuficiente" */
export const errorLabel = (rawCode) => {
  const e = getError(rawCode);
  return e.code === 'SIN CÓDIGO' ? e.label : `${e.code} · ${e.label}`;
};

export const CATEGORY_ORDER = [
  'Inventario',
  'Capacidad',
  'Cobertura',
  'Operación',
  'Motor',
  'Sin clasificar',
  'Sin error',
];
