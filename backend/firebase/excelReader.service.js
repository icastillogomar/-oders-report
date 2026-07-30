import xlsx from 'xlsx';
import { config } from './firebase.config.js';

/**
 * Normaliza un encabezado para comparación flexible
 */
export function normalizeHeader(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Normaliza un número de orden para evitar inconsistencias de formato de Excel
 */
export function normalizeOrderNumber(val) {
  if (val === undefined || val === null) return '';
  let str = String(val).trim();
  
  if (str.endsWith('.0')) {
    str = str.slice(0, -2);
  }
  
  // Si es puramente numérico, mayor a 0 dígitos y menor a 10 dígitos, rellenar con ceros a la izquierda hasta llegar a 10 dígitos
  if (/^\d+$/.test(str) && str.length > 0 && str.length < 10) {
    str = str.padStart(10, '0');
  }
  
  return str;
}

const KNOWN_ORDER_HEADERS = [
  'nopedido',
  'orderno',
  'ov',
  'ovno',
  'noorden',
  'orderid',
  'pedido',
  'orden',
  'order',
  'numerodepedido',
  'numerodeorden',
  'idpedido',
  'idorden'
];

/**
 * Análisis ultra-ligero de la estructura del Excel (Paso 1 del flujo)
 * Obtiene únicamente nombres de hojas y conteo de filas de forma instantánea.
 * No realiza búsquedas de columnas ni análisis de celdas.
 * 
 * @param {Buffer} buffer - Buffer de datos del archivo cargado
 * @returns {object} Lista de hojas con conteo de filas y el límite configurado
 */
export function analyzeExcelStructure(buffer) {
  let workbook;
  try {
    // Lectura de estructura básica con SheetJS (ligero y rápido)
    workbook = xlsx.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false, cellText: false });
  } catch (error) {
    throw new Error('El archivo no es un Excel válido o está dañado.');
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('El archivo Excel no contiene ninguna hoja de cálculo.');
  }

  const sheets = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const ref = sheet['!ref'];
    let rowCount = 0;
    
    if (ref) {
      const range = xlsx.utils.decode_range(ref);
      rowCount = range.e.r - range.s.r + 1;
    }
    
    sheets.push({ sheetName, rowCount });
  }

  return {
    sheets,
    maxExcelRows: config.maxExcelRows
  };
}

/**
 * Procesa las celdas de las hojas de Excel SELECCIONADAS y extrae las órdenes normalizadas.
 * Implementa fallos suaves (Soft Failures) por hoja si no se detecta la columna de órdenes.
 * 
 * @param {Buffer} buffer - Buffer de datos del archivo cargado
 * @param {string[]} selectedSheets - Lista de nombres de hojas seleccionadas por el usuario
 * @returns {object} Resultados procesados con metadatos, órdenes extraídas y errores por hoja
 */
export function readExcelOrders(buffer, selectedSheets) {
  if (!selectedSheets || !Array.isArray(selectedSheets) || selectedSheets.length === 0) {
    throw new Error('Debes seleccionar al menos una hoja del Excel para procesar.');
  }

  let workbook;
  try {
    workbook = xlsx.read(buffer, { type: 'buffer' });
  } catch (error) {
    throw new Error('El archivo no es un Excel válido o está dañado.');
  }

  let totalSelectedRows = 0;
  const sheetErrors = {}; // Errores por hoja (soft failures)
  const extractedOrders = []; // Array de { orderNo, originalValue, sheetName, rowNum }
  const seenOrders = new Set();

  // 1. Calcular total de filas sumando ÚNICAMENTE las hojas seleccionadas (meramente informativo)
  for (const sheetName of selectedSheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const ref = sheet['!ref'];
    if (ref) {
      const range = xlsx.utils.decode_range(ref);
      totalSelectedRows += (range.e.r - range.s.r + 1);
    }
  }

  // 2. Procesar las hojas seleccionadas
  for (const sheetName of selectedSheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const ref = sheet['!ref'];
    if (!ref) {
      // Hoja vacía
      sheetErrors[sheetName] = 'La hoja seleccionada está vacía y no tiene registros.';
      continue;
    }

    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });
    if (rows.length === 0) {
      sheetErrors[sheetName] = 'La hoja seleccionada no contiene ningún dato.';
      continue;
    }

    // Detectar columna de órdenes
    const headers = rows[0];
    let orderColIndex = -1;

    if (headers && Array.isArray(headers)) {
      for (let colIdx = 0; colIdx < headers.length; colIdx++) {
        const normalizedHeader = normalizeHeader(headers[colIdx]);
        if (KNOWN_ORDER_HEADERS.includes(normalizedHeader)) {
          orderColIndex = colIdx;
          break;
        }
      }
    }

    // Heurística de respaldo si no hay encabezado exacto
    if (orderColIndex === -1 && rows.length > 1) {
      const testRowsLimit = Math.min(rows.length, 6);
      const columnScores = {};

      for (let r = 1; r < testRowsLimit; r++) {
        const rowData = rows[r];
        if (!rowData) continue;
        for (let c = 0; c < rowData.length; c++) {
          const cellVal = String(rowData[c] || '').trim();
          if (cellVal && /^\d{5,15}$/.test(cellVal)) {
            columnScores[c] = (columnScores[c] || 0) + 1;
          }
        }
      }

      let bestColIdx = -1;
      let maxScore = 0;
      for (const colIdx in columnScores) {
        if (columnScores[colIdx] > maxScore) {
          maxScore = columnScores[colIdx];
          bestColIdx = parseInt(colIdx);
        }
      }

      if (maxScore >= 2) {
        orderColIndex = bestColIdx;
        console.log(`[ExcelReader] Heurística: Columna detectada en "${sheetName}", columna ${orderColIndex}`);
      }
    }

    // Si falló la detección para esta hoja, guardamos el error como Soft Failure y pasamos a la siguiente hoja
    if (orderColIndex === -1) {
      sheetErrors[sheetName] = 'No se pudo detectar la columna de órdenes. Asegúrate de incluir un encabezado válido como "noPedido", "orderNo" o "ov".';
      continue;
    }

    // Extraer órdenes de la hoja exitosa
    for (let rIdx = 1; rIdx < rows.length; rIdx++) {
      const rowData = rows[rIdx];
      if (!rowData) continue;

      const rawValue = rowData[orderColIndex];
      const normalizedVal = normalizeOrderNumber(rawValue);

      if (normalizedVal) {
        extractedOrders.push({
          orderNo: normalizedVal,
          originalValue: rawValue,
          sheetName,
          rowNum: rIdx + 1
        });
        seenOrders.add(normalizedVal);
      }
    }
  }

  // 3. Retornar resultados, incluso si algunas hojas fallaron
  return {
    success: true,
    totalSelectedRows,
    ordersCount: extractedOrders.length,
    uniqueOrdersCount: seenOrders.size,
    uniqueOrdersList: Array.from(seenOrders),
    extractedOrders,
    sheetErrors // Mapeo de hoja -> mensaje de error para retroalimentación
  };
}
