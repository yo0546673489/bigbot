package websocket

import "wabot-app/internal/rides"

// Message types from server to client
const (
	TypeNewRide      = "new_ride"
	TypeActionResult = "action_result"
	TypeWAStatus     = "wa_status"
	TypePong         = "pong"
	TypeError        = "error"
)

// Message types from client to server
const (
	TypeAuth            = "auth"
	TypeRideAction      = "ride_action"
	TypeSetAvailability = "set_availability"
	TypeSendMessage     = "send_message"
	TypePing            = "ping"
)

// Envelope is the generic message wrapper
type Envelope struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// NewRideMessage sent to driver when a matching ride arrives
type NewRideMessage struct {
	*rides.Ride
}

// ActionResultMessage sent after driver performs an action
type ActionResultMessage struct {
	RideID  string `json:"rideId"`
	Action  string `json:"action"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// WAStatusMessage sent when WhatsApp connection changes
type WAStatusMessage struct {
	Phone     string `json:"phone"`
	Connected bool   `json:"connected"`
}

// AuthMessage from client
type AuthMessage struct {
	Token string `json:"token"`
}

// RideActionMessage from client
type RideActionMessage struct {
	RideID     string `json:"rideId"`
	Action     string `json:"action"`     // reply_group, reply_private, send_link
	CustomText string `json:"customText"` // optional
}

// SetAvailabilityMessage from client
type SetAvailabilityMessage struct {
	Available bool     `json:"available"`
	Keywords  []string `json:"keywords"`
}

// SendMessageRequest from client
type SendMessageRequest struct {
	To   string `json:"to"`
	Text string `json:"text"`
}
