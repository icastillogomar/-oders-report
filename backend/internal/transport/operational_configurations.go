package transport

import (
	"encoding/json"
	"errors"
	"net/http"

	"edd-panel-backend/internal/repository"
	"edd-panel-backend/internal/services"
	"edd-panel-backend/pkg/utils"
)

type OperationalConfigurationsHandler struct {
	service *services.OperationalConfigurationsService
}

func NewOperationalConfigurationsHandler(service *services.OperationalConfigurationsService) *OperationalConfigurationsHandler {
	return &OperationalConfigurationsHandler{
		service: service,
	}
}

func (h *OperationalConfigurationsHandler) HandlerOperationalConfigurations(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.handleGet(w, r)
	case http.MethodPut:
		// h.handleUpdate(w, r)
	default:
		w.Header().Set("Allow", "GET, PUT")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *OperationalConfigurationsHandler) HandlerOperativeConfigurationsVariables(w http.ResponseWriter, r *http.Request) {
	h.handleGetVariables(w, r)
}

func (h *OperationalConfigurationsHandler) handleGet(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.service.Get(r.Context())
	if err != nil {
		writeOperationalConfigError(w, "Error getting operational configurations", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]interface{}{
		"data":    cfg,
		"success": true,
		"message": "Operational configuration variables",
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}
func (h *OperationalConfigurationsHandler) handleGetVariables(w http.ResponseWriter, r *http.Request) {
	vars, err := h.service.GetVariables(r.Context())
	if err != nil {
		writeOperationalConfigError(w, "Error getting operational configuration variables", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(map[string]interface{}{
		"data":    vars,
		"success": true,
		"message": "Operational configuration variables retrieved successfully",
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

func writeOperationalConfigError(w http.ResponseWriter, logMessage string, err error) {
	utils.Logging("ERROR", logMessage, "", map[string]any{
		"error": err.Error(),
	})

	w.Header().Set("Content-Type", "application/json")
	switch {
	case errors.Is(err, services.ErrNegativeValue), errors.Is(err, services.ErrNoticeTooLong):
		w.WriteHeader(http.StatusBadRequest)
	case errors.Is(err, repository.ErrOperationalConfigIncomplete):
		w.WriteHeader(http.StatusNotFound)
	default:
		w.WriteHeader(http.StatusInternalServerError)
	}
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"error":   err.Error(),
		"message": "An error was ocurred",
		"success": false,
	})
}
