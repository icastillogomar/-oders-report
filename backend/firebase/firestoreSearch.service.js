import { getFirestore } from './firebase.service.js';
import { config } from './firebase.config.js';

/**
 * Divide un array en sub-arrays (lotes) de un tamaño específico.
 * @param {Array} array - El array a segmentar
 * @param {number} size - Tamaño de cada lote
 * @returns {Array[]} Array de lotes
 */
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Formatea un valor que puede ser un Timestamp de Firestore, un objeto de fecha o un string
 * @param {any} val - El valor a formatear
 * @returns {string} Fecha formateada YYYY-MM-DD HH:mm:ss o string
 */
function formatDate(val) {
  if (!val) return 'N/A';
  
  // Si es un Timestamp de Firestore
  if (typeof val.toDate === 'function') {
    return val.toDate().toISOString().replace('T', ' ').substring(0, 19);
  }
  
  // Si viene con formato {_seconds, _nanoseconds} (típico de BigQuery JSON o Firestore directo a veces)
  if (val && typeof val._seconds === 'number') {
    return new Date(val._seconds * 1000).toISOString().replace('T', ' ').substring(0, 19);
  }

  // Si es una fecha JS estándar
  if (val instanceof Date) {
    return val.toISOString().replace('T', ' ').substring(0, 19);
  }

  // Si ya es un string o número, retornar limpio
  return String(val);
}

/**
 * Busca de manera segura en un objeto utilizando múltiples llaves posibles (case-insensitive)
 * @param {object} obj - Objeto donde buscar
 * @param {string[]} keys - Arreglo de llaves a buscar
 * @returns {any} El valor de la primera llave que exista y no sea nula/indefinida
 */
function getFirstValue(obj, keys) {
  if (!obj) return 'N/A';
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
    // Búsqueda case-insensitive adicional por robustez
    const lowerKey = key.toLowerCase();
    const foundKey = Object.keys(obj).find(k => k.toLowerCase() === lowerKey);
    if (foundKey && obj[foundKey] !== undefined && obj[foundKey] !== null) {
      return obj[foundKey];
    }
  }
  return 'N/A';
}

/**
 * Realiza búsquedas por lotes y campos múltiples en Firestore.
 * @param {string[]} uniqueOrdersList - Lista de números de orden únicos a buscar
 * @returns {Promise<Map<string, object[]>>} Un mapa donde la llave es el número de orden normalizado y el valor es un arreglo de documentos encontrados en Firestore
 */
export async function searchOrdersInFirestore(uniqueOrdersList) {
  const db = getFirestore();
  const collectionName = config.firestoreCollection;
  const searchFields = config.searchFields;
  const batchSize = config.maxBatchSize;

  // Mapa de resultados: orderNo -> [docData1, docData2, ...]
  const resultMap = new Map();

  if (uniqueOrdersList.length === 0) {
    return resultMap;
  }

  // Dividir las órdenes únicas en lotes de máximo 30 elementos (límite de Firestore 'in')
  const batches = chunkArray(uniqueOrdersList, batchSize);
  console.log(`[FirestoreSearch] Iniciando búsqueda de ${uniqueOrdersList.length} órdenes únicas en ${batches.length} lotes de tamaño ${batchSize}.`);

  // Procesamos los lotes secuencialmente o en paralelo. Dado que son llamadas de red,
  // procesar lotes grandes de forma controlada evita saturar sockets.
  // Usaremos Promise.all para procesar todos los lotes de forma paralela.
  await Promise.all(
    batches.map(async (batch, batchIdx) => {
      // Para cada lote, consultamos en paralelo por cada uno de los campos de búsqueda configurados (OR lógico)
      const fieldPromises = searchFields.map(async (field) => {
        try {
          const snapshot = await db.collection(collectionName)
            .where(field, 'in', batch)
            .get();
          
          return { field, docs: snapshot.docs };
        } catch (error) {
          console.error(`[FirestoreSearch Error] Falló búsqueda en lote ${batchIdx + 1}, campo "${field}":`, error.message);
          return { field, docs: [] };
        }
      });

      const fieldResults = await Promise.all(fieldPromises);

      // Consolidar todos los documentos encontrados en este lote
      for (const { field, docs } of fieldResults) {
        for (const doc of docs) {
          const data = doc.data();
          const docId = doc.id;

          // Encontrar cuál orden de la lista coincide con los datos de este documento.
          // Buscamos el valor en los campos de búsqueda del documento.
          let matchedOrderNo = null;
          for (const f of searchFields) {
            const val = data[f] || (Object.keys(data).find(k => k.toLowerCase() === f.toLowerCase()) ? data[Object.keys(data).find(k => k.toLowerCase() === f.toLowerCase())] : null);
            if (val) {
              const normalizedVal = String(val).trim();
              if (batch.includes(normalizedVal)) {
                matchedOrderNo = normalizedVal;
                break;
              }
              // También limpiar el .0 por si acaso
              const cleanVal = normalizedVal.endsWith('.0') ? normalizedVal.slice(0, -2) : normalizedVal;
              if (batch.includes(cleanVal)) {
                matchedOrderNo = cleanVal;
                break;
              }
            }
          }

          // Si no pudimos determinar la coincidencia exacta por campos, buscamos en todo el lote
          if (!matchedOrderNo) {
            // Recurso de respaldo: buscar si alguna de las órdenes del lote está presente como valor de propiedad en el documento
            const strData = JSON.stringify(data);
            matchedOrderNo = batch.find(order => strData.includes(order)) || null;
          }

          if (matchedOrderNo) {
            // Guardamos el documento con metadatos de Firestore asociados
            const docWithMeta = {
              _docId: docId,
              _matchedField: field,
              ...data
            };

            if (!resultMap.has(matchedOrderNo)) {
              resultMap.set(matchedOrderNo, []);
            }

            // Evitar duplicar el mismo documento exacto si coincide por múltiples campos en el lote
            const exists = resultMap.get(matchedOrderNo).some(d => d._docId === docId);
            if (!exists) {
              resultMap.get(matchedOrderNo).push(docWithMeta);
            }
          }
        }
      }
    })
  );

  return resultMap;
}

/**
 * Combina las órdenes originales del Excel con los resultados de Firestore y mapea las 16 columnas necesarias.
 * @param {object[]} extractedOrders - Órdenes extraídas del Excel por fila
 * @param {Map<string, object[]>} firestoreResults - Mapa de resultados de Firestore
 * @returns {object[]} Resultados listos para mostrar en el frontend o exportar a CSV
 */
export function combineAndFormatResults(extractedOrders, firestoreResults) {
  const formattedResults = [];

  for (const row of extractedOrders) {
    const { orderNo, originalValue, sheetName, rowNum } = row;
    const docs = firestoreResults.get(orderNo);

    if (docs && docs.length > 0) {
      // Si hay documentos (pueden ser múltiples ítems/registros por orden), creamos una fila para cada uno
      for (const doc of docs) {
        // Mapear campos con flexibilidad de nombres
        const itemId = getFirstValue(doc, ['itemId', 'item_id', 'itemId_ext', 'item']);
        const sku = getFirstValue(doc, ['sku', 'skuId', 'sku_id', 'item_id', 'sku_ext']);
        const productType = getFirstValue(doc, ['productType', 'product_type', 'tipoProducto']);
        const fulfillmentType = getFirstValue(doc, ['fulfillmentType', 'fulfillment_type', 'deliveryType', 'plan']);
        const canal = getFirstValue(doc, ['canal', 'channel', 'salesChannel', 'company', 'enterpriseCode']);
        const cp = getFirstValue(doc, ['cp', 'zipCode', 'postalCode', 'zip_code']);
        const calle = getFirstValue(doc, ['calle', 'street', 'address', 'direccion']);
        const store = getFirstValue(doc, ['store', 'storeId', 'tienda', 'storeName', 'store_id']);
        
        // Manejo de fechas
        const fechaCompraRaw = getFirstValue(doc, ['createdAt', 'purchaseDate', 'fechaCompra', 'fecha_compra', 'dateCreated']);
        const fechaCompra = fechaCompraRaw !== 'N/A' ? formatDate(fechaCompraRaw) : 'N/A';

        // Fecha Estimada puede ser edd1/edd2 combinadas, o fechaEstimada
        const edd1 = doc['edd1'] || doc['ExtnPromiseEDD1'] || null;
        const edd2 = doc['edd2'] || doc['ExtnPromiseEDD2'] || null;
        let fechaEstimada = 'N/A';
        if (edd1 && edd2) {
          fechaEstimada = `${formatDate(edd1)} - ${formatDate(edd2)}`;
        } else {
          const singleEdd = getFirstValue(doc, ['fechaEstimada', 'fecha_estimada', 'promiseDate', 'edd', 'promise_date']);
          if (singleEdd !== 'N/A') {
            fechaEstimada = formatDate(singleEdd);
          }
        }

        formattedResults.push({
          ORDER_NO: orderNo,
          ITEM_ID: itemId,
          Encontrado: 'Sí',
          'Firebase Doc Id': doc._docId,
          'Fecha Compra': fechaCompra,
          'Fecha Estimada': fechaEstimada,
          SKU: sku,
          ProductType: productType,
          FulfillmentType: fulfillmentType,
          Canal: canal,
          CP: cp,
          Calle: calle,
          Store: store,
          Error: 'No',
          ErrorMessage: '',
          // Metadatos de auditoría para debug/trazabilidad
          _sheetName: sheetName,
          _rowNum: rowNum,
          _matchedField: doc._matchedField
        });
      }
    } else {
      // Si no se encontró el pedido en Firestore
      formattedResults.push({
        ORDER_NO: orderNo,
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
        Store: 'N/A',
        Error: 'Sí',
        ErrorMessage: 'No encontrado en la colección de Firestore.',
        _sheetName: sheetName,
        _rowNum: rowNum,
        _matchedField: 'N/A'
      });
    }
  }

  return formattedResults;
}
