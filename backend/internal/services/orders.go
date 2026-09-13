package services

import (
	"context"
	"errors"
	"fmt"
	"regexp"

	"edd-panel-backend/internal/model"
	"edd-panel-backend/internal/repository"
)

var ErrInvalidDateFormat = errors.New("formato de fecha inválido")

// ErrInvalidOrderNumber señala un orderNumber que no cumple el formato
// esperado, para que el transport la responda como 400 en vez de 500.
var ErrInvalidOrderNumber = errors.New("el número de orden debe tener entre 6 y 20 dígitos")

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
