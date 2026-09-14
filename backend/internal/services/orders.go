package services

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"

	"edd-panel-backend/internal/model"
	"edd-panel-backend/internal/repository"
)

var ErrInvalidDateFormat = errors.New("formato de fecha inválido")

// ErrInvalidOrderNumber señala un orderNumber que no cumple el formato
// esperado, para que el transport la responda como 400 en vez de 500.
var ErrInvalidOrderNumber = errors.New("el número de orden debe tener entre 6 y 20 dígitos")

// Sentinels del export CSV de órdenes: distinguen errores de validación
// (400), ausencia de resultados (404) y fallas de BigQuery (500).
var (
	ErrMissingCSVParams       = errors.New("faltan parámetros requeridos (start, end, company, type)")
	ErrInvalidFulfillmentType = errors.New("fulfillmentType inválido")
	ErrInvalidMarketPlace     = errors.New("marketPlace inválido (true|false)")
	ErrInvalidCSVType         = errors.New("tipo inválido (summary, decomm, recalc)")
	ErrNoCSVRows              = errors.New("no se encontraron registros de error o plan b para este rango")
)

// Sentinels del cotejo masivo de órdenes.
var (
	ErrBulkEmptyBody     = errors.New("envía un arreglo orderNumbers con al menos un elemento")
	ErrBulkInvalidBody   = errors.New("cuerpo JSON inválido")
	ErrBulkNoValidIDs    = errors.New("ningún identificador del lote es válido (6 a 64 caracteres alfanuméricos)")
	ErrBulkBatchTooLarge = fmt.Errorf("el lote excede el máximo de %d órdenes. Divide la petición.", BulkMaxBatch)
)

// BulkMaxBatch es el máximo de órdenes por petición de cotejo masivo.
const BulkMaxBatch = 500

// orderIDRegex acepta cualquier identificador alfanumérico: las remisiones
// no son numéricas (conviven `sg2608090011688`, `KS0000438222` y UUIDs).
var orderIDRegex = regexp.MustCompile(`^[A-Za-z0-9._-]{6,64}$`)

// bareIDRegex solo aplica a IDs tipo `sg2608090011688` o `KS0000438222`:
// prefijo de letras seguido únicamente de dígitos. Un UUID no genera
// variante.
var bareIDRegex = regexp.MustCompile(`^[A-Za-z]+(\d{6,})$`)

// bareID regresa, como red de seguridad, la variante sin prefijo de letras
// de un identificador (sg2608090011688 -> 2608090011688), por si la tabla
// la guarda sin él.
func bareID(id string) (string, bool) {
	m := bareIDRegex.FindStringSubmatch(id)
	if m == nil {
		return "", false
	}
	return m[1], true
}

type OrdersService struct {
	order repository.OrdersRepository
}

func NewOrdersService(o repository.OrdersRepository) *OrdersService {
	return &OrdersService{
		order: o, // Assuming you have a function to create a new Orders repository
	}
}

func (o *OrdersService) GetOrdersSummary(
	productType, fulfillmentType, isMarketplace string,
	company, startDate, endDate string,
) ([]*model.OrdersSummary, error) {

	if company == "" || startDate == "" || endDate == "" {
		return nil, fmt.Errorf("company, startDate, and endDate parameters are required")
	}

	return o.order.GetOrdersSummary(
		context.Background(),
		productType,
		fulfillmentType,
		isMarketplace,
		company,
		startDate,
		endDate,
	)
}

func (o *OrdersService) RecalculateOrders(
	startDate, endDate, company string,
) ([]*model.OrdersSummary, error) {
	if company == "" || startDate == "" || endDate == "" {
		return nil, fmt.Errorf("company, startDate, and endDate parameters are required")
	}
	return o.order.RecalculateOrders(
		context.Background(),
		startDate,
		endDate,
		company,
	)
}

func (o *OrdersService) GetDeliveryTypes(
	company, productType, startDate, endDate string,
) (*model.DeliveryTypesResult, error) {
	var dateOnlyRegex = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

	if startDate == "" {
		startDate = "2026-07-31"
	}
	if endDate == "" {
		endDate = "2026-08-01"
	}
	if company == "" {
		company = "LP"
	}

	if !dateOnlyRegex.MatchString(startDate) || !dateOnlyRegex.MatchString(endDate) {
		return nil, ErrInvalidDateFormat
	}

	return o.order.GetDeliveryTypes(
		context.Background(),
		company,
		productType,
		startDate,
		endDate,
	)
}

// GetErrorCodes valida los filtros y regresa el desglose por errorCode de
// los registros clasificados como Error en el rango.
func (o *OrdersService) GetErrorCodes(
	company, productType, fulfillmentType, startDate, endDate string,
) (*model.ErrorCodesResult, error) {
	var dateOnlyRegex = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

	if startDate == "" {
		startDate = "2026-05-01"
	}
	if endDate == "" {
		endDate = "2026-05-28"
	}
	if company == "" {
		company = "SB"
	}

	if !dateOnlyRegex.MatchString(startDate) || !dateOnlyRegex.MatchString(endDate) {
		return nil, ErrInvalidDateFormat
	}

	if fulfillmentType != "" && !slices.Contains(repository.FulfillmentTypes, fulfillmentType) {
		return nil, ErrInvalidFulfillmentType
	}

	return o.order.GetErrorCodes(
		context.Background(),
		company,
		productType,
		fulfillmentType,
		startDate,
		endDate,
	)
}

func (o *OrdersService) SearchOrder(orderNumber string) ([]*model.OrderSearchLine, error) {
	var orderNumberRegex = regexp.MustCompile(`^\d{6,20}$`)

	if !orderNumberRegex.MatchString(orderNumber) {
		return nil, ErrInvalidOrderNumber
	}

	return o.order.SearchOrder(context.Background(), orderNumber)
}

// ExportOrdersCSV valida los filtros del export y, si todo es correcto,
// regresa un cursor sobre TODAS las filas encontradas (sin truncar) más el
// nombre de archivo sugerido, para que el transport las transmita al
// cliente a medida que llegan de BigQuery en vez de esperar a tenerlas
// todas en memoria. Recibe el context del request para poder cancelar la
// lectura si el cliente corta la descarga a medias.
func (o *OrdersService) ExportOrdersCSV(
	ctx context.Context,
	start, end, company, csvType, productType, fulfillmentType, marketPlace string,
) (stream *repository.OrdersCSVStream, filename string, err error) {
	if start == "" || end == "" || company == "" || csvType == "" {
		return nil, "", ErrMissingCSVParams
	}

	if fulfillmentType != "" && !slices.Contains(repository.FulfillmentTypes, fulfillmentType) {
		return nil, "", ErrInvalidFulfillmentType
	}

	if marketPlace != "" && marketPlace != "true" && marketPlace != "false" {
		return nil, "", ErrInvalidMarketPlace
	}

	var t repository.OrdersCSVType
	switch csvType {
	case string(repository.OrdersCSVTypeSummary), string(repository.OrdersCSVTypeDecomm), string(repository.OrdersCSVTypeRecalc):
		t = repository.OrdersCSVType(csvType)
	default:
		return nil, "", ErrInvalidCSVType
	}

	stream, err = o.order.GetOrdersCSV(ctx, repository.OrdersCSVParams{
		Start:           start,
		End:             end,
		Company:         company,
		Type:            t,
		ProductType:     productType,
		FulfillmentType: fulfillmentType,
		MarketPlace:     marketPlace,
	})
	if err != nil {
		return nil, "", err
	}

	if stream.Empty() {
		return nil, "", ErrNoCSVRows
	}

	filename = fmt.Sprintf("reporte_%s_%s_%s_%s.csv", company, csvType, start, end)
	return stream, filename, nil
}

// BulkCheckOrders valida y depura el lote de órdenes recibido, busca sus
// líneas en BigQuery (incluyendo la variante "sin prefijo" de cada ID como
// red de seguridad) y regresa, para cada orden solicitada, su veredicto más
// un resumen agregado del lote.
func (o *OrdersService) BulkCheckOrders(ctx context.Context, raw []string) (*model.BulkCheckResult, error) {
	if len(raw) == 0 {
		return nil, ErrBulkEmptyBody
	}

	seen := make(map[string]struct{}, len(raw))
	orderNumbers := make([]string, 0, len(raw))
	for _, n := range raw {
		id := strings.TrimSpace(n)
		if !orderIDRegex.MatchString(id) {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		orderNumbers = append(orderNumbers, id)
	}

	invalidCount := len(raw) - len(orderNumbers)

	if len(orderNumbers) == 0 {
		return nil, ErrBulkNoValidIDs
	}
	if len(orderNumbers) > BulkMaxBatch {
		return nil, ErrBulkBatchTooLarge
	}

	// Mapa variante -> id original solicitado, para regresar los resultados
	// con el mismo identificador que mandó el usuario.
	lookup := make(map[string]string, len(orderNumbers)*2)
	variantsSeen := make(map[string]struct{}, len(orderNumbers)*2)
	variants := make([]string, 0, len(orderNumbers)*2)
	addVariant := func(v string) {
		if _, ok := variantsSeen[v]; ok {
			return
		}
		variantsSeen[v] = struct{}{}
		variants = append(variants, v)
	}
	for _, id := range orderNumbers {
		addVariant(id)
		lookup[id] = id
		if bare, ok := bareID(id); ok {
			if _, exists := lookup[bare]; !exists {
				addVariant(bare)
				lookup[bare] = id
			}
		}
	}

	rows, err := o.order.BulkCheckOrders(ctx, variants)
	if err != nil {
		return nil, err
	}

	byOrder := make(map[string]*model.BulkCheckOrder, len(orderNumbers))
	for _, num := range orderNumbers {
		byOrder[num] = &model.BulkCheckOrder{
			OrderNumber: num,
			ErrorCodes:  []string{},
			Plans:       []string{},
			Detail:      []*model.BulkCheckDetailLine{},
		}
	}

	errorCodeCounts := map[string]int{}
	var totalLines int

	for _, line := range rows {
		totalLines++

		code := ""
		if line.ErrorCode != nil {
			code = strings.TrimSpace(*line.ErrorCode)
		}
		flagged := line.HasError != nil && *line.HasError == "true"
		if code != "" || flagged {
			key := code
			if key == "" {
				key = "SIN_CODIGO"
			}
			errorCodeCounts[key]++
		}

		requested, matched := lookup[line.OrderNumber]
		if !matched {
			continue
		}
		entry := byOrder[requested]
		entry.Found = true
		if entry.MatchedAs == nil {
			matchedAs := line.OrderNumber
			entry.MatchedAs = &matchedAs
		}
		entry.Lines++
		if entry.Company == nil {
			entry.Company = line.Company
		}
		if entry.Channel == nil {
			entry.Channel = line.Channel
		}
		if entry.CreatedAt == nil {
			entry.CreatedAt = line.CreatedAt
		}
		if line.Plan != nil && !slices.Contains(entry.Plans, *line.Plan) {
			entry.Plans = append(entry.Plans, *line.Plan)
		}
		if code != "" || flagged {
			entry.LinesWithError++
			if code != "" && !slices.Contains(entry.ErrorCodes, code) {
				entry.ErrorCodes = append(entry.ErrorCodes, code)
			}
		}
		entry.Detail = append(entry.Detail, line)
	}

	orders := make([]*model.BulkCheckOrder, 0, len(orderNumbers))
	var foundCount, errorOrdersCount, matchedWithoutPrefixCount, linesWithErrorTotal int
	for _, num := range orderNumbers {
		entry := byOrder[num]
		entry.HasError = entry.LinesWithError > 0
		linesWithErrorTotal += entry.LinesWithError
		if entry.Found {
			foundCount++
			if entry.HasError {
				errorOrdersCount++
			}
			if entry.MatchedAs != nil && *entry.MatchedAs != entry.OrderNumber {
				matchedWithoutPrefixCount++
			}
		}
		orders = append(orders, entry)
	}

	return &model.BulkCheckResult{
		Orders: orders,
		Summary: model.BulkCheckSummary{
			Requested:            len(orderNumbers),
			Invalid:              invalidCount,
			Found:                foundCount,
			NotFound:             len(orderNumbers) - foundCount,
			OrdersWithError:      errorOrdersCount,
			MatchedWithoutPrefix: matchedWithoutPrefixCount,
			TotalLines:           totalLines,
			LinesWithError:       linesWithErrorTotal,
			ErrorCodeCounts:      errorCodeCounts,
		},
	}, nil
}
