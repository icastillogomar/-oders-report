package main

import (
	"context"
	"edd-panel-backend/internal/infra"
	"edd-panel-backend/internal/middlewares"
	"edd-panel-backend/internal/repository"
	"edd-panel-backend/internal/services"
	"edd-panel-backend/internal/transport"
	"edd-panel-backend/pkg/utils"
	"fmt"
	"net/http"
	"os"
	_ "time/tzdata" // embebe la base de timezones para que LoadLocation funcione sin tzdata del SO

	"github.com/joho/godotenv"
)

func main() {

	if err := godotenv.Load(); err != nil {
		fmt.Println("aviso: no se pudo cargar .env:", err)
	}

	ctx := context.Background()

	client, err := infra.NewBQClient(ctx, infra.Config{
		ProjectID:       os.Getenv("GCP_PROJECT_ID"),
		CredentialsFile: os.Getenv("GCP_CREDENTIALS_FILE"),
	})
	if err != nil {
		utils.Logging("ERROR", "Error creating BigQuery client", "main", err.Error())
		return
	}

	defer client.Close()

	ordersRepository := repository.NewOrdersRepository(client)
	ordersService := services.NewOrdersService(ordersRepository)
	ordersHandler := transport.NewOrdersHandler(ordersService)

	http.HandleFunc("/api/orders-decomm", ordersHandler.HandlerOrdersSummary)
	http.HandleFunc("/api/orders-recalculate", ordersHandler.HandlerRecalculateOrders)
	http.HandleFunc("/api/delivery-types", ordersHandler.HandlerDeliveryTypes)

	stackMiddlewares := middlewares.CreateStack(
		middlewares.CorsMiddleware,
		middlewares.RequestInterceptor,
	)

	utils.Logging("INFO", "Starting server on :8080", "main", nil)
	if err := http.ListenAndServe(":8080", stackMiddlewares(http.DefaultServeMux)); err != nil {
		utils.Logging("ERROR", "Error starting server", "main", err.Error())
		return
	}
}
