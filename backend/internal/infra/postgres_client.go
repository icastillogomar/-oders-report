package infra

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresConfig es la configuración para crear el pool de conexiones a
// PostgreSQL (AlloyDB). DSN es obligatorio; el resto tiene defaults si se
// deja en cero.
type PostgresConfig struct {
	DSN               string
	MaxConns          int32
	MinConns          int32
	MaxConnLifetime   time.Duration
	MaxConnIdleTime   time.Duration
	ConnectionTimeout time.Duration
}

const (
	defaultMaxConns          int32         = 10
	defaultMinConns          int32         = 2
	defaultMaxConnLifetime   time.Duration = 30 * time.Minute
	defaultMaxConnIdleTime   time.Duration = 5 * time.Minute
	defaultConnectionTimeout time.Duration = 10 * time.Second
)

// NewPostgresClient arma un *pgxpool.Pool a partir de cfg.DSN y hace un
// ping bajo cfg.ConnectionTimeout para fallar en el arranque en vez de en
// la primera request.
func NewPostgresClient(ctx context.Context, cfg PostgresConfig) (*pgxpool.Pool, error) {
	if cfg.DSN == "" {
		return nil, fmt.Errorf("postgres: DSN es obligatorio")
	}

	poolConfig, err := pgxpool.ParseConfig(cfg.DSN)
	if err != nil {
		return nil, fmt.Errorf("postgres: parsing DSN: %w", err)
	}

	poolConfig.MaxConns = withDefaultInt32(cfg.MaxConns, defaultMaxConns)
	poolConfig.MinConns = withDefaultInt32(cfg.MinConns, defaultMinConns)
	poolConfig.MaxConnLifetime = withDefaultDuration(cfg.MaxConnLifetime, defaultMaxConnLifetime)
	poolConfig.MaxConnIdleTime = withDefaultDuration(cfg.MaxConnIdleTime, defaultMaxConnIdleTime)

	connectTimeout := withDefaultDuration(cfg.ConnectionTimeout, defaultConnectionTimeout)
	poolConfig.ConnConfig.ConnectTimeout = connectTimeout

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("postgres: creating connection pool: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, connectTimeout)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("postgres: ping: %w", err)
	}

	return pool, nil
}

func withDefaultInt32(v, fallback int32) int32 {
	if v == 0 {
		return fallback
	}
	return v
}

func withDefaultDuration(v, fallback time.Duration) time.Duration {
	if v == 0 {
		return fallback
	}
	return v
}
