package model

type OperationalConfigurations struct {
	IsLoggingEnabled  bool   `json:"isLoggingEnabled"`
	PlanB1            int    `json:"planB1"`
	PlanB2            int    `json:"planB2"`
	Edd2              int    `json:"edd2"`
	MarketplaceSLCC2  int    `json:"marketplaceSLCC2"`
	MarketplaceSLS2H2 int    `json:"marketplaceSLS2H2"`
	MarketplaceBTS2H2 int    `json:"marketplaceBTS2H2"`
	BtAsa1            int    `json:"btAsa1"`
	BtAsa2            int    `json:"btAsa2"`
	Bt1               int    `json:"bt1"`
	IsPlanBEnabled    bool   `json:"isPlanBEnabled"`
	BtAsaNotice       string `json:"btAsaNotice"`
}

type OperativeConfigurationVariables struct {
	Id          int    `json:"id"`
	Key         string `json:"key"`
	Value       string `json:"value"`
	Description string `json:"description"`
}
