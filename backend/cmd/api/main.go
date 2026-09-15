package main

import (
	"context"
	"edd-panel-backend/internal/config"
	"edd-panel-backend/internal/infra"
	"edd-panel-backend/internal/middlewares"
	"edd-panel-backend/internal/repository"
	"edd-panel-backend/internal/services"
	"edd-panel-backend/internal/transport"
	"edd-panel-backend/pkg/utils"
	"fmt"
	"net/http"
	_ "time/tzdata" // embebe la base de timezones para que LoadLocation funcione sin tzdata del SO
)

func main() {

	cfg := config.Load()

	ctx := context.Background()

	client, err := infra.NewBQClient(ctx, infra.Config{
		ProjectID:       cfg.GCPProjectID,
		CredentialsFile: cfg.GCPCredentialsFile,
	})
	if err != nil {
		utils.Logging("ERROR", "Error creating BigQuery client", "main", err.Error())
		return
	}

	defer client.Close()

	pgPool, err := infra.NewPostgresClient(ctx, infra.PostgresConfig{DSN: cfg.PGDSN})
	if err != nil {
		utils.Logging("ERROR", "Error creating Postgres client", "main", err.Error())
		return
	}
	defer pgPool.Close()

	ordersRepository := repository.NewOrdersRepository(client, cfg.BQLocation)
	ordersService := services.NewOrdersService(ordersRepository)
	ordersHandler := transport.NewOrdersHandler(ordersService)

	opConfigRepository := repository.NewOperationalConfigurationsRepository(pgPool)
	opConfigService := services.NewOperationalConfigurationsService(opConfigRepository)
	opConfigHandler := transport.NewOperationalConfigurationsHandler(opConfigService)

	http.HandleFunc("/api/orders-decomm", ordersHandler.HandlerOrdersSummary)
	http.HandleFunc("/api/orders-recalculate", ordersHandler.HandlerRecalculateOrders)
	http.HandleFunc("/api/delivery-types", ordersHandler.HandlerDeliveryTypes)
	http.HandleFunc("/api/order-search", ordersHandler.HandlerOrderSearch)
	http.HandleFunc("/api/orders-csv", ordersHandler.HandlerOrdersCSV)
	http.HandleFunc("/api/error-codes", ordersHandler.HandlerErrorCodes)
	http.HandleFunc("/api/orders-bulk-check", ordersHandler.HandlerOrdersBulkCheck)
	http.HandleFunc("/api/error-codes-csv", ordersHandler.HandlerErrorCodesCSV)
	http.HandleFunc("/api/operational-configurations", opConfigHandler.HandlerOperationalConfigurations)
	http.HandleFunc("/api/operational-configurations-variables", opConfigHandler.HandlerOperativeConfigurationsVariables)

	// Sirve el build del frontend (y su fallback a index.html) para
	// cualquier ruta que no sea /api/*. En Cloud Run, el binario Go es lo
	// único que corre en el contenedor: ya no hay un Express aparte
	// haciendo express.static.
	http.Handle("/", transport.NewStaticHandler(cfg.StaticDir))

	stackMiddlewares := middlewares.CreateStack(
		middlewares.CorsMiddleware,
		middlewares.RequestInterceptor,
		middlewares.GzipMiddleware,
	)

	// Cloud Run inyecta PORT en runtime (default 8080); en local dev cae a
	// 8080, el mismo puerto al que vite.config.js ya le hace proxy.
	utils.Logging("INFO", fmt.Sprintf("Starting server on :%s", cfg.Port), "main", nil)
	if err := http.ListenAndServe(":"+cfg.Port, stackMiddlewares(http.DefaultServeMux)); err != nil {
		utils.Logging("ERROR", "Error starting server", "main", err.Error())
		return
	}
}
