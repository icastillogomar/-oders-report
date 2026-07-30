/**
 * Convierte un arreglo de objetos JSON que representan los resultados de búsqueda en un string CSV seguro
 * @param {object[]} data - El listado de registros a convertir
 * @returns {string} El contenido CSV generado en formato string
 */
export function generateCsvString(data) {
  if (!data || data.length === 0) {
    return 'ORDER_NO,ITEM_ID,Encontrado,Firebase Doc Id,Fecha Compra,Fecha Estimada,SKU,ProductType,FulfillmentType,Canal,CP,Calle,Store,Error,ErrorMessage\n';
  }

  // Columnas exactas requeridas para el reporte Firebase Search
  const columns = [
    'ORDER_NO',
    'ITEM_ID',
    'Encontrado',
    'Firebase Doc Id',
    'Fecha Compra',
    'Fecha Estimada',
    'SKU',
    'ProductType',
    'FulfillmentType',
    'Canal',
    'CP',
    'Calle',
    'Store',
    'Error',
    'ErrorMessage'
  ];

  // Crear cabecera unida por comas
  const headerLine = columns.join(',') + '\n';

  // Procesar filas de forma segura con escape de caracteres especiales
  const csvRows = data.map((row) => {
    return columns.map((colName) => {
      const val = row[colName];
      if (val === undefined || val === null) return '';

      // Convertir a string
      let strVal = String(val).trim();

      // Escapar comillas dobles internas duplicándolas (estándar RFC 4180)
      strVal = strVal.replace(/"/g, '""');

      // Envolver entre comillas si contiene comas, comillas o saltos de línea
      if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n') || strVal.includes('\r')) {
        return `"${strVal}"`;
      }

      return strVal;
    }).join(',');
  });

  return headerLine + csvRows.join('\n');
}
