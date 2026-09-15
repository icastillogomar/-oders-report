package repository

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"

	"edd-panel-backend/internal/model"

	"github.com/jackc/pgx/v5/pgxpool"
)

const operationalConfigurationsTable = "edd_panel.edd_operative_configuration"

var ErrOperationalConfigIncomplete = errors.New("faltan variables de configuración en la base")

type OperationalConfigurationsRepository interface {
	Get(ctx context.Context) (*model.OperationalConfigurations, error)
	GetVariables(ctx context.Context) ([]model.OperativeConfigurationVariables, error)
}

type OperationalConfigurations struct {
	pool *pgxpool.Pool
}

func NewOperationalConfigurationsRepository(pool *pgxpool.Pool) OperationalConfigurationsRepository {
	return &OperationalConfigurations{
		pool: pool,
	}
}

// Nombres de variable_name, uno por campo de model.OperationalConfigurations.
const (
	varIsLoggingEnabled  = "IsLoggingEnabled"
	varPlanB1            = "PlanB1"
	varPlanB2            = "PlanB2"
	varEdd2              = "Edd2"
	varMarketplaceSLCC2  = "MarketplaceSLCC2"
	varMarketplaceSLS2H2 = "MarketplaceSLS2H2"
	varMarketplaceBTS2H2 = "MarketplaceBTS2H2"
	varBtAsa1            = "BtAsa1"
	varBtAsa2            = "BtAsa2"
	varBt1               = "Bt1"
	varIsPlanBEnabled    = "IsPlanBEnabled"
	varBtAsaNotice       = "BtAsaNotice"
)

// toRows serializa cada campo del struct a su representación en texto, en
// el mismo orden en que se van a mandar a la base (unnest empareja por
// posición, así que names y values deben ir sincronizados).
func toRows(cfg model.OperationalConfigurations) (names []string, values []string) {
	names = []string{
		varIsLoggingEnabled,
		varPlanB1,
		varPlanB2,
		varEdd2,
		varMarketplaceSLCC2,
		varMarketplaceSLS2H2,
		varMarketplaceBTS2H2,
		varBtAsa1,
		varBtAsa2,
		varBt1,
		varIsPlanBEnabled,
		varBtAsaNotice,
	}
	values = []string{
		strconv.FormatBool(cfg.IsLoggingEnabled),
		strconv.Itoa(cfg.PlanB1),
		strconv.Itoa(cfg.PlanB2),
		strconv.Itoa(cfg.Edd2),
		strconv.Itoa(cfg.MarketplaceSLCC2),
		strconv.Itoa(cfg.MarketplaceSLS2H2),
		strconv.Itoa(cfg.MarketplaceBTS2H2),
		strconv.Itoa(cfg.BtAsa1),
		strconv.Itoa(cfg.BtAsa2),
		strconv.Itoa(cfg.Bt1),
		strconv.FormatBool(cfg.IsPlanBEnabled),
		cfg.BtAsaNotice,
	}
	return names, values
}

func fromRows(rows map[string]string) (*model.OperationalConfigurations, error) {
	get := func(name string) (string, error) {
		v, ok := rows[name]
		if !ok {
			return "", fmt.Errorf("falta la variable %q", name)
		}
		return v, nil
	}

	var missing []string
	str := func(name string) string {
		v, err := get(name)
		if err != nil {
			missing = append(missing, name)
		}
		return v
	}
	boolVal := func(name string) bool {
		v, err := get(name)
		if err != nil {
			missing = append(missing, name)
			return false
		}
		b, err := strconv.ParseBool(v)
		if err != nil {
			missing = append(missing, name)
			return false
		}
		return b
	}
	intVal := func(name string) int {
		v, err := get(name)
		if err != nil {
			missing = append(missing, name)
			return 0
		}
		n, err := strconv.Atoi(v)
		if err != nil {
			missing = append(missing, name)
			return 0
		}
		return n
	}

	cfg := &model.OperationalConfigurations{
		IsLoggingEnabled:  boolVal(varIsLoggingEnabled),
		PlanB1:            intVal(varPlanB1),
		PlanB2:            intVal(varPlanB2),
		Edd2:              intVal(varEdd2),
		MarketplaceSLCC2:  intVal(varMarketplaceSLCC2),
		MarketplaceSLS2H2: intVal(varMarketplaceSLS2H2),
		MarketplaceBTS2H2: intVal(varMarketplaceBTS2H2),
		BtAsa1:            intVal(varBtAsa1),
		BtAsa2:            intVal(varBtAsa2),
		Bt1:               intVal(varBt1),
		IsPlanBEnabled:    boolVal(varIsPlanBEnabled),
		BtAsaNotice:       str(varBtAsaNotice),
	}

	if len(missing) > 0 {
		sort.Strings(missing)
		return nil, fmt.Errorf("%w: %v", ErrOperationalConfigIncomplete, missing)
	}

	return cfg, nil
}

// Get lee las 12 variables de configuración operativa.
func (o *OperationalConfigurations) Get(ctx context.Context) (*model.OperationalConfigurations, error) {
	query := fmt.Sprintf("SELECT id, key, value, description FROM %s", operationalConfigurationsTable)

	rows, err := o.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("querying operational configurations: %w", err)
	}
	defer rows.Close()

	values := make(map[string]string, 12)
	for rows.Next() {
		var id int
		var key, value, description string
		if err := rows.Scan(&id, &key, &value, &description); err != nil {
			return nil, fmt.Errorf("scanning operational configurations row: %w", err)
		}
		values[key] = value
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("reading operational configurations results: %w", err)
	}

	return fromRows(values)
}

// GetVariables lee las 12 variables de configuración operativa.
func (o *OperationalConfigurations) GetVariables(ctx context.Context) ([]model.OperativeConfigurationVariables, error) {
	query := fmt.Sprintf("SELECT id, key, value, description FROM %s", operationalConfigurationsTable)

	rows, err := o.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("querying operational configuration variables: %w", err)
	}
	defer rows.Close()

	var vars []model.OperativeConfigurationVariables
	for rows.Next() {
		var v model.OperativeConfigurationVariables
		if err := rows.Scan(&v.Id, &v.Key, &v.Value, &v.Description); err != nil {
			return nil, fmt.Errorf("scanning operational configuration variable row: %w", err)
		}
		vars = append(vars, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("reading operational configuration variable results: %w", err)
	}

	return vars, nil
}
