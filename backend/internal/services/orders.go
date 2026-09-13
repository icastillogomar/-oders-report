package services

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"slices"

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

func (o *OrdersService) SearchOrder(orderNumber string) ([]*model.OrderSearchLine, error) {
	var orderNumberRegex = regexp.MustCompile(`^\d{6,20}$`)

	if !orderNumberRegex.MatchString(orderNumber) {
		return nil, ErrInvalidOrderNumber
	}

	return o.order.SearchOrder(context.Background(), orderNumber)
}

// ExportOrdersCSV valida los filtros del export y, si todo es correcto,
// regresa el encabezado y TODAS las filas encontradas (sin truncar) más el
// nombre de archivo sugerido, listos para que el transport arme el CSV.
func (o *OrdersService) ExportOrdersCSV(
	start, end, company, csvType, productType, fulfillmentType, marketPlace string,
) (header []string, rows [][]string, filename string, err error) {
	if start == "" || end == "" || company == "" || csvType == "" {
		return nil, nil, "", ErrMissingCSVParams
	}

	if fulfillmentType != "" && !slices.Contains(repository.FulfillmentTypes, fulfillmentType) {
		return nil, nil, "", ErrInvalidFulfillmentType
	}

	if marketPlace != "" && marketPlace != "true" && marketPlace != "false" {
		return nil, nil, "", ErrInvalidMarketPlace
	}

	var t repository.OrdersCSVType
	switch csvType {
	case string(repository.OrdersCSVTypeSummary), string(repository.OrdersCSVTypeDecomm), string(repository.OrdersCSVTypeRecalc):
		t = repository.OrdersCSVType(csvType)
	default:
		return nil, nil, "", ErrInvalidCSVType
	}

	header, rows, err = o.order.GetOrdersCSV(context.Background(), repository.OrdersCSVParams{
		Start:           start,
		End:             end,
		Company:         company,
		Type:            t,
		ProductType:     productType,
		FulfillmentType: fulfillmentType,
		MarketPlace:     marketPlace,
	})
	if err != nil {
		return nil, nil, "", err
	}

	if len(rows) == 0 {
		return nil, nil, "", ErrNoCSVRows
	}

	filename = fmt.Sprintf("reporte_%s_%s_%s_%s.csv", company, csvType, start, end)
	return header, rows, filename, nil
}
