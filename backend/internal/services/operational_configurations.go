package services

import (
	"context"
	"errors"
	"fmt"

	"edd-panel-backend/internal/model"
	"edd-panel-backend/internal/repository"
)

// MaxBtAsaNoticeLen espeja el CHECK de la base
// (operational_configurations_notice_len).
const MaxBtAsaNoticeLen = 500

var (
	ErrNoticeTooLong = fmt.Errorf("el aviso no puede exceder %d caracteres", MaxBtAsaNoticeLen)
	ErrNegativeValue = errors.New("los valores numéricos de configuración no pueden ser negativos")
)

type OperationalConfigurationsService struct {
	repo repository.OperationalConfigurationsRepository
}

func NewOperationalConfigurationsService(repo repository.OperationalConfigurationsRepository) *OperationalConfigurationsService {
	return &OperationalConfigurationsService{
		repo: repo,
	}
}

func (s *OperationalConfigurationsService) Get(ctx context.Context) (*model.OperationalConfigurations, error) {
	return s.repo.Get(ctx)
}

func (s *OperationalConfigurationsService) GetVariables(ctx context.Context) ([]model.OperativeConfigurationVariables, error) {
	return s.repo.GetVariables(ctx)
}

func validateOperationalConfigurations(cfg model.OperationalConfigurations) error {
	intFields := []struct {
		name  string
		value int
	}{
		{"PlanB1", cfg.PlanB1},
		{"PlanB2", cfg.PlanB2},
		{"Edd2", cfg.Edd2},
		{"MarketplaceSLCC2", cfg.MarketplaceSLCC2},
		{"MarketplaceSLS2H2", cfg.MarketplaceSLS2H2},
		{"MarketplaceBTS2H2", cfg.MarketplaceBTS2H2},
		{"BtAsa1", cfg.BtAsa1},
		{"BtAsa2", cfg.BtAsa2},
		{"Bt1", cfg.Bt1},
	}
	for _, f := range intFields {
		if f.value < 0 {
			return fmt.Errorf("%w: %s = %d", ErrNegativeValue, f.name, f.value)
		}
	}

	if len(cfg.BtAsaNotice) > MaxBtAsaNoticeLen {
		return ErrNoticeTooLong
	}

	return nil
}
