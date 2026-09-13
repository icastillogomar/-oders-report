package utils

import "strings"

// CSVBOM se antepone al contenido: sin él, Excel en Windows rompe los
// acentos del payload (mismo motivo que el BOM en server.js). Se construye
// a partir del code point porque un BOM literal en el fuente es inválido
// fuera del primer byte del archivo.
var CSVBOM = string(rune(0xFEFF))

// BuildCSV arma un CSV a partir de un encabezado y filas ya convertidas a
// texto, aplicando el mismo escapado que el helper `csvValue` de server.js:
// solo se envuelve en comillas cuando la celda trae comas, comillas o saltos
// de línea, y las comillas internas se duplican.
func BuildCSV(header []string, rows [][]string) string {
	var b strings.Builder
	writeCSVRow(&b, header)
	for _, row := range rows {
		b.WriteByte('\n')
		writeCSVRow(&b, row)
	}
	return b.String()
}

func writeCSVRow(b *strings.Builder, cells []string) {
	for i, cell := range cells {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(csvCellValue(cell))
	}
}

func csvCellValue(value string) string {
	escaped := strings.ReplaceAll(value, `"`, `""`)
	if strings.ContainsAny(escaped, `",`+"\n\r") {
		return `"` + escaped + `"`
	}
	return escaped
}
