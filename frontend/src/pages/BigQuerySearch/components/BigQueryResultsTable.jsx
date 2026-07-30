import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Helper para extraer de forma segura valores de celdas que puedan venir
 * envueltos en objetos de tipo BigQuery (por ejemplo, { value: '...' }).
 */
const getRawValue = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if (val.hasOwnProperty('value')) {
      return val.value;
    }
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return val;
};

/**
 * Tabla interactiva adaptativa para visualizar los resultados de la búsqueda en BigQuery.
 * Soporta búsqueda de texto, paginación, ordenamiento de columnas y cambio de columnas según el tipo de tabla.
 */
export default function BigQueryResultsTable({ results, tableType }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Configuración del ordenamiento por defecto según la tabla
  const defaultSortKey = tableType === 'orders' ? 'orderNumber' : 'OrderNo';
  const [sortConfig, setSortConfig] = useState({ key: defaultSortKey, direction: 'ascending' });

  // Columnas específicas para cada tabla
  const COLUMNS = useMemo(() => {
    if (tableType === 'orders') {
      return [
        { key: 'orderNumber', label: 'Order Number' },
        { key: 'sku', label: 'SKU' },
        { key: 'plan', label: 'Plan' },
        { key: 'channel', label: 'Canal' },
        { key: 'company', label: 'Compañía' },
        { key: 'edd1', label: 'EDD1' },
        { key: 'edd2', label: 'EDD2' },
        { key: 'daysToDelivery', label: 'Días Entrega' },
        { key: 'zipCode', label: 'C.P.' },
        { key: 'storeSelected', label: 'Tienda' },
        { key: 'Error', label: 'Error' },
        { key: 'ErrorMessage', label: 'Mensaje Error' },
        { key: 'ingestionTimestamp', label: 'Fecha Ingesta' },
        { key: 'createdAt', label: 'Creado' }
      ];
    } else {
      return [
        { key: 'OrderNo', label: 'Order No' },
        { key: 'ItemID', label: 'Item ID' },
        { key: 'ItemDesc', label: 'Descripción Item' },
        { key: 'Status', label: 'Estatus' },
        { key: 'MaxLineStatusDesc', label: 'Desc Estatus' },
        { key: 'OrderedQty', label: 'Cant' },
        { key: 'ZipCode', label: 'C.P.' },
        { key: 'EnterpriseCode', label: 'Empresa' },
        { key: 'CarrierId', label: 'Carrier ID' },
        { key: 'RouteEDD1', label: 'Route EDD1' },
        { key: 'RouteEDD2', label: 'Route EDD2' },
        { key: 'IsRecalculated', label: 'Recalculado' },
        { key: 'OrderDate', label: 'Fecha Orden' }
      ];
    }
  }, [tableType]);

  // 1. Filtrado de datos por búsqueda por texto
  const filteredResults = useMemo(() => {
    return results.filter((row) => {
      if (searchTerm.trim() !== '') {
        const query = searchTerm.toLowerCase();
        
        if (tableType === 'orders') {
          const orderNum = String(getRawValue(row.orderNumber)).toLowerCase();
          const sku = String(getRawValue(row.sku)).toLowerCase();
          const channel = String(getRawValue(row.channel)).toLowerCase();
          const err = String(getRawValue(row.Error)).toLowerCase();
          return orderNum.includes(query) || sku.includes(query) || channel.includes(query) || err.includes(query);
        } else {
          const orderNo = String(getRawValue(row.OrderNo)).toLowerCase();
          const itemId = String(getRawValue(row.ItemID)).toLowerCase();
          const desc = String(getRawValue(row.ItemDesc)).toLowerCase();
          const status = String(getRawValue(row.Status)).toLowerCase();
          return orderNo.includes(query) || itemId.includes(query) || desc.includes(query) || status.includes(query);
        }
      }
      return true;
    });
  }, [results, searchTerm, tableType]);

  // 2. Ordenamiento de datos
  const sortedResults = useMemo(() => {
    const sortableItems = [...filteredResults];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let valA = getRawValue(a[sortConfig.key]);
        let valB = getRawValue(b[sortConfig.key]);

        if (valA === undefined || valA === null) valA = '';
        if (valB === undefined || valB === null) valB = '';

        // Forzar comparación numérica si corresponde
        if (sortConfig.key === 'OrderedQty' || sortConfig.key === 'quantity' || sortConfig.key === 'daysToDelivery') {
          return sortConfig.direction === 'ascending' 
            ? Number(valA) - Number(valB)
            : Number(valB) - Number(valA);
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();

        if (strA < strB) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
                    }
        if (strA > strB) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredResults, sortConfig]);

  // 3. Paginación local
  const paginatedResults = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedResults.slice(startIndex, startIndex + pageSize);
  }, [sortedResults, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sortedResults.length / pageSize));

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <div className="chart-card" style={{ padding: '20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', marginTop: '24px' }}>
      
      {/* Barra de Filtros de la Tabla */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-1)' }}>
            Registros devueltos por BigQuery ({tableType === 'orders' ? 'FAC_EDD_ORDERS_HIS' : 'FAC_EDD_RECALCULATE_TRN'})
          </h3>
          <span className="chip" style={{ background: 'var(--brand-soft)', color: 'var(--brand-primary)', fontWeight: '600' }}>
            {filteredResults.length} de {results.length} filas
          </span>
        </div>

        {/* Búsqueda */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div className="input-wrap" style={{ width: '280px', margin: 0 }}>
            <Search className="input-wrap__icon" size={15} />
            <input
              type="text"
              placeholder={tableType === 'orders' ? "Buscar por orden, SKU, canal..." : "Buscar por orden, ítem, estatus..."}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              style={{ fontSize: '13px', height: '36px' }}
            />
          </div>
        </div>
      </div>

      {/* Tabla de Resultados */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', color: 'var(--text-1)' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              {COLUMNS.map((col) => {
                const isSorted = sortConfig.key === col.key;
                return (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    style={{
                      padding: '12px 14px',
                      fontWeight: '600',
                      textAlign: 'center',
                      cursor: 'pointer',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                      borderRight: '1px solid var(--border-soft)'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--surface-3)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {col.label}
                      {isSorted ? (
                        sortConfig.direction === 'ascending' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                      ) : (
                        <ChevronDown size={14} style={{ opacity: 0.15 }} />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedResults.length > 0 ? (
              paginatedResults.map((row, rIdx) => {
                const uniqueRowKey = tableType === 'orders' 
                  ? `${row.orderNumber}-${row.sku}-${rIdx}` 
                  : `${row.OrderNo}-${row.OrderLineKey}-${rIdx}`;

                return (
                  <tr
                    key={uniqueRowKey}
                    style={{
                      borderBottom: '1px solid var(--border-soft)',
                      background: rIdx % 2 === 1 ? 'var(--bg-soft)' : 'transparent'
                    }}
                  >
                    {COLUMNS.map((col) => {
                      let value = row[col.key];

                      // 1. Descomponer objeto si es de tipo { value: ... } o similar
                      if (value !== null && typeof value === 'object') {
                        if (value.hasOwnProperty('value')) {
                          value = value.value;
                        } else {
                          try {
                            value = JSON.stringify(value);
                          } catch (e) {
                            value = String(value);
                          }
                        }
                      }

                      // 2. Formatear valores booleanos, nulos o vacíos
                      if (value === true || value === 'true') {
                        value = 'Sí';
                      } else if (value === false || value === 'false') {
                        value = 'No';
                      } else if (value === null || value === undefined) {
                        value = '';
                      } else if (value === '') {
                        value = '-';
                      }

                      // Si es la columna de "Error" y no está vacía, pintar en rojo suave
                      const isErrorCol = col.key === 'Error' || col.key === 'ErrorMessage';
                      const hasError = isErrorCol && value !== '-' && value !== '';

                      return (
                        <td
                          key={col.key}
                          style={{
                            padding: '10px 14px',
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            maxWidth: '240px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            color: hasError ? 'var(--danger)' : 'var(--text-1)',
                            fontWeight: hasError ? '500' : 'normal',
                            borderRight: '1px solid var(--border-soft)'
                          }}
                          title={String(value)}
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={COLUMNS.length} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No se encontraron registros que coincidan con la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Controles de Paginación */}
      {sortedResults.length > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '16px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Selector de tamaño de página */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-2)' }}>
            <span>Mostrar</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              style={{
                height: '32px',
                padding: '0 8px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-1)',
                fontSize: '13px'
              }}
            >
              <option value={10}>10 filas</option>
              <option value={20}>20 filas</option>
              <option value={50}>50 filas</option>
              <option value={100}>100 filas</option>
            </select>
            <span>por página</span>
          </div>

          {/* Botones de navegación de página */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-2)' }}>
              Página <strong>{currentPage}</strong> de {totalPages}
            </span>

            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  background: currentPage === 1 ? 'var(--bg-soft)' : 'var(--surface)',
                  color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text-1)',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  display: 'grid',
                  placeItems: 'center'
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border)',
                  background: currentPage === totalPages ? 'var(--bg-soft)' : 'var(--surface)',
                  color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text-1)',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  display: 'grid',
                  placeItems: 'center'
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
