import { useState, useMemo } from 'react';
import { Download } from 'lucide-react';
import SearchSummary from './components/SearchSummary.jsx';
import ResultsTable from './components/ResultsTable.jsx';
import ExcelUploader from '../../components/common/ExcelUploader.jsx';
import ActionButtons from '../../components/common/ActionButtons.jsx';
import LoadingState from '../../components/common/LoadingState.jsx';
import ErrorAlert from '../../components/common/ErrorAlert.jsx';
import FirestoreConfigPanel from './components/FirestoreConfigPanel.jsx';

/**
 * Página principal del módulo Firebase Search.
 * Coordina los dos pasos del flujo (Análisis Estructural y Consulta a Firestore).
 */
export default function FirebaseSearchPage() {
  const [file, setFile] = useState(null);
  
  // Paso 1: Estados del Análisis Estructural
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sheets, setSheets] = useState(null);
  const [selectedSheets, setSelectedSheets] = useState([]);

  // Paso 2: Estados de la búsqueda en Firestore
  const [isLoading, setIsLoading] = useState(false);
  const [currentStage, setCurrentStage] = useState('idle'); // idle, reading, querying, formatting
  const [error, setError] = useState(null);
  
  // Resultados obtenidos del backend
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [processedFilename, setProcessedFilename] = useState('');

  // 1. Inicia el análisis ligero al seleccionar un archivo
  const handleFileSelected = async (selectedFile) => {
    setFile(selectedFile);
    setError(null);
    setResults([]);
    setSummary(null);
    setIsAnalyzing(true);
    setSheets(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/firebase/analyze', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Error al analizar estructura (HTTP ${response.status})`);
      }

      setSheets(data.sheets || []);

      // --- RECORDAR SELECCIÓN DE HOJAS ---
      const newSheetNames = (data.sheets || []).map(s => s.sheetName);
      // Filtrar las hojas que ya estaban seleccionadas anteriormente si es que siguen existiendo en el nuevo archivo
      const preserved = selectedSheets.filter(name => newSheetNames.includes(name));

      if (preserved.length > 0) {
        setSelectedSheets(preserved);
      } else {
        // Si no hay coincidencias previas o es primera subida, seleccionamos todas por defecto
        setSelectedSheets(newSheetNames);
      }

    } catch (err) {
      console.error('[FirebaseSearchPage Error] Falló análisis de Excel:', err);
      setError(err.message || 'No se pudo analizar la estructura del archivo Excel.');
      setFile(null); // Resetear archivo si falló el análisis
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

  // Limpiar/Quitar archivo seleccionado y estados
  const handleClearFile = () => {
    setFile(null);
    setError(null);
    setResults([]);
    setSummary(null);
    setSheets(null);
    // Nota: Conservamos el estado 'selectedSheets' intencionalmente en memoria para cumplir la regla
    // de recordar la selección si el usuario sube el mismo archivo o uno similar
    setProcessedFilename('');
  };

  // Suma de filas seleccionadas en tiempo real
  const totalSelectedRows = useMemo(() => {
    if (!sheets) return 0;
    return sheets
      .filter(s => selectedSheets.includes(s.sheetName))
      .reduce((sum, s) => sum + s.rowCount, 0);
  }, [sheets, selectedSheets]);

  // Reglas de deshabilitación del botón "Buscar en Firestore"
  const isSearchDisabled = useMemo(() => {
    return (
      !file ||
      isLoading ||
      isAnalyzing ||
      selectedSheets.length === 0
    );
  }, [file, isLoading, isAnalyzing, selectedSheets]);

  // Iniciar la búsqueda en Firestore mediante el endpoint backend
  const handleSearch = async () => {
    if (isSearchDisabled) return;

    setIsLoading(true);
    setError(null);
    setResults([]);
    setSummary(null);

    try {
      // ETAPA 1: Lectura y validación (Simulación cliente/inicio)
      setCurrentStage('reading');
      await new Promise((resolve) => setTimeout(resolve, 600));

      // ETAPA 2: Consulta a Firestore (Llamada al API de procesamiento)
      setCurrentStage('querying');

      const formData = new FormData();
      formData.append('file', file);
      // Enviamos el listado de hojas seleccionadas codificado en JSON
      formData.append('selectedSheets', JSON.stringify(selectedSheets));

      const response = await fetch('/api/firebase/orders', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Error del servidor (HTTP ${response.status})`);
      }

      // ETAPA 3: Construcción de resultados (Mapeo final antes de pintar)
      setCurrentStage('formatting');
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Guardar resultados exitosos
      setResults(data.results || []);
      setSummary(data.summary || null);
      setProcessedFilename(data.filename || file.name);

    } catch (err) {
      console.error('[FirebaseSearchPage Error] Falló búsqueda en Firestore:', err);
      setError(err.message || 'No se pudo conectar con el servidor o procesar las órdenes.');
    } finally {
      setIsLoading(false);
      setCurrentStage('idle');
    }
  };

  // Exportar los resultados actuales de la tabla a un archivo CSV descargable
  const handleExportCSV = async () => {
    if (!file || selectedSheets.length === 0) return;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('selectedSheets', JSON.stringify(selectedSheets));

      const response = await fetch('/api/firebase/export-csv', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'No se pudo generar el archivo CSV.');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;

      const disposition = response.headers.get('Content-Disposition');
      let downloadFilename = 'reporte_firebase_search.csv';
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
      alert(`Error al exportar CSV: ${err.message}`);
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
        <ExcelUploader
          file={file}
          isAnalyzing={isAnalyzing}
          isLoading={isLoading}
          sheets={sheets}
          selectedSheets={selectedSheets}
          totalSelectedRows={totalSelectedRows}
          onFileSelected={handleFileSelected}
          onToggleSheet={handleToggleSheet}
        />
        <FirestoreConfigPanel />
      </div>

      {/* Botones de Acción Principal (Aparecen cuando se ha analizado el archivo) */}
      {file && sheets && !isLoading && !isAnalyzing && results.length === 0 && (
        <ActionButtons
          isSearchDisabled={isSearchDisabled}
          onSearch={handleSearch}
          onClear={handleClearFile}
          searchLabel="Buscar en Firestore"
        />
      )}

      {/* Estado de Carga */}
      <LoadingState
        isLoading={isLoading}
        title="Consultando lotes eficientes en Google Firestore..."
        description="Esto puede tardar unos segundos dependiendo del número de órdenes y hojas seleccionadas."
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
            <div style={{ fontSize: '13px', color: 'var(--text-2)' }}>
              Resultados para: <strong>{processedFilename}</strong> (Hojas: {JSON.stringify(selectedSheets)})
            </div>
            
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn-secondary"
                onClick={handleExportCSV}
                title="Descargar todos los resultados cruzados en un archivo CSV"
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
                Exportar CSV
              </button>
              
              <button
                className="btn-secondary"
                onClick={handleClearFile}
                style={{
                  height: '36px',
                  padding: '0 12px',
                  fontSize: '12px',
                  borderColor: 'var(--border)',
                  borderRadius: 'var(--r-md)'
                }}
              >
                Nueva Búsqueda
              </button>
            </div>
          </div>

          {/* Tarjetas de Resumen KPI */}
          <SearchSummary summary={summary} />

          {/* Tabla Interactiva */}
          <ResultsTable results={results} />
        </>
      )}

    </div>
  );
}
