import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Colección de Firestore donde están guardados los pedidos
  firestoreCollection: process.env.FIRESTORE_COLLECTION || 'tickets',

  // Campos por los cuales se buscará el número de pedido en Firestore (OR de consulta)
  searchFields: [
    'noPedido',
    'orderNo',
    'ov',
    'ovNo',
    'noOrden',
    'no_orden',
    'ORDER_NO'
  ],

  // Tamaño máximo de archivo permitido (10MB)
  maxFileSize: 10 * 1024 * 1024, // 10MB en bytes

  // Tamaño de lote máximo para el operador 'in' de Firestore (límite físico es 30)
  maxBatchSize: 30,

  // Límite máximo de filas totales entre todas las hojas para evitar abuso de recursos y lecturas en Firestore (configurable vía ENV)
  maxExcelRows: Number(process.env.MAX_EXCEL_ROWS) || 10000,

  // Tipos MIME permitidos para la carga de Excel
  allowedMimeTypes: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel' // .xls
  ]
};
