import { useRef } from 'react';
import { Upload, FileSpreadsheet } from 'lucide-react';

/**
 * Reusable Excel Upload Card and Sheet Selector.
 * Handles drag and drop, file selection, and custom sheet checkbox selections.
 */
export default function ExcelUploader({
  file,
  isAnalyzing,
  isLoading,
  sheets,
  selectedSheets,
  totalSelectedRows,
  onFileSelected,
  onToggleSheet
}) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    onFileSelected(selectedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (isLoading || isAnalyzing) return;
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      onFileSelected(droppedFile);
    }
  };

  return (
    <div 
      className={`dropzone ${file ? 'dropzone--has-file' : ''}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={(e) => {
        if (isLoading || isAnalyzing) return;
        if (fileInputRef.current) {
          fileInputRef.current.click();
        }
      }}
      style={{
        background: 'var(--surface)',
        border: '2px dashed var(--border-strong)',
        borderRadius: 'var(--r-lg)',
        padding: '32px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '240px',
        cursor: 'pointer',
        transition: 'all var(--t-fast) ease',
        position: 'relative'
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx, .xls"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        disabled={isLoading || isAnalyzing}
      />
      
      {!file ? (
        <>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: 'var(--r-full)',
            background: 'var(--brand-soft)',
            color: 'var(--brand-primary)',
            display: 'grid',
            placeItems: 'center',
            marginBottom: '16px'
          }}>
            <Upload size={24} />
          </div>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-1)', marginBottom: '6px' }}>
            Cargar listado de órdenes
          </h3>
          <p style={{ fontSize: '12.5px', color: 'var(--text-3)', maxWidth: '280px', margin: '0 auto 12px' }}>
            Arrastra aquí tu archivo de Excel (.xlsx, .xls) o haz clic para explorar tu equipo.
          </p>
        </>
      ) : (
        <>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: 'var(--r-full)',
            background: 'var(--success-soft)',
            color: 'var(--success)',
            display: 'grid',
            placeItems: 'center',
            marginBottom: '16px'
          }}>
            <FileSpreadsheet size={24} />
          </div>
          <h3 style={{ fontSize: '14.5px', fontWeight: '600', color: 'var(--text-1)', marginBottom: '4px', wordBreak: 'break-all' }}>
            {file.name}
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '16px' }}>
            Tamaño: {(file.size / 1024).toFixed(1)} KB
          </p>

          {/* Selector de Hojas */}
          {isAnalyzing ? (
            <div 
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: '12.5px', color: 'var(--text-2)', cursor: 'default' }}
            >
              Analizando estructura de hojas...
            </div>
          ) : sheets ? (
            <div 
              onClick={(e) => e.stopPropagation()}
              style={{ 
                width: '100%', 
                textAlign: 'left', 
                background: 'var(--bg-soft)', 
                borderRadius: 'var(--r-md)', 
                padding: '12px 14px', 
                border: '1px solid var(--border)',
                cursor: 'default'
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-3)', display: 'block', marginBottom: '8px', textTransform: 'uppercase', tracking: '0.05em' }}>
                Selecciona hojas a incluir:
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                {sheets.map((s) => (
                  <label key={s.sheetName} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--text-1)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedSheets.includes(s.sheetName)}
                      onChange={() => onToggleSheet(s.sheetName)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.sheetName}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      ({s.rowCount} filas)
                    </span>
                  </label>
                ))}
              </div>
              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border)', fontSize: '11.5px', color: 'var(--text-2)', display: 'flex', justifyContent: 'space-between' }}>
                <span>Hojas: {selectedSheets.length} seleccionadas</span>
                <strong>
                  Filas: {totalSelectedRows.toLocaleString()}
                </strong>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}