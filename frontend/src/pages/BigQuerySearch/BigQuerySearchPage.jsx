import { useState, useMemo, useRef } from 'react';
import { Search, Download, Trash2, AlertCircle, FileSpreadsheet, Upload, Check, Settings, Calendar } from 'lucide-react';
import BigQuerySearchSummary from './components/BigQuerySearchSummary.jsx';
import BigQueryResultsTable from './components/BigQueryResultsTable.jsx';
import ExcelUploader from '../../components/common/ExcelUploader.jsx';
import ActionButtons from '../../components/common/ActionButtons.jsx';
import LoadingState from '../../components/common/LoadingState.jsx';
import ErrorAlert from '../../components/common/ErrorAlert.jsx';

/**
 * Página principal del módulo BigQuery Search.
 * Coordina la carga de Excel, configuración de parámetros de BigQuery y la consulta.
 */
export default function BigQuerySearchPage() {
  const [file, setFile] = useState(null);

  // Paso 1: Estados del Análisis Estructural de Excel
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sheets, setSheets] = useState(null);
  const [selectedSheets, setSelectedSheets] = useState([]);

  // Configuración de BigQuery
  const [tableType, setTableType] = useState('orders'); // orders o recalculate
  const [projectId, setProjectId] = useState('crp-pro-dig-edd');
  const [dataset, setDataset] = useState('mus_pro_digital_prd_tbls');
  const [startDate, setStartDate] = useState('2026-05-01');
  const [endDate, setEndDate] = useState('2026-05-28');

  // Estados de carga y error de BigQuery
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Resultados obtenidos del backend
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [requestedOrders, setRequestedOrders] = useState([]);
  const [processedFilename, setProcessedFilename] = useState('');

  const processSelectedFile = async (selectedFile) => {
    setFile(selectedFile);
    setError(null);
    setResults([]);
    setSummary(null);
    setIsAnalyzing(true);
    setSheets(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/bigquery/analyze', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Error al analizar estructura (HTTP ${response.status})`);
      }

      setSheets(data.sheets || []);

      // Seleccionar todas las hojas por defecto
      const sheetNames = (data.sheets || []).map(s => s.sheetName);
      setSelectedSheets(sheetNames);

    } catch (err) {
      console.error('[BigQuerySearchPage Error] Falló análisis de Excel:', err);
      setError(err.message || 'No se pudo analizar la estructura del archivo Excel.');
      setFile(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Alternar checkbox de selección de hojas
  const handleToggleSheet = (sheetName) => {
    if (selectedSheets.includes(sheetName)) {
      setSelectedSheets(selectedSheets.filter(name => name !== sheetName));
    } else {
      setSelectedSheets([...selectedSheets, sheetName]);
    }
  };

  const handleClearFile = () => {
    setFile(null);
    setError(null);
    setResults([]);
    setSummary(null);
    setSheets(null);
    setSelectedSheets([]);
    setProcessedFilename('');
  };

  // Suma de filas seleccionadas en tiempo real
  const totalSelectedRows = useMemo(() => {
    if (!sheets) return 0;
    return sheets
      .filter(s => selectedSheets.includes(s.sheetName))
      .reduce((sum, s) => sum + s.rowCount, 0);
  }, [sheets, selectedSheets]);

  // Reglas de deshabilitación del botón "Buscar en BigQuery"
  const isSearchDisabled = useMemo(() => {
    return (
      !file ||
      isLoading ||
      isAnalyzing ||
      selectedSheets.length === 0 ||
      !startDate ||
      !endDate ||
      !projectId ||
      !dataset
    );
  }, [file, isLoading, isAnalyzing, selectedSheets, startDate, endDate, projectId, dataset]);

  // Ejecutar búsqueda en BigQuery
  const handleSearch = async () => {
    if (isSearchDisabled) return;

    setIsLoading(true);
    setError(null);
    setResults([]);
    setSummary(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('selectedSheets', JSON.stringify(selectedSheets));
      formData.append('tableType', tableType);
      formData.append('projectId', projectId);
      formData.append('dataset', dataset);
      formData.append('startDate', startDate);
      formData.append('endDate', endDate);

      const response = await fetch('/api/bigquery/search', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Error del servidor (HTTP ${response.status})`);
      }

      setResults(data.results || []);
      setSummary(data.summary || null);
      setRequestedOrders(data.requestedOrders || []);
      setProcessedFilename(data.filename || file.name);

    } catch (err) {
      console.error('[BigQuerySearchPage Error] Falló búsqueda en BigQuery:', err);
      setError(err.message || 'No se pudo conectar con el servidor o procesar la búsqueda.');
    } finally {
      setIsLoading(false);
    }
  };

  // Descargar Excel Formateado
  const handleExportExcel = async () => {
    if (results.length === 0) return;

    try {
      const response = await fetch('/api/bigquery/export-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          results: results,
          requestedOrders: requestedOrders,
          tableType: tableType,
          filename: processedFilename
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'No se pudo generar el archivo Excel.');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;

      const disposition = response.headers.get('Content-Disposition');
      let downloadFilename = `resultado_bigquery_${tableType}.xlsx`;
      if (disposition) {
        const filenameMatch = disposition.match(/filename="?([^";]+)"?/);
        if (filenameMatch && filenameMatch[1]) {
          downloadFilename = filenameMatch[1];
        }
      }

      link.download = downloadFilename;
      document.body.appendChild(link);
      link.click();
      
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

    } catch (err) {
      alert(`Error al exportar Excel: ${err.message}`);
    }
  };

  return (
    <div style={{ animation: 'fade-in var(--t-slow) ease-out' }}>
      
      {/* Panel de Configuración y Carga de Excel */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '24px',
        marginBottom: '24px'
      }}>
        
        {/* Zona de Arrastre de Archivo */}
        <ExcelUploader
          file={file}
          isAnalyzing={isAnalyzing}
          isLoading={isLoading}
          sheets={sheets}
          selectedSheets={selectedSheets}
          totalSelectedRows={totalSelectedRows}
          onFileSelected={processSelectedFile}
          onToggleSheet={handleToggleSheet}
        />

        {/* Panel de Configuración de BigQuery (Date Pickers & Selects) */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '4px' }}>
            <Settings size={16} /> Parámetros de BigQuery
          </h3>

          {/* Tipo de Tabla */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>
              Tabla destino de búsqueda:
            </label>
            <select
              value={tableType}
              onChange={(e) => setTableType(e.target.value)}
              disabled={isLoading || isAnalyzing}
              style={{
                width: '100%',
                height: '38px',
                padding: '0 10px',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border-strong)',
                background: 'var(--surface)',
                color: 'var(--text-1)',
                fontSize: '13px'
              }}
            >
              <option value="orders">FAC_EDD_ORDERS_HIS (orders)</option>
              <option value="recalculate">FAC_EDD_RECALCULATE_TRN (recalculate)</option>
            </select>
          </div>

          {/* Rango de Fechas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>
                Fecha Inicio:
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isLoading || isAnalyzing}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 8px',
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--border-strong)',
                    background: 'var(--surface)',
                    color: 'var(--text-1)',
                    fontSize: '13px'
                  }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>
                Fecha Fin:
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={isLoading || isAnalyzing}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 8px',
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--border-strong)',
                    background: 'var(--surface)',
                    color: 'var(--text-1)',
                    fontSize: '13px'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Proyecto y Dataset */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>
                ID Proyecto GCP:
              </label>
              <input
                type="text"
                placeholder="crp-pro-dig-edd"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={isLoading || isAnalyzing}
                style={{
                  width: '100%',
                  height: '38px',
                  padding: '0 10px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border-strong)',
                  background: 'var(--surface)',
                  color: 'var(--text-1)',
                  fontSize: '13px'
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>
                Dataset:
              </label>
              <input
                type="text"
                placeholder="mus_pro_digital_prd_tbls"
                value={dataset}
                onChange={(e) => setDataset(e.target.value)}
                disabled={isLoading || isAnalyzing}
                style={{
                  width: '100%',
                  height: '38px',
                  padding: '0 10px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border-strong)',
                  background: 'var(--surface)',
                  color: 'var(--text-1)',
                  fontSize: '13px'
                }}
              />
            </div>
          </div>

        </div>

      </div>

      {/* Botones de Acción Principal */}
      {file && sheets && !isLoading && !isAnalyzing && results.length === 0 && (
        <ActionButtons
          isSearchDisabled={isSearchDisabled}
          onSearch={handleSearch}
          onClear={handleClearFile}
          searchLabel="Consultar en BigQuery"
        />
      )}

      {/* Skeletons / Estado de Carga */}
      <LoadingState
        isLoading={isLoading}
        title="Ejecutando consulta en Google BigQuery..."
        description="Esto puede tardar unos segundos dependiendo del volumen de datos y rango de fechas."
      />

      {/* Alerta de Errores */}
      <ErrorAlert error={error} />

      {/* Resultados Pintados */}
      {results.length > 0 && !isLoading && (
        <>
          {/* Botón de Exportación Superior e Información de Archivo */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '20px',
            padding: '12px 16px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)'
          }}>
            <div style={{ fontSize: '13.5px', color: 'var(--text-2)' }}>
              Resultados para: <strong>{processedFilename}</strong> (Hojas: {JSON.stringify(selectedSheets)}) en tabla: <code>{tableType}</code>
            </div>
            
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn-secondary"
                onClick={handleExportExcel}
                title="Descargar archivo de Excel formateado exactamente con los reportes Resumen y Detalle"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0 16px',
                  height: '36px',
                  fontSize: '13px',
                  fontWeight: '600',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border-strong)',
                  backgroundColor: 'var(--surface)',
                  color: 'var(--text-1)',
                  cursor: 'pointer'
                }}
              >
                <Download size={15} strokeWidth={2.4} />
                Exportar Excel (.xlsx)
              </button>
              
              <button
                className="btn-secondary"
                onClick={handleClearFile}
                style={{
                  height: '36px',
                  padding: '0 12px',
                  fontSize: '12.5px',
                  borderColor: 'var(--border)',
                  borderRadius: 'var(--r-md)'
                }}
              >
                Nueva Consulta
              </button>
            </div>
          </div>

          {/* Tarjetas de Resumen KPI */}
          <BigQuerySearchSummary summary={summary} />

          {/* Tabla Interactiva */}
          <BigQueryResultsTable results={results} tableType={tableType} />
        </>
      )}

    </div>
  );
}
