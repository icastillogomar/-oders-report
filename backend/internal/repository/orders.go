package repository

import (
	"context"
	"edd-panel-backend/internal/model"
	"edd-panel-backend/pkg/utils"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"cloud.google.com/go/bigquery"
	"google.golang.org/api/iterator"
)

type OrdersRepository interface {
	GetOrdersSummary(ctx context.Context, productType, fulfillmentType, isMarketplace string, company, startDate, endDate string) ([]*model.OrdersSummary, error)
	RecalculateOrders(ctx context.Context, startDate, endDate, company string) ([]*model.OrdersSummary, error)
	GetDeliveryTypes(ctx context.Context, company, productType, startDate, endDate string) (*model.DeliveryTypesResult, error)
}

// productTypeVariants espeja al helper homónimo de server.js: 'BIG TICKET'/'BT'
// y 'SOFT LINE'/'SL' se tratan como sinónimos porque la columna productType en
// BigQuery no está normalizada entre ambas grafías.
func productTypeVariants(productType string) []string {
	pt := strings.ToUpper(strings.TrimSpace(productType))
	switch pt {
	case "BIG TICKET", "BT":
		return []string{"BIG TICKET", "BT"}
	case "SOFT LINE", "SL":
		return []string{"SOFT LINE", "SL"}
	default:
		return []string{pt}
	}
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

// GetDeliveryTypes clasifica cada línea según la promesa de entrega:
//
//	edd1 = edd2 = día de compra      -> Flash Mismo Día
//	edd1 = edd2 = día siguiente      -> Siguiente Día
//	cualquier otro caso con fechas   -> Estándar
//	sin edd1 o edd2                  -> Sin EDD
//
// Además regresa las asignaciones por tienda (columna origen).
func (o *Orders) GetDeliveryTypes(
	ctx context.Context,
	company, productType, startDate, endDate string,
) (*model.DeliveryTypesResult, error) {
	const baseCTE = `
		WITH base AS (
			SELECT
				FORMAT_TIMESTAMP('%%Y-%%m-%%d', ingestionTimestamp, 'America/Mexico_City') AS Fecha,
				DATE(createdAt, 'America/Mexico_City') AS fechaCompra,
				edd1,
				edd2,
				origen
			FROM ` + "`crp-pro-dig-edd.mus_pro_digital_prd_tbls.FAC_EDD_ORDERS_TRN`" + `
			WHERE company = @company
				%s
				AND ingestionTimestamp >= TIMESTAMP(@start, 'America/Mexico_City')
				AND ingestionTimestamp <  TIMESTAMP(@end,   'America/Mexico_City')
		),
		clasificado AS (
			SELECT
				Fecha,
				origen,
				CASE
					WHEN edd1 IS NULL OR edd2 IS NULL THEN 'SinEDD'
					WHEN edd1 = edd2 AND edd1 = fechaCompra THEN 'Flash'
					WHEN edd1 = edd2 AND edd1 = DATE_ADD(fechaCompra, INTERVAL 1 DAY) THEN 'SiguienteDia'
					ELSE 'Estandar'
				END AS tipo
			FROM base
		)
	`

	params := []bigquery.QueryParameter{
		{Name: "company", Value: company},
		{Name: "start", Value: fmt.Sprintf("%s 00:00:00", startDate)},
		{Name: "end", Value: fmt.Sprintf("%s 00:00:00", endDate)},
	}

	var filterProductType string
	if productType != "" {
		filterProductType = "AND UPPER(TRIM(productType)) IN UNNEST(@productTypes)"
		params = append(params, bigquery.QueryParameter{Name: "productTypes", Value: productTypeVariants(productType)})
	}

	finalBaseCTE := fmt.Sprintf(baseCTE, filterProductType)

	queryByDay := finalBaseCTE + `
		SELECT
			Fecha,
			COUNTIF(tipo = 'Flash')        AS Flash,
			COUNTIF(tipo = 'SiguienteDia') AS Siguiente_Dia,
			COUNTIF(tipo = 'Estandar')     AS Estandar,
			COUNTIF(tipo = 'SinEDD')       AS Sin_EDD,
			COUNT(*)                       AS Total
		FROM clasificado
		GROUP BY Fecha
		ORDER BY Fecha
	`

	// origen NULL = línea surtida fuera de la red propia (mayormente Marketplace)
	queryStores := finalBaseCTE + `
		SELECT
			IFNULL(origen, 'MKTP') AS tienda,
			COUNT(*) AS asignaciones
		FROM clasificado
		GROUP BY tienda
		ORDER BY asignaciones DESC
	`

	var (
		byDay     []*model.DeliveryTypeByDay
		stores    []*model.DeliveryTypeStore
		byDayErr  error
		storesErr error
		wg        sync.WaitGroup
	)

	wg.Add(2)
	go func() {
		defer wg.Done()
		byDay, byDayErr = runDeliveryTypesByDayQuery(ctx, o.client, queryByDay, params)
	}()
	go func() {
		defer wg.Done()
		stores, storesErr = runDeliveryTypesStoresQuery(ctx, o.client, queryStores, params)
	}()
	wg.Wait()

	if byDayErr != nil {
		return nil, fmt.Errorf("running delivery types by day query: %w", byDayErr)
	}
	if storesErr != nil {
		return nil, fmt.Errorf("running delivery types stores query: %w", storesErr)
	}

	totals := model.DeliveryTypeTotals{}
	for _, d := range byDay {
		totals.Flash += d.Flash
		totals.SiguienteDia += d.SiguienteDia
		totals.Estandar += d.Estandar
		totals.SinEDD += d.SinEDD
		totals.Total += d.Total
	}

	return &model.DeliveryTypesResult{
		ByDay:  byDay,
		Stores: stores,
		Totals: totals,
	}, nil
}

func runDeliveryTypesByDayQuery(ctx context.Context, client *bigquery.Client, query string, params []bigquery.QueryParameter) ([]*model.DeliveryTypeByDay, error) {
	q := client.Query(query)
	q.Parameters = params

	it, err := q.Read(ctx)
	if err != nil {
		return nil, err
	}

	rows := make([]*model.DeliveryTypeByDay, 0)
	for {
		var row model.DeliveryTypeByDay
		err := it.Next(&row)
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, err
		}
		rows = append(rows, &row)
	}
	return rows, nil
}

func runDeliveryTypesStoresQuery(ctx context.Context, client *bigquery.Client, query string, params []bigquery.QueryParameter) ([]*model.DeliveryTypeStore, error) {
	q := client.Query(query)
	q.Parameters = params

	it, err := q.Read(ctx)
	if err != nil {
		return nil, err
	}

	rows := make([]*model.DeliveryTypeStore, 0)
	for {
		var row model.DeliveryTypeStore
		err := it.Next(&row)
		if errors.Is(err, iterator.Done) {
			break
		}
		if err != nil {
			return nil, err
		}
		rows = append(rows, &row)
	}
	return rows, nil
}
