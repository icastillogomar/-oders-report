import { analyzeExcelStructure, readExcelOrders } from './excelReader.service.js';
import { searchOrdersInFirestore, combineAndFormatResults } from './firestoreSearch.service.js';
import { generateCsvString } from './csvExport.service.js';
import { config } from './firebase.config.js';

/**
 * Paso 1: Analizar la estructura básica del archivo Excel.
 * Extrae de manera ultra-rápida únicamente los nombres de las hojas y su conteo de filas.
 * No analiza celdas ni columnas.
 * POST /api/firebase/analyze
 */
export function analyzeExcelFile(req, res) {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionó ningún archivo para analizar.'
      });
    }

    if (!config.allowedMimeTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: `Tipo de archivo no permitido. Solo se aceptan archivos Excel (.xlsx, .xls).`
      });
    }

    console.log(`[FirebaseController] Analizando estructura de Excel: "${file.originalname}"`);

    // Obtener estructura ultra-ligera
    const analysis = analyzeExcelStructure(file.buffer);

    return res.json({
      success: true,
      filename: file.originalname,
      sheets: analysis.sheets,
      maxExcelRows: analysis.maxExcelRows
    });

  } catch (error) {
    console.error('[FirebaseController Error] Error en análisis estructural de Excel:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'Error al analizar la estructura del archivo Excel.'
    });
  }
}

/**
 * Paso 2: Procesar las celdas de las hojas SELECCIONADAS y buscar órdenes en Firestore.
 * POST /api/firebase/orders
 */
export async function processOrdersFile(req, res) {
  try {
    const file = req.file;
    const selectedSheetsRaw = req.body.selectedSheets;

    // 1. Validar archivo
    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No se ha proporcionado ningún archivo.'
      });
    }

    // 2. Validar hojas seleccionadas
    if (!selectedSheetsRaw) {
      return res.status(400).json({
        success: false,
        error: 'Es obligatorio proporcionar la lista de hojas seleccionadas para procesar.'
      });
    }

    let selectedSheets = [];
    try {
      selectedSheets = JSON.parse(selectedSheetsRaw);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'El campo de hojas seleccionadas (selectedSheets) tiene un formato JSON inválido.'
      });
    }

    if (!Array.isArray(selectedSheets) || selectedSheets.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Debes seleccionar al menos una hoja del Excel para iniciar la búsqueda.'
      });
    }

    console.log(`[FirebaseController] Procesando hojas ${JSON.stringify(selectedSheets)} de: "${file.originalname}"`);

    // 3. Procesar hojas seleccionadas (admite Soft Failures por hoja)
    const excelData = readExcelOrders(file.buffer, selectedSheets);
    
    // 4. Buscar órdenes únicas encontradas en Firestore
    const firestoreMap = await searchOrdersInFirestore(excelData.uniqueOrdersList);

    // 5. Cruzar datos de las hojas exitosas con Firestore
    const results = combineAndFormatResults(excelData.extractedOrders, firestoreMap);

    // 6. Si hubo hojas con Soft Failures (sin columna de órdenes, vacías, etc.), agregar filas virtuales de error para feedback del usuario
    const warnings = [];
    Object.keys(excelData.sheetErrors).forEach(sheetName => {
      const errorMsg = excelData.sheetErrors[sheetName];
      warnings.push({ sheetName, error: errorMsg });

      results.push({
        ORDER_NO: `⚠️ [Hoja: ${sheetName}]`,
        ITEM_ID: 'N/A',
        Encontrado: 'No',
        'Firebase Doc Id': 'N/A',
        'Fecha Compra': 'N/A',
        'Fecha Estimada': 'N/A',
        SKU: 'N/A',
        ProductType: 'N/A',
        FulfillmentType: 'N/A',
        Canal: 'N/A',
        CP: 'N/A',
        Calle: 'N/A',
        createdAt: 'N/A',
        Store: 'N/A',
        Error: 'Sí',
        ErrorMessage: `Error en hoja: ${errorMsg}`,
        _sheetName: sheetName,
        _rowNum: 1,
        _matchedField: 'N/A'
      });
    });

    // 7. Calcular métricas resumidas
    let totalFound = 0;
    let totalNotFound = 0;
    
    results.forEach(row => {
      // Ignorar filas virtuales de error de hoja al contar encontradas/no encontradas
      if (row.ORDER_NO.startsWith('⚠️')) return;

      if (row.Encontrado === 'Sí') {
        totalFound++;
      } else {
        totalNotFound++;
      }
    });

    // Responder con los resultados, métricas y advertencias de hojas fallidas
    return res.json({
      success: true,
      filename: file.originalname,
      summary: {
        totalRowsProcessed: excelData.totalSelectedRows,
        totalOrdersCount: excelData.ordersCount,
        uniqueOrdersCount: excelData.uniqueOrdersCount,
        found: totalFound,
        notFound: totalNotFound,
        warningsCount: warnings.length,
        warnings // Hojas que fallaron de forma suave
      },
      results
    });

  } catch (error) {
    console.error('[FirebaseController Error] Error procesando órdenes de Firebase:', error);
    
    return res.status(error.message.includes('límite') || error.message.includes('seleccionar') ? 400 : 500).json({
      success: false,
      error: error.message || 'Ocurrió un error inesperado al procesar las órdenes.'
    });
  }
}

/**
 * Exportar resultados de búsqueda en Firestore a un archivo CSV.
 * Re-ejecuta la lógica de búsqueda con los mismos parámetros enviados
 * para evitar sobrecargar la memoria con JSON pesado del cliente (Payload Too Large).
 * POST /api/firebase/export-csv
 */
export async function exportCsv(req, res) {
  try {
    const file = req.file;
    const selectedSheetsRaw = req.body.selectedSheets;

    // 1. Validar archivo
    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No se ha proporcionado ningún archivo.'
      });
    }

    // 2. Validar hojas seleccionadas
    if (!selectedSheetsRaw) {
      return res.status(400).json({
        success: false,
        error: 'Es obligatorio proporcionar la lista de hojas seleccionadas para procesar.'
      });
    }

    let selectedSheets = [];
    try {
      selectedSheets = JSON.parse(selectedSheetsRaw);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'El campo de hojas seleccionadas (selectedSheets) tiene un formato JSON inválido.'
      });
    }

    if (!Array.isArray(selectedSheets) || selectedSheets.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Debes seleccionar al menos una hoja del Excel para iniciar la búsqueda.'
      });
    }

    console.log(`[FirebaseController] Generando exportación CSV para archivo "${file.originalname}" y hojas ${JSON.stringify(selectedSheets)}`);

    // 3. Procesar hojas seleccionadas (admite Soft Failures por hoja)
    const excelData = readExcelOrders(file.buffer, selectedSheets);
    
    // 4. Buscar órdenes únicas encontradas en Firestore
    const firestoreMap = await searchOrdersInFirestore(excelData.uniqueOrdersList);

    // 5. Cruzar datos de las hojas exitosas con Firestore
    const results = combineAndFormatResults(excelData.extractedOrders, firestoreMap);

    // 6. Si hubo hojas con Soft Failures, agregar filas virtuales de error para feedback
    Object.keys(excelData.sheetErrors).forEach(sheetName => {
      const errorMsg = excelData.sheetErrors[sheetName];
      results.push({
        ORDER_NO: `⚠️ [Hoja: ${sheetName}]`,
        ITEM_ID: 'N/A',
        Encontrado: 'No',
        'Firebase Doc Id': 'N/A',
        'Fecha Compra': 'N/A',
        'Fecha Estimada': 'N/A',
        SKU: 'N/A',
        ProductType: 'N/A',
        FulfillmentType: 'N/A',
        Canal: 'N/A',
        CP: 'N/A',
        Calle: 'N/A',
        createdAt: 'N/A',
        Store: 'N/A',
        Error: 'Sí',
        ErrorMessage: `Error en hoja: ${errorMsg}`,
        _sheetName: sheetName,
        _rowNum: 1,
        _matchedField: 'N/A'
      });
    });

    console.log(`[FirebaseController] Generando archivo CSV para ${results.length} registros obtenidos.`);

    // Generar la cadena CSV
    const csvString = generateCsvString(results);

    let cleanFilename = 'firebase_search_results';
    if (file && file.originalname) {
      cleanFilename = file.originalname.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
    }
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[-T:]/g, "_");
    const downloadName = `${cleanFilename}_processed_${timestamp}.csv`;

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment(downloadName);
    
    const bom = '\uFEFF';
    return res.send(bom + csvString);

  } catch (error) {
    console.error('[FirebaseController Error] Error exportando resultados de Firebase a CSV:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno al generar el archivo CSV.'
    });
  }
}
