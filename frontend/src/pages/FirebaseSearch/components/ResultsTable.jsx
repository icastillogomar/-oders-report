import { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Tabla interactiva para visualizar los resultados de la búsqueda de Firestore.
 * Incluye búsqueda por texto, filtro de estado, paginación y ordenamiento de columnas.
 */
export default function ResultsTable({ results }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, FOUND, NOT_FOUND
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortConfig, setSortConfig] = useState({ key: 'ORDER_NO', direction: 'ascending' });

  // Columnas a mostrar en la tabla (las 15 requeridas oficialmente + hoja/fila para trazabilidad opcional)
  const COLUMNS = [
    { key: 'ORDER_NO', label: 'ORDER_NO' },
    { key: 'ITEM_ID', label: 'ITEM_ID' },
    { key: 'Encontrado', label: 'Encontrado' },
    { key: 'Firebase Doc Id', label: 'Firebase Doc Id' },
    { key: 'Fecha Compra', label: 'Fecha Compra' },
    { key: 'Fecha Estimada', label: 'Fecha Estimada' },
    { key: 'SKU', label: 'SKU' },
    { key: 'ProductType', label: 'ProductType' },
    { key: 'FulfillmentType', label: 'FulfillmentType' },
    { key: 'Canal', label: 'Canal' },
    { key: 'CP', label: 'CP' },
    { key: 'Calle', label: 'Calle' },
    { key: 'Store', label: 'Store' },
    { key: 'Error', label: 'Error' },
    { key: 'ErrorMessage', label: 'ErrorMessage' },
    { key: '_sheetName', label: 'Hoja' },
    { key: '_rowNum', label: 'Fila' }
  ];

  // 1. Filtrado de datos por búsqueda por texto y estado
  const filteredResults = useMemo(() => {
    return results.filter((row) => {
      // Filtro de estado "Encontrado"
      if (statusFilter === 'FOUND' && row.Encontrado !== 'Sí') return false;
      if (statusFilter === 'NOT_FOUND' && row.Encontrado !== 'No') return false;

      // Filtro de búsqueda por texto (Order No, SKU, Store o Canal)
      if (searchTerm.trim() !== '') {
        const query = searchTerm.toLowerCase();
        const matchesOrder = String(row.ORDER_NO).toLowerCase().includes(query);
        const matchesSku = String(row.SKU).toLowerCase().includes(query);
        const matchesItemId = String(row.ITEM_ID).toLowerCase().includes(query);
        const matchesStore = String(row.Store).toLowerCase().includes(query);
        return matchesOrder || matchesSku || matchesItemId || matchesStore;
      }

      return true;
    });
  }, [results, searchTerm, statusFilter]);

  // 2. Ordenamiento de datos
  const sortedResults = useMemo(() => {
    const sortableItems = [...filteredResults];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        // Manejar valores nulos o indefinidos
        if (valA === undefined || valA === null) valA = '';
        if (valB === undefined || valB === null) valB = '';

        // Forzar comparación numérica si es fila, de lo contrario comparar como string
        if (sortConfig.key === '_rowNum') {
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

  // Cambiar ordenamiento al hacer clic en cabecera
  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1); // Reiniciar a página 1 al ordenar
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  return (
    <div className="chart-card" style={{ padding: '20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)' }}>
      
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
            Tabla de Registros
          </h3>
          <span className="chip" style={{ background: 'var(--brand-soft)', color: 'var(--brand-primary)', fontWeight: '600' }}>
            {filteredResults.length} de {results.length} filas
          </span>
        </div>

        {/* Controles de Búsqueda y Filtro */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          
          {/* Input de Búsqueda */}
          <div className="input-wrap" style={{ width: '240px', margin: 0 }}>
            <Search className="input-wrap__icon" size={15} />
            <input
              type="text"
              placeholder="Buscar por orden, SKU, ítem..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              style={{ fontSize: '13px', height: '36px' }}
            />
          </div>

          {/* Selector de Estado */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            style={{
              height: '36px',
              padding: '0 12px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--surface-color)',
              color: 'var(--text-color)',
              fontSize: '13px',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="ALL">Todos los estados</option>
            <option value="FOUND">Encontrados (Sí)</option>
            <option value="NOT_FOUND">No encontrados (No)</option>
          </select>

          {/* Selector de Tamaño de Página */}
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            style={{
              height: '36px',
              padding: '0 8px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--surface-color)',
              color: 'var(--text-color)',
              fontSize: '13px',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value={10}>10 por pág.</option>
            <option value={20}>20 por pág.</option>
            <option value={50}>50 por pág.</option>
            <option value={100}>100 por pág.</option>
          </select>
        </div>
      </div>

      {/* Contenedor de la Tabla con scroll horizontal */}
      <div style={{ overflowX: 'auto', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          textAlign: 'left',
          fontSize: '13px',
          color: 'var(--text-2)',
          tableLayout: 'auto'
        }}>
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
                      color: 'var(--text-1)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      userSelect: 'none',
                      transition: 'background var(--t-fast)'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--border)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {col.label}
                      {isSorted ? (
                        sortConfig.direction === 'ascending' ? (
                          <ChevronUp size={14} style={{ color: 'var(--brand-primary)' }} />
                        ) : (
                          <ChevronDown size={14} style={{ color: 'var(--brand-primary)' }} />
                        )
                      ) : (
                        <ChevronDown size={14} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedResults.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No se encontraron registros que coincidan con los filtros aplicados.
                </td>
              </tr>
            ) : (
              paginatedResults.map((row, idx) => {
                const isFound = row.Encontrado === 'Sí';
                return (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      backgroundColor: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                      transition: 'background var(--t-fast)'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--brand-soft)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)'}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: '500', color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                      {row.ORDER_NO}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{row.ITEM_ID}</td>
                    
                    {/* Badge de Encontrado */}
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                        padding: '2px 8px',
                        borderRadius: 'var(--r-full)',
                        background: isFound ? 'var(--success-soft)' : 'var(--danger-soft)',
                        color: isFound ? 'var(--success)' : 'var(--danger)'
                      }}>
                        {isFound ? (
                          <>
                            <CheckCircle2 size={12} /> Sí
                          </>
                        ) : (
                          <>
                            <AlertCircle size={12} /> No
                          </>
                        )}
                      </span>
                    </td>

                    <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '11px', whiteSpace: 'nowrap', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row['Firebase Doc Id']}>
                      {row['Firebase Doc Id']}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{row['Fecha Compra']}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{row['Fecha Estimada']}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{row.SKU}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{row.ProductType}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{row.FulfillmentType}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{row.Canal}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{row.CP}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.Calle}>{row.Calle}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{row.Store}</td>
                    
                    {/* Badge de Error */}
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        display: 'inline',
                        fontSize: '11px',
                        fontWeight: '500',
                        padding: '1px 6px',
                        borderRadius: 'var(--r-sm)',
                        background: row.Error === 'Sí' ? 'var(--danger-soft)' : 'var(--success-soft)',
                        color: row.Error === 'Sí' ? 'var(--danger)' : 'var(--success)'
                      }}>
                        {row.Error}
                      </span>
                    </td>
                    
                    <td style={{ padding: '10px 14px', color: 'var(--danger)', whiteSpace: 'nowrap' }}>
                      {row.ErrorMessage || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>

                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontSize: '12px', color: 'var(--text-3)' }}>
                      {row._sheetName}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontSize: '12px', color: 'var(--text-3)' }}>
                      {row._rowNum}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Controles de Paginación */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '16px',
          fontSize: '12px',
          color: 'var(--text-3)'
        }}>
          <div>
            Mostrando registros <strong>{((currentPage - 1) * pageSize) + 1}</strong> al <strong>{Math.min(currentPage * pageSize, filteredResults.length)}</strong> de <strong>{filteredResults.length}</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              style={{
                height: '32px',
                width: '32px',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text-2)',
                display: 'grid',
                placeItems: 'center',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage === 1 ? 0.5 : 1
              }}
            >
              <ChevronLeft size={16} />
            </button>
            
            <span style={{ margin: '0 8px' }}>
              Página <strong>{currentPage}</strong> de {totalPages}
            </span>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              style={{
                height: '32px',
                width: '32px',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text-2)',
                display: 'grid',
                placeItems: 'center',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                opacity: currentPage === totalPages ? 0.5 : 1
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
