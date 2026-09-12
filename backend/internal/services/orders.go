package services

import (
	"context"
	"fmt"

	"edd-panel-backend/internal/model"
	"edd-panel-backend/internal/repository"
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
