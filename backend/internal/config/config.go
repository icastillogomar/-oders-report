package config

import (
	"os"

	"edd-panel-backend/pkg/utils"

	"github.com/joho/godotenv"
)

type Config struct {
	// BigQuery (órdenes)
	GCPProjectID       string // GCP_PROJECT_ID: proyecto que factura los jobs
	GCPCredentialsFile string // GCP_CREDENTIALS_FILE: opcional, ruta al JSON de service account; sin ella se usan Application Default Credentials
	BQLocation         string // BQ_LOCATION: ubicación del dataset (default "US")

	// PostgreSQL / AlloyDB (configuraciones operativas)
	PGDSN string // PG_DSN: cadena de conexión a la instancia de AlloyDB

	// Servidor HTTP
	Port      string // PORT: puerto local; en Cloud Run lo inyecta la plataforma en runtime (default "8080")
	StaticDir string // STATIC_DIR: carpeta del build del frontend a servir (default "./frontend/dist")
}

func Load() Config {
	if err := godotenv.Load(); err != nil {
		utils.Logging("INFO", "Could not load .env file", "config", err.Error())
	}

	return Config{
		GCPProjectID:       os.Getenv("GCP_PROJECT_ID"),
		GCPCredentialsFile: os.Getenv("GCP_CREDENTIALS_FILE"),
		BQLocation:         getEnvDefault("BQ_LOCATION", "US"),

		PGDSN: os.Getenv("PG_DSN"),

		Port:      getEnvDefault("PORT", "8080"),
		StaticDir: getEnvDefault("STATIC_DIR", "./frontend/dist"),
	}
}

func getEnvDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
