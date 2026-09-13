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
	RecalculateOrders(ctx context.Context, startDate, endDate, company string) ([]*model.OrdersSummary, error)
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
		return nil, fmt.Errorf("loading timezone America/Mexico_City: %w", err)
	}

	start, err := time.ParseInLocation("2006-01-02", startDate, loc)
	if err != nil {
		return nil, fmt.Errorf("invalid startDate, use YYYY-MM-DD format: %w", err)
	}
	end, err := time.ParseInLocation("2006-01-02", endDate, loc)
	if err != nil {
		return nil, fmt.Errorf("invalid endDate, use YYYY-MM-DD format: %w", err)
	}
	if !end.After(start) {
		return nil, fmt.Errorf("endDate (%s) must be after startDate (%s)", endDate, startDate)
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
		// The marketPlace column is BOOL in BigQuery.
		v, err := strconv.ParseBool(strings.TrimSpace(isMarketplace))
		if err != nil {
			return nil, fmt.Errorf("invalid isMarketplace: %q", isMarketplace)
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
		return nil, fmt.Errorf("validating orders summary query (dry run): %w", err)
	}

	it, err := q.Read(ctx)
	if err != nil {
		return nil, fmt.Errorf("running orders summary query: %w", err)
	}

	summaries := make([]*model.OrdersSummary, 0)
	for {
		var row model.OrdersSummary
		err := it.Next(&row)
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("reading orders summary results: %w", err)
		}
		summaries = append(summaries, &row)
	}

	utils.Logging("INFO", "Orders quantity found", "", map[string]int{"count": len(summaries)})

	return summaries, nil
}
func (o *Orders) RecalculateOrders(
	ctx context.Context,
	startDate, endDate, company string,
) ([]*model.OrdersSummary, error) {
	loc, err := time.LoadLocation("America/Mexico_City")
	if err != nil {
		return nil, fmt.Errorf("loading timezone America/Mexico_City: %w", err)
	}

	start, err := time.ParseInLocation("2006-01-02", startDate, loc)
	if err != nil {
		return nil, fmt.Errorf("invalid startDate, use YYYY-MM-DD format: %w", err)
	}
	end, err := time.ParseInLocation("2006-01-02", endDate, loc)
	if err != nil {
		return nil, fmt.Errorf("invalid endDate, use YYYY-MM-DD format: %w", err)
	}
	if !end.After(start) {
		return nil, fmt.Errorf("endDate (%s) must be after startDate (%s)", endDate, startDate)
	}

	// EnterpriseCode in the JSON uses the full name, not the short company code.
	enterpriseCode := "Liverpool"
	if company == "SB" || company == "SBB" {
		enterpriseCode = "Suburbia"
	}

	params := []bigquery.QueryParameter{
		{Name: "enterpriseCode", Value: enterpriseCode},
		{Name: "startDate", Value: start},
		{Name: "endDate", Value: end},
	}

	const recalculateOrdersTableName = "`crp-pro-dig-edd.mus_pro_digital_prd_tbls.FAC_EDD_RECALCULATE_TRN`"
	const recalcQuery = ` WITH base AS (
        SELECT
          FORMAT_TIMESTAMP('%Y-%m-%d', _ingested_at, 'America/Mexico_City') AS Fecha,
          JSON_EXTRACT_SCALAR(rawPayload, '$.Order.OrderLines.OrderLine[0].Extn.ExtnPromiseEDD1') as edd1,
          JSON_EXTRACT_SCALAR(rawPayload, '$.Order.OrderLines.OrderLine[0].Extn.ExtnPromiseEDD2') as edd2
        FROM ` + recalculateOrdersTableName + `
        WHERE messageType = 'ORDER_CREATED'
          AND JSON_EXTRACT_SCALAR(rawPayload, '$.Order.EnterpriseCode') = @enterpriseCode
          AND _ingested_at >= @startDate
          AND _ingested_at <  @endDate
      ),
      clasificado AS (
        SELECT
          Fecha,
          CASE
            WHEN edd1 IS NOT NULL AND edd2 IS NOT NULL THEN 'Plan A'
            ELSE 'Error'
          END AS clasificacion
        FROM base
      )
      SELECT
        Fecha,
        COUNTIF(clasificacion = 'Plan A') AS Plan_A,
        0 AS Plan_B,
        COUNTIF(clasificacion = 'Error')  AS Error,
        COUNT(*)                          AS Total
      FROM clasificado
      GROUP BY Fecha
      ORDER BY Fecha`

	q := o.client.Query(recalcQuery)
	q.Parameters = params
	dry := *q
	dry.DryRun = true
	if _, err := dry.Run(ctx); err != nil {
		return nil, fmt.Errorf("validating orders recalculation query (dry run): %w", err)
	}

	it, err := q.Read(ctx)
	if err != nil {
		return nil, fmt.Errorf("running orders recalculation query: %w", err)
	}

	summaries := make([]*model.OrdersSummary, 0)
	for {
		var row model.OrdersSummary
		err := it.Next(&row)
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("reading orders summary results: %w", err)
		}
		summaries = append(summaries, &row)
	}

	return summaries, nil
}
