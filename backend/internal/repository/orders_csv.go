package repository

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"time"

	"cloud.google.com/go/bigquery"
	"cloud.google.com/go/civil"
	"google.golang.org/api/iterator"
)

var FulfillmentTypes = []string{"Liverpool_CNC_PICK_PACK", "Fulfillment_Type_Liverpool"}

// OrdersCSVType identifica cuál de las tres fuentes usar para el export.
type OrdersCSVType string

const (
	OrdersCSVTypeSummary OrdersCSVType = "summary"
	OrdersCSVTypeDecomm  OrdersCSVType = "decomm"
	OrdersCSVTypeRecalc  OrdersCSVType = "recalc"
)

// OrdersCSVParams agrupa los filtros del export, ya validados por el
// servicio (formato de fechas, tipo, fulfillmentType, marketPlace).
type OrdersCSVParams struct {
	Start           string
	End             string
	Company         string
	Type            OrdersCSVType
	ProductType     string
	FulfillmentType string
	MarketPlace     string
}

const OrdersCSVPageSize = 2000

type OrdersCSVStream struct {
	it         *bigquery.RowIterator
	header     []string
	totalRows  uint64
	pending    []string
	hasPending bool
	current    []string
	rowsRead   int64
	err        error
}

func (s *OrdersCSVStream) Header() []string { return s.header }

func (s *OrdersCSVStream) Empty() bool { return s.header == nil }

func (s *OrdersCSVStream) TotalRows() uint64 { return s.totalRows }

func (s *OrdersCSVStream) RowsRead() int64 { return s.rowsRead }

func (s *OrdersCSVStream) Err() error { return s.err }

func (s *OrdersCSVStream) AtPageBoundary() bool {
	return s.it.PageInfo().Remaining() == 0
}

func (s *OrdersCSVStream) Next() bool {
	if s.err != nil {
		return false
	}
	if s.hasPending {
		s.current = s.pending
		s.pending = nil
		s.hasPending = false
		s.rowsRead++
		return true
	}

	var row []bigquery.Value
	err := s.it.Next(&row)
	if errors.Is(err, iterator.Done) {
		return false
	}
	if err != nil {
		s.err = fmt.Errorf("reading orders csv results: %w", err)
		return false
	}

	s.current = stringifyBQRow(row)
	s.rowsRead++
	return true
}

func (s *OrdersCSVStream) Row() []string { return s.current }

func (o *Orders) GetOrdersCSV(ctx context.Context, p OrdersCSVParams) (*OrdersCSVStream, error) {
	query, params, location, err := buildOrdersCSVQuery(p, o.location)
	if err != nil {
		return nil, err
	}

	q := o.client.Query(query)
	q.Parameters = params
	if location != "" {
		q.Location = location
	}

	it, err := q.Read(ctx)
	if err != nil {
		return nil, fmt.Errorf("running orders csv query: %w", err)
	}
	it.PageInfo().MaxSize = OrdersCSVPageSize

	stream := &OrdersCSVStream{it: it}

	var row []bigquery.Value
	err = it.Next(&row)
	if errors.Is(err, iterator.Done) {
		return stream, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading orders csv results: %w", err)
	}

	header := make([]string, len(it.Schema))
	for i, f := range it.Schema {
		header[i] = f.Name
	}

	stream.header = header
	stream.totalRows = it.TotalRows
	stream.pending = stringifyBQRow(row)
	stream.hasPending = true

	return stream, nil
}

func buildOrdersCSVQuery(p OrdersCSVParams, defaultLocation string) (string, []bigquery.QueryParameter, string, error) {
	params := []bigquery.QueryParameter{
		{Name: "start", Value: fmt.Sprintf("%s 00:00:00", p.Start)},
		{Name: "end", Value: fmt.Sprintf("%s 00:00:00", p.End)},
	}
	if p.FulfillmentType != "" {
		params = append(params, bigquery.QueryParameter{Name: "fulfillmentType", Value: p.FulfillmentType})
	}

	switch p.Type {
	case OrdersCSVTypeSummary:
		params = append(params,
			bigquery.QueryParameter{Name: "company", Value: p.Company},
			bigquery.QueryParameter{Name: "productTypes", Value: productTypeVariants(p.ProductType)},
		)

		var fulfillmentFilter string
		if p.FulfillmentType != "" {
			fulfillmentFilter = "AND JSON_EXTRACT_SCALAR(data, '$.fulfillmentType') = @fulfillmentType"
		}

		query := fmt.Sprintf(`
			WITH base AS (
				SELECT
					JSON_EXTRACT_SCALAR(data, '$.plan') AS plan_ext,
					JSON_EXTRACT_SCALAR(data, '$.edd1') AS edd1_ext,
					JSON_EXTRACT_SCALAR(data, '$.edd2') AS edd2_ext,
					*
				FROM `+"`fechaestimadaentregaprod.alltables.tables_raw_changelog`"+`
				WHERE JSON_EXTRACT_SCALAR(data, '$.company') = @company
					AND UPPER(TRIM(JSON_EXTRACT_SCALAR(data, '$.productType'))) IN UNNEST(@productTypes)
					%s
					AND timestamp >= TIMESTAMP(@start, 'America/Mexico_City')
					AND timestamp <  TIMESTAMP(@end,   'America/Mexico_City')
			),
			clasificado AS (
				SELECT *,
					CASE
						WHEN UPPER(plan_ext) = 'B' THEN 'Plan B'
						WHEN edd1_ext IS NOT NULL AND edd1_ext <> '' AND edd2_ext IS NOT NULL AND edd2_ext <> '' THEN 'Plan A'
						ELSE 'Error'
					END AS clasificacion
				FROM base
			)
			SELECT * EXCEPT(plan_ext, edd1_ext, edd2_ext) FROM clasificado WHERE clasificacion IN ('Error', 'Plan B')
		`, fulfillmentFilter)

		return query, params, defaultLocation, nil

	case OrdersCSVTypeDecomm:
		params = append(params, bigquery.QueryParameter{Name: "company", Value: p.Company})

		var filterProductType string
		if p.ProductType != "" {
			filterProductType = "AND UPPER(TRIM(productType)) IN UNNEST(@productTypes)"
			params = append(params, bigquery.QueryParameter{Name: "productTypes", Value: productTypeVariants(p.ProductType)})
		}

		var filterFulfillment string
		if p.FulfillmentType != "" {
			filterFulfillment = "AND fulfillmentType = @fulfillmentType"
		}

		var filterMarketPlace string
		if p.MarketPlace != "" {
			filterMarketPlace = "AND marketPlace = @marketPlace"
			v, err := strconv.ParseBool(p.MarketPlace)
			if err != nil {
				return "", nil, "", fmt.Errorf("invalid marketPlace: %q", p.MarketPlace)
			}
			params = append(params, bigquery.QueryParameter{Name: "marketPlace", Value: v})
		}

		query := fmt.Sprintf(`
			WITH base AS (
				SELECT *,
					CASE
						WHEN plan = 'B' THEN 'Plan B'
						WHEN plan = 'A' AND edd1 IS NOT NULL AND edd2 IS NOT NULL THEN 'Plan A'
						ELSE 'Error'
					END AS clasificacion
				FROM `+"`crp-pro-dig-edd.mus_pro_digital_prd_tbls.FAC_EDD_ORDERS_TRN`"+`
				WHERE company = @company
					%s
					%s
					%s
					AND ingestionTimestamp >= TIMESTAMP(@start, 'America/Mexico_City')
					AND ingestionTimestamp <  TIMESTAMP(@end,   'America/Mexico_City')
			)
			SELECT * FROM base WHERE clasificacion IN ('Error', 'Plan B')
		`, filterProductType, filterFulfillment, filterMarketPlace)

		return query, params, "", nil

	case OrdersCSVTypeRecalc:
		enterpriseCode := "Liverpool"
		if p.Company == "SB" || p.Company == "SBB" {
			enterpriseCode = "Suburbia"
		}
		params = append(params, bigquery.QueryParameter{Name: "enterpriseCode", Value: enterpriseCode})

		query := `
			WITH base AS (
				SELECT *,
					CASE
						WHEN JSON_EXTRACT_SCALAR(rawPayload, '$.Order.OrderLines.OrderLine[0].Extn.ExtnPromiseEDD1') IS NOT NULL
						 AND JSON_EXTRACT_SCALAR(rawPayload, '$.Order.OrderLines.OrderLine[0].Extn.ExtnPromiseEDD2') IS NOT NULL THEN 'Plan A'
						ELSE 'Error'
					END AS clasificacion
				FROM ` + "`crp-pro-dig-edd.mus_pro_digital_prd_tbls.FAC_EDD_RECALCULATE_TRN`" + `
				WHERE messageType = 'ORDER_CREATED'
					AND JSON_EXTRACT_SCALAR(rawPayload, '$.Order.EnterpriseCode') = @enterpriseCode
					AND _ingested_at >= TIMESTAMP(@start, 'America/Mexico_City')
					AND _ingested_at <  TIMESTAMP(@end,   'America/Mexico_City')
			)
			SELECT * FROM base WHERE clasificacion IN ('Error', 'Plan B')
		`

		return query, params, "", nil

	default:
		return "", nil, "", fmt.Errorf("tipo inválido (summary, decomm, recalc)")
	}
}

func stringifyBQRow(row []bigquery.Value) []string {
	out := make([]string, len(row))
	for i, v := range row {
		out[i] = stringifyBQValue(v)
	}
	return out
}

func stringifyBQValue(v bigquery.Value) string {
	switch val := v.(type) {
	case nil:
		return ""
	case string:
		return val
	case bool:
		return strconv.FormatBool(val)
	case int64:
		return strconv.FormatInt(val, 10)
	case float64:
		return strconv.FormatFloat(val, 'f', -1, 64)
	case []byte:
		return string(val)
	case *big.Rat:
		return val.FloatString(9)
	case civil.Date:
		return val.String()
	case civil.Time:
		return val.String()
	case civil.DateTime:
		return val.String()
	case time.Time:
		return val.UTC().Format("2006-01-02T15:04:05.000Z")
	case []bigquery.Value:
		parts := make([]string, len(val))
		for i, e := range val {
			parts[i] = stringifyBQValue(e)
		}
		return joinSemicolon(parts)
	default:
		return fmt.Sprintf("%v", val)
	}
}

func joinSemicolon(parts []string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += "; "
		}
		out += p
	}
	return out
}
