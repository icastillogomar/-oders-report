package transport

import (
	"edd-panel-backend/internal/services"
	"edd-panel-backend/pkg/utils"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
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
	h.handleGetOrdersSummary(w, r)
}

func (h *OrdersHandler) HandlerRecalculateOrders(w http.ResponseWriter, r *http.Request) {
	h.handleRecalculateOrders(w, r)
}

func (h *OrdersHandler) HandlerDeliveryTypes(w http.ResponseWriter, r *http.Request) {
	h.handleGetDeliveryTypes(w, r)
}

func (h *OrdersHandler) HandlerOrderSearch(w http.ResponseWriter, r *http.Request) {
	h.handleOrderSearch(w, r)
}

func (h *OrdersHandler) HandlerOrdersCSV(w http.ResponseWriter, r *http.Request) {
	h.handleOrdersCSV(w, r)
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

func (h *OrdersHandler) handleRecalculateOrders(w http.ResponseWriter, r *http.Request) {
	startDate := r.URL.Query().Get("start")
	endDate := r.URL.Query().Get("end")
	company := r.URL.Query().Get("company")

	summary, err := h.service.RecalculateOrders(startDate, endDate, company)
	if err != nil {
		utils.Logging("ERROR", "Error getting recalculated orders summary", "", map[string]any{
			"query": r.URL.Query(),
			"error": err.Error(),
		})
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "bad_request",
			"message": fmt.Sprintf("Error getting recalculated orders summary: %v", err),
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
		"company": company,
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

func (h *OrdersHandler) handleGetDeliveryTypes(w http.ResponseWriter, r *http.Request) {
	company := r.URL.Query().Get("company")
	productType := r.URL.Query().Get("productType")
	startDate := r.URL.Query().Get("start")
	endDate := r.URL.Query().Get("end")

	result, err := h.service.GetDeliveryTypes(company, productType, startDate, endDate)
	if err != nil {
		utils.Logging("ERROR", "Error getting delivery types", "", map[string]any{
			"query": r.URL.Query(),
			"error": err.Error(),
		})
		w.Header().Set("Content-Type", "application/json")
		if errors.Is(err, services.ErrInvalidDateFormat) {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"error": err.Error(),
			})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]interface{}{
		"byDay":  result.ByDay,
		"stores": result.Stores,
		"totals": result.Totals,
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

func (h *OrdersHandler) handleOrderSearch(w http.ResponseWriter, r *http.Request) {
	orderNumber := strings.TrimSpace(r.URL.Query().Get("orderNumber"))

	lines, err := h.service.SearchOrder(orderNumber)
	if err != nil {
		utils.Logging("ERROR", "Error searching order", "", map[string]any{
			"query": r.URL.Query(),
			"error": err.Error(),
		})
		w.Header().Set("Content-Type", "application/json")
		if errors.Is(err, services.ErrInvalidOrderNumber) {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"error": err.Error(),
			})
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]interface{}{
		"orderNumber": orderNumber,
		"found":       len(lines) > 0,
		"lines":       lines,
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

func (h *OrdersHandler) handleOrdersCSV(w http.ResponseWriter, r *http.Request) {
	start := r.URL.Query().Get("start")
	end := r.URL.Query().Get("end")
	company := r.URL.Query().Get("company")
	csvType := r.URL.Query().Get("type")
	productType := r.URL.Query().Get("productType")
	fulfillmentType := r.URL.Query().Get("fulfillmentType")
	marketPlace := r.URL.Query().Get("marketPlace")

	header, rows, filename, err := h.service.ExportOrdersCSV(start, end, company, csvType, productType, fulfillmentType, marketPlace)
	if err != nil {
		utils.Logging("ERROR", "Error exporting orders csv", "", map[string]any{
			"query": r.URL.Query(),
			"error": err.Error(),
		})
		switch {
		case errors.Is(err, services.ErrMissingCSVParams),
			errors.Is(err, services.ErrInvalidFulfillmentType),
			errors.Is(err, services.ErrInvalidMarketPlace),
			errors.Is(err, services.ErrInvalidCSVType):
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"error": err.Error(),
			})
		case errors.Is(err, services.ErrNoCSVRows):
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte("No se encontraron registros de Error o Plan B para este rango."))
		default:
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte("Error generando CSV: " + err.Error()))
		}
		return
	}

	csvBody := utils.CSVBOM + utils.BuildCSV(header, rows)

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("X-Total-Rows", strconv.Itoa(len(rows)))
	_, _ = w.Write([]byte(csvBody))
}
