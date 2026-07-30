import { readExcelOrders, analyzeExcelStructure } from '../firebase/excelReader.service.js';
import { 
  buildOrdersHisQuery, 
  buildRecalculateQuery, 
  executeBigQuery 
} from './bigquery.service.js';
import { 
  generateExcelOrders, 
  generateExcelRecalculate 
} from './excelWriter.service.js';
import { config as firebaseConfig } from '../firebase/firebase.config.js';

/**
 * Paso 1: Analizar la estructura básica del archivo Excel.
 * Reutiliza la función de análisis de excelReader.service.js
 * POST /api/bigquery/analyze
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

    if (!firebaseConfig.allowedMimeTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: `Tipo de archivo no permitido. Solo se aceptan archivos Excel (.xlsx, .xls).`
      });
    }

    console.log(`[BigQueryController] Analizando estructura de Excel: "${file.originalname}"`);

    const analysis = analyzeExcelStructure(file.buffer);

    return res.json({
      success: true,
      filename: file.originalname,
      sheets: analysis.sheets,
      maxExcelRows: analysis.maxExcelRows
    });

  } catch (error) {
    console.error('[BigQueryController Error] Error en análisis estructural de Excel:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'Error al analizar la estructura del archivo Excel.'
    });
  }
}

/**
 * Paso 2: Procesar hojas de Excel y buscar órdenes en BigQuery.
 * POST /api/bigquery/search
 */
export async function processBigQuerySearch(req, res) {
  try {
    const file = req.file;
    const { 
      selectedSheets: selectedSheetsRaw, 
      tableType, 
      projectId: reqProjectId, 
      dataset: reqDataset, 
      startDate, 
      endDate 
    } = req.body;

    // 1. Validaciones básicas de entrada
    if (!file) {
      return res.status(400).json({ success: false, error: 'No se ha proporcionado ningún archivo.' });
    }
    if (!selectedSheetsRaw) {
      return res.status(400).json({ success: false, error: 'Es obligatorio proporcionar la lista de hojas seleccionadas para procesar.' });
    }
    if (!tableType || !['orders', 'recalculate'].includes(tableType)) {
      return res.status(400).json({ success: false, error: 'Tipo de tabla inválido. Debe ser "orders" o "recalculate".' });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: 'Es obligatorio especificar la fecha inicio y fecha fin.' });
    }

    // Configuración por defecto si no se especifican los campos de GCP
    const projectId = reqProjectId || 'crp-pro-dig-edd';
    const dataset = reqDataset || 'mus_pro_digital_prd_tbls';

    let selectedSheets = [];
    try {
      selectedSheets = JSON.parse(selectedSheetsRaw);
    } catch (e) {
      return res.status(400).json({ success: false, error: 'El campo de hojas seleccionadas (selectedSheets) tiene un formato JSON inválido.' });
    }

    if (!Array.isArray(selectedSheets) || selectedSheets.length === 0) {
      return res.status(400).json({ success: false, error: 'Debes seleccionar al menos una hoja del Excel para iniciar la búsqueda.' });
    }

    console.log(`[BigQueryController] Procesando BigQuery Search para tabla "${tableType}" en ${projectId}.${dataset} (${startDate} -> ${endDate})`);

    // 2. Procesar hojas de Excel para extraer números de orden normalizados
    const excelData = readExcelOrders(file.buffer, selectedSheets);
    
    if (excelData.uniqueOrdersCount === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se encontraron números de orden válidos en las hojas de Excel seleccionadas.'
      });
    }

    // 3. Construir la consulta de BigQuery según el tipo de tabla
    let query = '';
    let tableId = '';
    if (tableType === 'orders') {
      tableId = `${projectId}.${dataset}.FAC_EDD_ORDERS_HIS`;
      query = buildOrdersHisQuery(tableId, excelData.uniqueOrdersList, startDate, endDate);
    } else {
      tableId = `${projectId}.${dataset}.FAC_EDD_RECALCULATE_TRN`;
      query = buildRecalculateQuery(tableId, excelData.uniqueOrdersList, startDate, endDate);
    }

    // 4. Ejecutar la consulta en BigQuery
    const queryRows = await executeBigQuery(query, projectId);
    console.log(`[BigQueryController] Consulta finalizada. Registros devueltos: ${queryRows.length}`);

    // 5. Calcular métricas resumidas
    const encontradasSet = new Set();
    queryRows.forEach(row => {
      const orderNum = tableType === 'orders' ? row.orderNumber : row.OrderNo;
      if (orderNum) {
        encontradasSet.add(String(orderNum).trim());
      }
    });

    const totalFound = excelData.uniqueOrdersList.filter(order => encontradasSet.has(order)).length;
    const totalNotFound = excelData.uniqueOrdersList.length - totalFound;

    // Responder con los resultados y métricas
    return res.json({
      success: true,
      filename: file.originalname,
      tableType,
      projectId,
      dataset,
      dateRange: { startDate, endDate },
      summary: {
        totalRowsProcessed: excelData.totalSelectedRows,
        totalOrdersCount: excelData.ordersCount,
        uniqueOrdersCount: excelData.uniqueOrdersCount,
        found: totalFound,
        notFound: totalNotFound,
        warningsCount: Object.keys(excelData.sheetErrors).length,
        warnings: Object.keys(excelData.sheetErrors).map(sheetName => ({
          sheetName,
          error: excelData.sheetErrors[sheetName]
        }))
      },
      requestedOrders: excelData.uniqueOrdersList,
      results: queryRows
    });

  } catch (error) {
    console.error('[BigQueryController Error] Error procesando búsqueda de BigQuery:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Ocurrió un error inesperado al procesar la búsqueda en BigQuery.'
    });
  }
}

/**
 * Paso 3: Exportar resultados JSON a archivo Excel formateado
 * POST /api/bigquery/export-excel
 */
export async function exportExcel(req, res) {
  try {
    const { results, requestedOrders, tableType, filename } = req.body;

    if (!results || !Array.isArray(results)) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere un listado de resultados (results) en formato de arreglo para generar el Excel.'
      });
    }
    if (!requestedOrders || !Array.isArray(requestedOrders)) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere el listado de órdenes solicitadas originalmente (requestedOrders).'
      });
    }
    if (!tableType || !['orders', 'recalculate'].includes(tableType)) {
      return res.status(400).json({
        success: false,
        error: 'Tipo de tabla inválido. Debe ser "orders" o "recalculate".'
      });
    }

    console.log(`[BigQueryController] Generando exportación Excel para tabla "${tableType}" con ${results.length} registros devueltos.`);

    let excelBuffer;
    if (tableType === 'orders') {
      excelBuffer = await generateExcelOrders(results, requestedOrders);
    } else {
      excelBuffer = await generateExcelRecalculate(results, requestedOrders);
    }

    let cleanFilename = 'bigquery_search_results';
    if (filename) {
      cleanFilename = filename.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
    }
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[-T:]/g, "_");
    const downloadName = `${cleanFilename}_bq_${tableType}_${timestamp}.xlsx`;

    res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.attachment(downloadName);
    
    return res.send(excelBuffer);

  } catch (error) {
    console.error('[BigQueryController Error] Error exportando resultados a Excel:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno al generar el archivo Excel.'
    });
  }
}
