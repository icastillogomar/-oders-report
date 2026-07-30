import ExcelJS from 'exceljs';

/**
 * Verifica si un valor es nulo, indefinido, vacío o representa un valor nulo.
 */
function isValueEmpty(val) {
  if (val === null || val === undefined) return true;
  const str = String(val).trim();
  return str === '' || str.toLowerCase() === 'null' || str.toLowerCase() === 'none' || str.toLowerCase() === 'nan';
}

/**
 * Normaliza un número de orden (quita .0 y rellena con ceros).
 */
function normalizeOrderNumber(val) {
  if (val === undefined || val === null) return '';
  let str = String(val).trim();
  if (str.endsWith('.0')) {
    str = str.slice(0, -2);
  }
  if (/^\d+$/.test(str) && str.length > 0 && str.length < 10) {
    str = str.padStart(10, '0');
  }
  return str;
}

// Estilos comunes para ExcelJS
const COLORS = {
  titulo: 'FFC9DAF8',     // Azul claro pastel
  header: 'FFD9EAF7',     // Azul muy claro pastel
  verde: 'FFD9EAD3',      // Verde pastel
  rojo: 'FFEAD1D1',       // Rojo pastel
  border: 'FFCCCCCC'      // Gris claro para bordes
};

const BORDER_STYLE = {
  top: { style: 'thin', color: { argb: COLORS.border } },
  left: { style: 'thin', color: { argb: COLORS.border } },
  bottom: { style: 'thin', color: { argb: COLORS.border } },
  right: { style: 'thin', color: { argb: COLORS.border } }
};

const ALIGN_CENTER = { horizontal: 'center', vertical: 'middle' };

/**
 * Aplica estilos de celda comunes
 */
function styleCell(cell, options = {}) {
  if (options.bg) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: options.bg }
    };
  }
  if (options.bold) {
    cell.font = { name: 'Arial', size: 10, bold: true };
  } else {
    cell.font = { name: 'Arial', size: 10 };
  }
  if (options.align) {
    cell.alignment = options.align;
  } else {
    cell.alignment = ALIGN_CENTER;
  }
  cell.border = BORDER_STYLE;
}

/**
 * Genera el archivo Excel para la consulta de Orders (FAC_EDD_ORDERS_HIS)
 * @param {any[]} rows - Filas retornadas por BigQuery
 * @param {string[]} requestedOrders - Lista de órdenes solicitadas originalmente
 * @returns {Promise<Buffer>} Buffer binario del archivo Excel
 */
export async function generateExcelOrders(rows, requestedOrders) {
  const workbook = new ExcelJS.Workbook();
  const wsResumen = workbook.addWorksheet('RESUMEN');
  const wsDetalle = workbook.addWorksheet('DETALLE');

  // Configurar vistas para congelar paneles (freeze panes)
  wsResumen.views = [{ state: 'frozen', ySplit: 6 }];
  wsDetalle.views = [{ state: 'frozen', ySplit: 1 }];

  // Columnas base del detalle según el script
  const columnasBase = [
    'tipo_registro',
    'ingestionTimestamp',
    'orderNumber',
    'sku',
    'quantity',
    'channel',
    'company',
    'createdAt',
    'purchaseDate',
    'estimatedDeliveryDate',
    'edd1',
    'edd2',
    'daysToDelivery',
    'destinationCity',
    'destinationMunicipality',
    'destinationStreet',
    'destinationSuburb',
    'zipCode',
    'paymentMethod',
    'storeSelected',
    'plan',
    'ticket',
    'origen',
    'offerId',
    'giftRegistryType',
    'marketPlace',
    'FulfillmentType',
    'ProductType',
    'Error',
    'ErrorMessage'
  ];

  // 1. Encontrar cuáles órdenes de las solicitadas fueron encontradas en los registros de BigQuery
  const encontradasSet = new Set();
  const foundRows = rows.map(r => {
    const norm = normalizeOrderNumber(r.orderNumber);
    if (norm) encontradasSet.add(norm);
    return { ...r, orderNumber: norm };
  });

  const estatusOrdenes = requestedOrders.map(order => {
    const norm = normalizeOrderNumber(order);
    return {
      ORDEN: norm || order,
      ENCONTRADO: encontradasSet.has(norm) ? 'SI' : 'NO'
    };
  });

  // 2. Construir Detalle de Excel
  // Agregar "ENCONTRADO" = "SI" a las filas encontradas
  const detalleExcel = foundRows.map(r => {
    const newRow = { ENCONTRADO: 'SI' };
    columnasBase.forEach(col => {
      newRow[col] = r[col] !== undefined && r[col] !== null ? String(r[col]) : '';
    });
    return newRow;
  });

  // Agregar filas virtuales de "ENCONTRADO" = "NO" para las que no se encontraron
  estatusOrdenes.forEach(est => {
    if (est.ENCONTRADO === 'NO') {
      const virtualRow = { ENCONTRADO: 'NO', tipo_registro: 'DETALLE' };
      columnasBase.forEach(col => {
        if (col === 'orderNumber') {
          virtualRow[col] = est.ORDEN;
        } else {
          virtualRow[col] = '';
        }
      });
      detalleExcel.push(virtualRow);
    }
  });

  // 3. Procesar datos del resumen agrupado por Canal y Company
  // Filtramos solo registros reales (ENCONTRADO === 'SI')
  const dfEncontrados = foundRows.map(r => {
    const edd1_ok = !isValueEmpty(r.edd1);
    const edd2_ok = !isValueEmpty(r.edd2);
    const con_fecha = edd1_ok && edd2_ok;
    const sin_fecha = !con_fecha;
    const error_ok = !isValueEmpty(r.Error);

    return {
      channel: r.channel || '',
      company: r.company || '',
      orderNumber: r.orderNumber || '',
      edd1_ok,
      edd2_ok,
      con_fecha,
      sin_fecha,
      error_ok,
      Error: r.Error || ''
    };
  });

  // Agrupamiento por channel y company
  const agrupadoMap = new Map();
  dfEncontrados.forEach(item => {
    const key = `${item.channel}||${item.company}`;
    if (!agrupadoMap.has(key)) {
      agrupadoMap.set(key, {
        channel: item.channel,
        company: item.company,
        total: 0,
        totalSinFecha: 0,
        sinFechaSinError: 0,
        sinFechaControlado: 0,
        conFecha: 0,
        errorCodes: new Map()
      });
    }

    const g = agrupadoMap.get(key);
    g.total++;
    if (item.sin_fecha) {
      g.totalSinFecha++;
      if (item.error_ok) {
        g.sinFechaControlado++;
        const err = item.Error;
        g.errorCodes.set(err, (g.errorCodes.get(err) || 0) + 1);
      } else {
        g.sinFechaSinError++;
      }
    } else {
      g.conFecha++;
    }
  });

  const resumenData = Array.from(agrupadoMap.values()).map(g => {
    const errorString = Array.from(g.errorCodes.entries())
      .map(([code, count]) => `${code}: ${count}`)
      .join(' | ');

    return {
      CANAL: g.channel,
      COMPANY: g.company,
      TOTAL: g.total,
      'TOTAL SIN FECHA': g.totalSinFecha,
      'SIN FECHA': g.sinFechaSinError,
      'SIN FECHA CONTROLADO': g.sinFechaControlado,
      'CON FECHA': g.conFecha,
      CODIGO_ERROR: errorString
    };
  });

  // Métricas generales
  const totalSolicitadas = requestedOrders.length;
  const totalEncontradas = estatusOrdenes.filter(e => e.ENCONTRADO === 'SI').length;
  const totalNoEncontradas = totalSolicitadas - totalEncontradas;
  const totalRegistros = dfEncontrados.length;
  const totalConFecha = dfEncontrados.filter(f => f.con_fecha).length;
  const totalSinFecha = dfEncontrados.filter(f => f.sin_fecha).length;
  const totalSinFechaSinError = dfEncontrados.filter(f => f.sin_fecha && !f.error_ok).length;
  const totalSinFechaControlado = dfEncontrados.filter(f => f.sin_fecha && f.error_ok).length;

  // ─── ESCRIBIR HOJA: RESUMEN ───

  // A1:H1 -> Merged title "DECOMM"
  wsResumen.mergeCells('A1:H1');
  const cellA1 = wsResumen.getCell('A1');
  cellA1.value = 'DECOMM';
  styleCell(cellA1, { bg: COLORS.titulo, bold: true });

  // K1:L1 -> Merged title "ESTATUS DE ÓRDENES"
  wsResumen.mergeCells('K1:L1');
  const cellK1 = wsResumen.getCell('K1');
  cellK1.value = 'ESTATUS DE ÓRDENES';
  styleCell(cellK1, { bg: COLORS.titulo, bold: true });

  // Indicadores en fila 3 y 4
  const indicadores = [
    { label: 'TOTAL SOLICITADAS', val: totalSolicitadas },
    { label: 'ENCONTRADAS', val: totalEncontradas },
    { label: 'NO ENCONTRADAS', val: totalNoEncontradas },
    { label: 'REGISTROS ENCONTRADOS', val: totalRegistros },
    { label: 'CON FECHA', val: totalConFecha },
    { label: 'SIN FECHA TOTAL', val: totalSinFecha },
    { label: 'SIN FECHA SIN ERROR', val: totalSinFechaSinError },
    { label: 'SIN FECHA CONTROLADO', val: totalSinFechaControlado }
  ];

  indicadores.forEach((ind, idx) => {
    const colName = String.fromCharCode(65 + idx); // A, B, C, ...
    const lblCell = wsResumen.getCell(`${colName}3`);
    lblCell.value = ind.label;
    styleCell(lblCell, { bg: COLORS.header, bold: true });

    const valCell = wsResumen.getCell(`${colName}4`);
    valCell.value = ind.val;
    styleCell(valCell);
  });

  // Headers de la tabla Resumen agrupado en fila 6 (columnas A a H)
  const headersResumen = [
    'CANAL', 'COMPANY', 'TOTAL', 'TOTAL SIN FECHA', 'SIN FECHA', 'SIN FECHA CONTROLADO', 'CON FECHA', 'CODIGO_ERROR'
  ];
  headersResumen.forEach((h, idx) => {
    const colName = String.fromCharCode(65 + idx);
    const cell = wsResumen.getCell(`${colName}6`);
    cell.value = h;
    styleCell(cell, { bg: COLORS.header, bold: true });
  });

  // Datos de la tabla Resumen
  resumenData.forEach((row, rIdx) => {
    const excelRowIdx = rIdx + 7;
    headersResumen.forEach((colName, cIdx) => {
      const colLetter = String.fromCharCode(65 + cIdx);
      const cell = wsResumen.getCell(`${colLetter}${excelRowIdx}`);
      cell.value = row[colName];

      let bg = null;
      if (colName === 'TOTAL SIN FECHA' || colName === 'SIN FECHA') {
        bg = COLORS.rojo;
      } else if (colName === 'SIN FECHA CONTROLADO' || colName === 'CON FECHA') {
        bg = COLORS.verde;
      }
      styleCell(cell, { bg });
    });
  });

  // Headers de la tabla de estatus en fila 6 (columnas K y L)
  const headerK6 = wsResumen.getCell('K6');
  headerK6.value = 'ORDEN';
  styleCell(headerK6, { bg: COLORS.header, bold: true });

  const headerL6 = wsResumen.getCell('L6');
  headerL6.value = 'ENCONTRADO';
  styleCell(headerL6, { bg: COLORS.header, bold: true });

  // Datos de la tabla de estatus
  estatusOrdenes.forEach((row, rIdx) => {
    const excelRowIdx = rIdx + 7;
    
    const cellK = wsResumen.getCell(`K${excelRowIdx}`);
    cellK.value = row.ORDEN;
    styleCell(cellK);

    const cellL = wsResumen.getCell(`L${excelRowIdx}`);
    cellL.value = row.ENCONTRADO;
    styleCell(cellL, { bg: row.ENCONTRADO === 'SI' ? COLORS.verde : COLORS.rojo });
  });

  // Configurar anchos de columna en RESUMEN
  wsResumen.getColumn('A').width = 18;
  wsResumen.getColumn('B').width = 14;
  wsResumen.getColumn('C').width = 22;
  wsResumen.getColumn('D').width = 22;
  wsResumen.getColumn('E').width = 22;
  wsResumen.getColumn('F').width = 22;
  wsResumen.getColumn('G').width = 22;
  wsResumen.getColumn('H').width = 22;
  wsResumen.getColumn('K').width = 22;
  wsResumen.getColumn('L').width = 16;


  // ─── ESCRIBIR HOJA: DETALLE ───

  // Headers del Detalle
  const headersDetalle = ['ENCONTRADO', ...columnasBase];
  headersDetalle.forEach((h, idx) => {
    const cell = wsDetalle.getCell(1, idx + 1);
    cell.value = h;
    styleCell(cell, { bg: COLORS.header, bold: true });
  });

  // Datos del Detalle
  detalleExcel.forEach((row, rIdx) => {
    const rowNum = rIdx + 2;
    headersDetalle.forEach((colName, cIdx) => {
      const cell = wsDetalle.getCell(rowNum, cIdx + 1);
      cell.value = row[colName];

      let bg = null;
      if (colName === 'ENCONTRADO') {
        bg = row.ENCONTRADO === 'SI' ? COLORS.verde : COLORS.rojo;
      }
      styleCell(cell, { bg });
    });
  });

  // Configurar autofiltro y anchos de columna en DETALLE
  wsDetalle.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: detalleExcel.length + 1, column: headersDetalle.length }
  };

  for (let cIdx = 1; cIdx <= headersDetalle.length; cIdx++) {
    wsDetalle.getColumn(cIdx).width = 18;
  }

  // Generar y retornar el Buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

/**
 * Genera el archivo Excel para la consulta de Recalculate (FAC_EDD_RECALCULATE_TRN)
 * @param {any[]} rows - Filas retornadas por BigQuery
 * @param {string[]} requestedOrders - Lista de órdenes solicitadas originalmente
 * @returns {Promise<Buffer>} Buffer binario del archivo Excel
 */
export async function generateExcelRecalculate(rows, requestedOrders) {
  const workbook = new ExcelJS.Workbook();
  const wsResumen = workbook.addWorksheet('RESUMEN');
  const wsDetalle = workbook.addWorksheet('DETALLE');

  // Configurar vistas para congelar paneles (freeze panes)
  wsResumen.views = [{ state: 'frozen', ySplit: 6 }];
  wsDetalle.views = [{ state: 'frozen', ySplit: 1 }];

  // Columnas base para recalculate
  const columnasBase = [
    'OrderNo',
    'OrderName',
    'MessageType',
    'EntryType',
    'EnterpriseCode',
    'SellerOrganizationCode',
    'OrderDate',
    'CustomerEMailID',
    'OrderLineKey',
    'PrimeLineNo',
    'SubLineNo',
    'ItemID',
    'ItemDesc',
    'ProductClass',
    'LineType',
    'DeliveryMethod',
    'ShipNode',
    'Status',
    'MaxLineStatusDesc',
    'OrderedQty',
    'ZipCode',
    'State',
    'City',
    'AddressLine1',
    'AddressLine2',
    'AddressLine3',
    'AddressLine4',
    'AddressLine5',
    'AddressLine6',
    'ExtnCustomerDeliveryDate',
    'ExtnCustomerDeliveryDate2',
    'CarrierId',
    'RouteEDD1',
    'RouteEDD2',
    'Priority',
    'SelectedRoute',
    'IsRecalculated',
    'TraceTimes',
    'Traces'
  ];

  // 1. Encontrar cuáles órdenes de las solicitadas fueron encontradas en los registros de BigQuery
  const encontradasSet = new Set();
  const foundRows = rows.map(r => {
    const norm = normalizeOrderNumber(r.OrderNo);
    if (norm) encontradasSet.add(norm);
    return { ...r, OrderNo: norm };
  });

  const estatusOrdenes = requestedOrders.map(order => {
    const norm = normalizeOrderNumber(order);
    return {
      ORDEN: norm || order,
      ENCONTRADO: encontradasSet.has(norm) ? 'SI' : 'NO'
    };
  });

  // 2. Construir Detalle de Excel
  // Agregar "ENCONTRADO" = "SI" a las filas encontradas
  const detalleExcel = foundRows.map(r => {
    const newRow = { ENCONTRADO: 'SI' };
    columnasBase.forEach(col => {
      newRow[col] = r[col] !== undefined && r[col] !== null ? String(r[col]) : '';
    });
    return newRow;
  });

  // Agregar filas virtuales de "ENCONTRADO" = "NO" para las que no se encontraron
  estatusOrdenes.forEach(est => {
    if (est.ENCONTRADO === 'NO') {
      const virtualRow = { ENCONTRADO: 'NO' };
      columnasBase.forEach(col => {
        if (col === 'OrderNo') {
          virtualRow[col] = est.ORDEN;
        } else {
          virtualRow[col] = '';
        }
      });
      detalleExcel.push(virtualRow);
    }
  });

  // Métricas generales
  const totalSolicitadas = requestedOrders.length;
  const totalEncontradas = estatusOrdenes.filter(e => e.ENCONTRADO === 'SI').length;
  const totalNoEncontradas = totalSolicitadas - totalEncontradas;
  const totalRegistros = detalleExcel.filter(r => r.ENCONTRADO === 'SI').length;

  // ─── ESCRIBIR HOJA: RESUMEN ───

  // A1:D1 -> Merged title "RESUMEN DE BÚSQUEDA"
  wsResumen.mergeCells('A1:D1');
  const cellA1 = wsResumen.getCell('A1');
  cellA1.value = 'RESUMEN DE BÚSQUEDA';
  styleCell(cellA1, { bg: COLORS.titulo, bold: true });

  // Indicadores en fila 3 y 4
  const indicadores = [
    { label: 'TOTAL SOLICITADAS', val: totalSolicitadas },
    { label: 'ENCONTRADAS', val: totalEncontradas },
    { label: 'NO ENCONTRADAS', val: totalNoEncontradas },
    { label: 'REGISTROS ENCONTRADOS', val: totalRegistros }
  ];

  indicadores.forEach((ind, idx) => {
    const colName = String.fromCharCode(65 + idx); // A, B, C, ...
    const lblCell = wsResumen.getCell(`${colName}3`);
    lblCell.value = ind.label;
    styleCell(lblCell, { bg: COLORS.header, bold: true });

    const valCell = wsResumen.getCell(`${colName}4`);
    valCell.value = ind.val;
    styleCell(valCell);
  });

  // Headers de la tabla de estatus en fila 6 (columnas A y B)
  const headerA6 = wsResumen.getCell('A6');
  headerA6.value = 'ORDEN';
  styleCell(headerA6, { bg: COLORS.header, bold: true });

  const headerB6 = wsResumen.getCell('B6');
  headerB6.value = 'ENCONTRADO';
  styleCell(headerB6, { bg: COLORS.header, bold: true });

  // Datos de la tabla de estatus
  estatusOrdenes.forEach((row, rIdx) => {
    const excelRowIdx = rIdx + 7;
    
    const cellA = wsResumen.getCell(`A${excelRowIdx}`);
    cellA.value = row.ORDEN;
    styleCell(cellA);

    const cellB = wsResumen.getCell(`B${excelRowIdx}`);
    cellB.value = row.ENCONTRADO;
    styleCell(cellB, { bg: row.ENCONTRADO === 'SI' ? COLORS.verde : COLORS.rojo });
  });

  // Configurar anchos de columna en RESUMEN
  wsResumen.getColumn('A').width = 22;
  wsResumen.getColumn('B').width = 16;
  wsResumen.getColumn('C').width = 22;
  wsResumen.getColumn('D').width = 22;


  // ─── ESCRIBIR HOJA: DETALLE ───

  // Headers del Detalle
  const headersDetalle = ['ENCONTRADO', ...columnasBase];
  headersDetalle.forEach((h, idx) => {
    const cell = wsDetalle.getCell(1, idx + 1);
    cell.value = h;
    styleCell(cell, { bg: COLORS.header, bold: true });
  });

  // Datos del Detalle
  detalleExcel.forEach((row, rIdx) => {
    const rowNum = rIdx + 2;
    headersDetalle.forEach((colName, cIdx) => {
      const cell = wsDetalle.getCell(rowNum, cIdx + 1);
      cell.value = row[colName];

      let bg = null;
      if (colName === 'ENCONTRADO') {
        bg = row.ENCONTRADO === 'SI' ? COLORS.verde : COLORS.rojo;
      }
      styleCell(cell, { bg });
    });
  });

  // Configurar autofiltro y anchos de columna en DETALLE
  wsDetalle.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: detalleExcel.length + 1, column: headersDetalle.length }
  };

  for (let cIdx = 1; cIdx <= headersDetalle.length; cIdx++) {
    wsDetalle.getColumn(cIdx).width = 18;
  }

  // Generar y retornar el Buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}
