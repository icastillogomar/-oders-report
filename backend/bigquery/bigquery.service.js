import { BigQuery } from '@google-cloud/bigquery';
import dotenv from 'dotenv';

dotenv.config();

// Inicializamos el cliente de BigQuery por defecto
const defaultBigquery = new BigQuery({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  projectId: process.env.GCP_PROJECT_ID,
});

/**
 * Escapa un string para ser usado de forma segura en un query SQL de BigQuery.
 * @param {string} val - Valor a escapar
 * @returns {string} String escapado
 */
export function escapeSql(val) {
  return String(val)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

/**
 * Construye el Query para la tabla FAC_EDD_ORDERS_HIS (orders)
 */
export function buildOrdersHisQuery(tableId, orders, startDate, endDate) {
  const escapedOrders = orders.map(o => `'${escapeSql(o)}'`).join(', ');

  return `
WITH base AS (
  SELECT
    t.ingestionTimestamp,
    product
  FROM \`${tableId}\` t
  CROSS JOIN UNNEST(
    JSON_EXTRACT_ARRAY(
      JSON_EXTRACT_SCALAR(t.logOrder, '$'),
      '$.products'
    )
  ) AS product
  WHERE DATE(t.ingestionTimestamp) BETWEEN DATE('${startDate}') AND DATE('${endDate}')
),

detalle AS (
  SELECT
    'DETALLE' AS tipo_registro,
    ingestionTimestamp,
    JSON_EXTRACT_SCALAR(product, '$.orderNumber') AS orderNumber,
    JSON_EXTRACT_SCALAR(product, '$.sku') AS sku,
    SAFE_CAST(JSON_EXTRACT_SCALAR(product, '$.quantity') AS INT64) AS quantity,
    JSON_EXTRACT_SCALAR(product, '$.channel') AS channel,
    JSON_EXTRACT_SCALAR(product, '$.company') AS company,
    JSON_EXTRACT_SCALAR(product, '$.createdAt') AS createdAt,
    JSON_EXTRACT_SCALAR(product, '$.purchaseDate') AS purchaseDate,
    JSON_EXTRACT_SCALAR(product, '$.estimatedDeliveryDate') AS estimatedDeliveryDate,
    JSON_EXTRACT_SCALAR(product, '$.edd1') AS edd1,
    JSON_EXTRACT_SCALAR(product, '$.edd2') AS edd2,
    SAFE_CAST(JSON_EXTRACT_SCALAR(product, '$.daysToDelivery') AS INT64) AS daysToDelivery,
    JSON_EXTRACT_SCALAR(product, '$.destinationCity') AS destinationCity,
    JSON_EXTRACT_SCALAR(product, '$.destinationMunicipality') AS destinationMunicipality,
    JSON_EXTRACT_SCALAR(product, '$.destinationStreet') AS destinationStreet,
    JSON_EXTRACT_SCALAR(product, '$.destinationSuburb') AS destinationSuburb,
    JSON_EXTRACT_SCALAR(product, '$.zipCode') AS zipCode,
    JSON_EXTRACT_SCALAR(product, '$.paymentMethod') AS paymentMethod,
    JSON_EXTRACT_SCALAR(product, '$.storeSelected') AS storeSelected,
    JSON_EXTRACT_SCALAR(product, '$.plan') AS plan,
    JSON_EXTRACT_SCALAR(product, '$.ticket') AS ticket,
    JSON_EXTRACT_SCALAR(product, '$.origen') AS origen,
    JSON_EXTRACT_SCALAR(product, '$.offerId') AS offerId,
    SAFE_CAST(JSON_EXTRACT_SCALAR(product, '$.giftRegistryType') AS BOOL) AS giftRegistryType,
    SAFE_CAST(JSON_EXTRACT_SCALAR(product, '$.marketPlace') AS BOOL) AS marketPlace,
    JSON_EXTRACT_SCALAR(product, '$.FulfillmentType') AS FulfillmentType,
    JSON_EXTRACT_SCALAR(product, '$.ProductType') AS ProductType,
    JSON_EXTRACT_SCALAR(product, '$.Error') AS Error,
    JSON_EXTRACT_SCALAR(product, '$.ErrorMessage') AS ErrorMessage
  FROM base
  WHERE JSON_EXTRACT_SCALAR(product, '$.orderNumber') IN UNNEST([${escapedOrders}])
)

SELECT *
FROM detalle
ORDER BY orderNumber, sku
LIMIT 100000
`;
}

/**
 * Construye el Query para la tabla FAC_EDD_RECALCULATE_TRN (recalculate)
 */
export function buildRecalculateQuery(tableId, orders, startDate, endDate) {
  const escapedOrders = orders.map(o => `'${escapeSql(o)}'`).join(', ');

  return `
SELECT
  JSON_VALUE(t.rawPayload, '$.Order.OrderNo') AS OrderNo,
  JSON_VALUE(t.rawPayload, '$.Order.OrderName') AS OrderName,
  JSON_VALUE(t.rawPayload, '$.Order.MessageType') AS MessageType,
  JSON_VALUE(t.rawPayload, '$.Order.EntryType') AS EntryType,
  JSON_VALUE(t.rawPayload, '$.Order.EnterpriseCode') AS EnterpriseCode,
  JSON_VALUE(t.rawPayload, '$.Order.SellerOrganizationCode') AS SellerOrganizationCode,
  JSON_VALUE(t.rawPayload, '$.Order.OrderDate') AS OrderDate,
  JSON_VALUE(t.rawPayload, '$.Order.CustomerEMailID') AS CustomerEMailID,
  JSON_VALUE(orderLine, '$.OrderLineKey') AS OrderLineKey,
  JSON_VALUE(orderLine, '$.PrimeLineNo') AS PrimeLineNo,
  JSON_VALUE(orderLine, '$.SubLineNo') AS SubLineNo,
  JSON_VALUE(orderLine, '$.Item.ItemID') AS ItemID,
  JSON_VALUE(orderLine, '$.Item.ItemDesc') AS ItemDesc,
  JSON_VALUE(orderLine, '$.Item.ProductClass') AS ProductClass,
  JSON_VALUE(orderLine, '$.LineType') AS LineType,
  JSON_VALUE(orderLine, '$.DeliveryMethod') AS DeliveryMethod,
  JSON_VALUE(orderLine, '$.ShipNode') AS ShipNode,
  JSON_VALUE(orderLine, '$.Status') AS Status,
  JSON_VALUE(orderLine, '$.MaxLineStatusDesc') AS MaxLineStatusDesc,
  SAFE_CAST(JSON_VALUE(orderLine, '$.OrderedQty') AS FLOAT64) AS OrderedQty,
  JSON_VALUE(orderLine, '$.PersonInfoShipTo.ZipCode') AS ZipCode,
  JSON_VALUE(orderLine, '$.PersonInfoShipTo.State') AS State,
  JSON_VALUE(orderLine, '$.PersonInfoShipTo.City') AS City,
  JSON_VALUE(orderLine, '$.PersonInfoShipTo.AddressLine1') AS AddressLine1,
  JSON_VALUE(orderLine, '$.PersonInfoShipTo.AddressLine2') AS AddressLine2,
  JSON_VALUE(orderLine, '$.PersonInfoShipTo.AddressLine3') AS AddressLine3,
  JSON_VALUE(orderLine, '$.PersonInfoShipTo.AddressLine4') AS AddressLine4,
  JSON_VALUE(orderLine, '$.PersonInfoShipTo.AddressLine5') AS AddressLine5,
  JSON_VALUE(orderLine, '$.PersonInfoShipTo.AddressLine6') AS AddressLine6,
  JSON_VALUE(orderLine, '$.Extn.ExtnCustomerDeliveryDate') AS ExtnCustomerDeliveryDate,
  JSON_VALUE(orderLine, '$.Extn.ExtnCustomerDeliveryDate2') AS ExtnCustomerDeliveryDate2,
  JSON_VALUE(route, '$.CarrierId') AS CarrierId,
  JSON_VALUE(route, '$.EDD1') AS RouteEDD1,
  JSON_VALUE(route, '$.EDD2') AS RouteEDD2,
  JSON_VALUE(route, '$.Priority') AS Priority,
  JSON_VALUE(route, '$.SelectedRoute') AS SelectedRoute,
  JSON_VALUE(route, '$.IsRecalculated') AS IsRecalculated,
  JSON_VALUE(route, '$.TraceTimes') AS TraceTimes,
  JSON_VALUE(route, '$.Traces') AS Traces
FROM \`${tableId}\` t
CROSS JOIN UNNEST(JSON_QUERY_ARRAY(t.rawPayload, '$.Order.OrderLines.OrderLine')) AS orderLine
LEFT JOIN UNNEST(JSON_QUERY_ARRAY(orderLine, '$.Extn.ExtnRouteList.ExtnRoute')) AS route
WHERE DATE(t._ingested_at) BETWEEN DATE('${startDate}') AND DATE('${endDate}')
  AND JSON_VALUE(t.rawPayload, '$.Order.OrderNo') IN UNNEST([${escapedOrders}])
ORDER BY OrderNo, PrimeLineNo, Priority
LIMIT 100000
`;
}

/**
 * Ejecuta un query SQL en BigQuery
 * @param {string} query - Consulta SQL
 * @param {string} projectId - ID del Proyecto destino
 * @returns {Promise<any[]>} Registros retornados por BigQuery
 */
export async function executeBigQuery(query, projectId) {
  console.log(`[BigQueryService] Ejecutando consulta en proyecto: ${projectId}...`);
  try {
    const [rows] = await defaultBigquery.query({
      query,
      projectId: projectId || process.env.GCP_PROJECT_ID,
      location: process.env.BQ_LOCATION || 'US',
    });
    return rows;
  } catch (error) {
    console.error('[BigQueryService Error] Error al ejecutar consulta:', error);
    throw error;
  }
}
