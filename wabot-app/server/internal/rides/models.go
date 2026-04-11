package rides

import "time"

// IncomingMessage from the whatsapp bot
type IncomingMessage struct {
	Phone        string   `json:"phone"`
	Body         string   `json:"body"`
	MessageID    string   `json:"messageId"`
	GroupName    string   `json:"groupName"`
	GroupID      string   `json:"groupId"`
	SenderPhone  string   `json:"senderPhone"`
	FromName     string   `json:"fromName"`
	Timestamp    int64    `json:"timestamp"`
	Type         string   `json:"type"`
	Participants []string `json:"participants"`
}

// Ride is the processed ride struct sent to drivers
type Ride struct {
	ID              string    `json:"id" bson:"_id,omitempty"`
	MessageID       string    `json:"messageId" bson:"messageId"`
	GroupID         string    `json:"groupId" bson:"groupId"`
	GroupName       string    `json:"groupName" bson:"groupName"`
	Origin          string    `json:"origin" bson:"origin"`
	Destination     string    `json:"destination" bson:"destination"`
	OriginRaw       string    `json:"originRaw" bson:"originRaw"`
	DestinationRaw  string    `json:"destinationRaw" bson:"destinationRaw"`
	Body            string    `json:"body" bson:"body"`
	BodyClean       string    `json:"bodyClean" bson:"bodyClean"`
	SenderPhone     string    `json:"senderPhone" bson:"senderPhone"`
	SenderName      string    `json:"senderName" bson:"senderName"`
	Price           string    `json:"price" bson:"price"`
	Timestamp       int64     `json:"timestamp" bson:"timestamp"`
	HasLink         bool      `json:"hasLink" bson:"hasLink"`
	LinkPhone       string    `json:"linkPhone" bson:"linkPhone"`
	LinkText        string    `json:"linkText" bson:"linkText"`
	Buttons         []Button  `json:"buttons" bson:"buttons"`
	IsSpecialGroup  bool      `json:"isSpecialGroup" bson:"isSpecialGroup"`
	CreatedAt       time.Time `json:"createdAt" bson:"createdAt"`
}

type Button struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// RideHistory stored in DB
type RideHistory struct {
	MessageID   string    `bson:"messageId"`
	GroupID     string    `bson:"groupId"`
	Origin      string    `bson:"origin"`
	Destination string    `bson:"destination"`
	Body        string    `bson:"body"`
	SenderPhone string    `bson:"senderPhone"`
	DriverPhone string    `bson:"driverPhone"`
	Action      string    `bson:"action"`
	Timestamp   int64     `bson:"timestamp"`
	CreatedAt   time.Time `bson:"createdAt"`
}
