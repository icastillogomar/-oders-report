package transport

import (
	"edd-panel-backend/internal/services"
	"edd-panel-backend/pkg/utils"
	"encoding/json"
	"fmt"
	"net/http"
)

type OrdersHandler struct {
	service *services.OrdersService
}

func NewOrdersHandler(service *services.OrdersService) *OrdersHandler {
	return &OrdersHandler{
		service: service,
	}
}

func (h *OrdersHandler) HandlerOrdersSummary(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		// Handle GET request for orders summary
		h.handleGetOrdersSummary(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
func (h *OrdersHandler) handleGetOrdersSummary(w http.ResponseWriter, r *http.Request) {
	// Implement the logic to handle GET request for orders summary
	productType := r.URL.Query().Get("productType")
	fulfillmentType := r.URL.Query().Get("fulfillmentType")
	marketplace := r.URL.Query().Get("marketPlace")
	company := r.URL.Query().Get("company")
	startDate := r.URL.Query().Get("start")
	endDate := r.URL.Query().Get("end")

	summary, err := h.service.GetOrdersSummary(productType, fulfillmentType, marketplace, company, startDate, endDate)
	if err != nil {
		utils.Logging("ERROR", "Error getting orders summary", "", map[string]any{
			"query": r.URL.Query(),
			"error": err.Error(),
		})
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "bad_request",
			"message": fmt.Sprintf("Error getting orders summary: %v", err),
		})
		return
	}

	// Respond with the orders summary in JSON format
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]interface{}{
		"data": summary,
		"range": map[string]string{
			"start": startDate,
			"end":   endDate,
		},
		"company":     company,
		"productType": productType,
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}
