package repository

import (
	"context"
	"edd-panel-backend/internal/model"
	"edd-panel-backend/pkg/utils"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"cloud.google.com/go/bigquery"
	"google.golang.org/api/iterator"
)

type OrdersRepository interface {
	GetOrdersSummary(ctx context.Context, productType, fulfillmentType, isMarketplace string, company, startDate, endDate string) ([]*model.OrdersSummary, error)
}

type Orders struct {
	client *bigquery.Client
}

func NewOrdersRepository(client *bigquery.Client) OrdersRepository {
	return &Orders{
		client: client,
	}
}

func (o *Orders) GetOrdersSummary(
	ctx context.Context,
	productType, fulfillmentType, isMarketplace string,
	company, startDate, endDate string,
) ([]*model.OrdersSummary, error) {
	loc, err := time.LoadLocation("America/Mexico_City")
	if err != nil {
		return nil, fmt.Errorf("cargando timezone America/Mexico_City: %w", err)
	}

	start, err := time.ParseInLocation("2006-01-02", startDate, loc)
	if err != nil {
		return nil, fmt.Errorf("startDate inválido, usa formato YYYY-MM-DD: %w", err)
	}
	end, err := time.ParseInLocation("2006-01-02", endDate, loc)
	if err != nil {
		return nil, fmt.Errorf("endDate inválido, usa formato YYYY-MM-DD: %w", err)
	}
	if !end.After(start) {
		return nil, fmt.Errorf("endDate (%s) debe ser posterior a startDate (%s)", endDate, startDate)
	}

	params := []bigquery.QueryParameter{
		{Name: "company", Value: company},
		{Name: "startDate", Value: start},
		{Name: "endDate", Value: end},
	}

	var filters strings.Builder

	if productType != "" {
		filters.WriteString(" AND productType = @productType")
		params = append(params, bigquery.QueryParameter{Name: "productType", Value: productType})
	}

	if fulfillmentType != "" {
		filters.WriteString(" AND fulfillmentType = @fulfillmentType")
		params = append(params, bigquery.QueryParameter{Name: "fulfillmentType", Value: fulfillmentType})
	}

	if isMarketplace != "" {
		// La columna marketPlace es BOOL en BigQuery.
		v, err := strconv.ParseBool(strings.TrimSpace(isMarketplace))
		if err != nil {
			return nil, fmt.Errorf("isMarketplace inválido: %q", isMarketplace)
		}
		filters.WriteString(" AND marketPlace = @marketPlace")
		params = append(params, bigquery.QueryParameter{Name: "marketPlace", Value: v})
	}

	const ordersTableName = "`crp-pro-dig-edd.mus_pro_digital_prd_tbls.FAC_EDD_ORDERS_TRN`"
	const ordersSummaryQuery = `
			WITH base AS (
			SELECT
				FORMAT_TIMESTAMP('%%Y-%%m-%%d', ingestionTimestamp, 'America/Mexico_City') AS Fecha,
				plan,
				edd1,
				edd2
			FROM %s  
			WHERE company = @company%s
				AND ingestionTimestamp >= @startDate
				AND ingestionTimestamp <  @endDate
			),
			clasificado AS (
			SELECT
				Fecha,
				CASE
				WHEN plan = 'B' THEN 'Plan B'
				WHEN plan = 'A' AND edd1 IS NOT NULL AND edd2 IS NOT NULL THEN 'Plan A'
				ELSE 'Error'
				END AS clasificacion
			FROM base
			)
			SELECT
			Fecha,
			COUNTIF(clasificacion = 'Plan A') AS Plan_A,
			COUNTIF(clasificacion = 'Plan B') AS Plan_B,
			COUNTIF(clasificacion = 'Error')  AS Error,
			COUNT(*)                          AS Total
			FROM clasificado
			GROUP BY Fecha
			ORDER BY Fecha
			`
	finalSQL := fmt.Sprintf(ordersSummaryQuery, ordersTableName, filters.String())
	q := o.client.Query(finalSQL)
	q.Parameters = params

	dry := *q
	dry.DryRun = true
	if _, err := dry.Run(ctx); err != nil {
		return nil, fmt.Errorf("validando query de orders summary (dry run): %w", err)
	}

	it, err := q.Read(ctx)
	if err != nil {
		return nil, fmt.Errorf("ejecutando query de orders summary: %w", err)
	}

	summaries := make([]*model.OrdersSummary, 0)
	for {
		var row model.OrdersSummary
		err := it.Next(&row)
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("leyendo resultados de orders summary: %w", err)
		}
		summaries = append(summaries, &row)
	}

	utils.Logging("INFO", "Orders quantity found", "", map[string]int{"count": len(summaries)})

	return summaries, nil
}
