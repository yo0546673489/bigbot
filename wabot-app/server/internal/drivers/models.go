package drivers

import "time"

type CategoryFilter struct {
	Key   string `bson:"key" json:"key"`
	Value string `bson:"value" json:"value"`
}

type Driver struct {
	ID             string           `bson:"_id,omitempty" json:"_id,omitempty"`
	Phone          string           `bson:"phone" json:"phone"`
	Name           string           `bson:"name" json:"name"`
	IsApproved     bool             `bson:"isApproved" json:"isApproved"`
	IsBusy         bool             `bson:"isBusy" json:"isBusy"`
	IsActive       bool             `bson:"isActive" json:"isActive"`
	Language       string           `bson:"language" json:"language"`
	CategoryFilters []CategoryFilter `bson:"categoryFilters" json:"categoryFilters"`
	FilterGroups   []string         `bson:"filterGroups" json:"filterGroups"`
	BillingEndAt   int64            `bson:"billingEndAt" json:"billingEndAt"`
	BillingCycle   string           `bson:"billingCycle" json:"billingCycle"`
	IgnorePayment  bool             `bson:"ignorePayment" json:"ignorePayment"`
	PaymentPackage string           `bson:"paymentPackage" json:"paymentPackage"`
	CreatedAt      time.Time        `bson:"createdAt" json:"createdAt"`
	FCMToken       string           `bson:"fcmToken,omitempty" json:"fcmToken,omitempty"`
}

type DriverSearchKeyword struct {
	ID             string    `bson:"_id,omitempty" json:"_id,omitempty"`
	Phone          string    `bson:"phone" json:"phone"`
	Keyword        string    `bson:"keyword" json:"keyword"`
	SearchCount    int       `bson:"searchCount" json:"searchCount"`
	LastSearchedAt time.Time `bson:"lastSearchedAt" json:"lastSearchedAt"`
	IsBlocked      bool      `bson:"isBlocked" json:"isBlocked"`
}

type DriverMessagePrivate struct {
	ID       string `bson:"_id,omitempty" json:"_id,omitempty"`
	Phone    string `bson:"phone" json:"phone"`
	Message  string `bson:"message" json:"message"`
	Type     string `bson:"type" json:"type"` // "CUSTOM"
	IsActive bool   `bson:"isActive" json:"isActive"`
}
