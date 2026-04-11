package websocket

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/mongo"

	"wabot-app/internal/drivers"
	"wabot-app/internal/rides"
)

// Hub manages all WebSocket connections
type Hub struct {
	clients    map[*Client]bool
	byPhone    map[string]*Client
	register   chan *Client
	unregister chan *Client
	inbound    chan *InboundMessage

	db          *mongo.Database
	driverCache *drivers.Cache
	waSender    WASender

	rideMu    sync.RWMutex
	rideStore map[string]*rides.Ride
}

// WASender is the interface to send WhatsApp messages
type WASender interface {
	SendGroupReply(ctx context.Context, botPhone, groupID, messageID, text string) error
	SendPrivateMessage(ctx context.Context, botPhone, toPhone, text string) error
	SendLinkAction(ctx context.Context, botPhone, toPhone, text string) error
	GetBotPhone() string
}

func NewHub(db *mongo.Database, driverCache *drivers.Cache, waSender WASender) *Hub {
	return &Hub{
		clients:     make(map[*Client]bool),
		byPhone:     make(map[string]*Client),
		register:    make(chan *Client, 64),
		unregister:  make(chan *Client, 64),
		inbound:     make(chan *InboundMessage, 1024),
		db:          db,
		driverCache: driverCache,
		waSender:    waSender,
		rideStore:   make(map[string]*rides.Ride),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.clients[c] = true
			log.Printf("ws hub: client connected (total: %d)", len(h.clients))

		case c := <-h.unregister:
			if _, ok := h.clients[c]; ok {
				delete(h.clients, c)
				if c.DriverPhone != "" {
					delete(h.byPhone, c.DriverPhone)
					log.Printf("ws hub: driver %s disconnected", c.DriverPhone)
				}
				close(c.send)
			}

		case msg := <-h.inbound:
			h.handleInbound(msg)
		}
	}
}

func (h *Hub) Register(c *Client) {
	h.register <- c
}

func (h *Hub) handleInbound(msg *InboundMessage) {
	var env struct {
		Type string          `json:"type"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(msg.Data, &env); err != nil {
		return
	}

	switch env.Type {
	case TypeAuth:
		h.handleAuth(msg.Client, env.Data)
	case TypeRideAction:
		h.handleRideAction(msg.Client, env.Data)
	case TypeSetAvailability:
		h.handleSetAvailability(msg.Client, env.Data)
	case TypeSendMessage:
		h.handleSendMessage(msg.Client, env.Data)
	case TypePing:
		msg.Client.SendJSON(TypePong, nil)
	}
}

func (h *Hub) handleAuth(c *Client, data json.RawMessage) {
	var auth AuthMessage
	if err := json.Unmarshal(data, &auth); err != nil {
		return
	}
	phone := auth.Token
	if phone == "" {
		return
	}
	c.DriverPhone = phone
	c.Authenticated = true
	h.byPhone[phone] = c
	log.Printf("ws hub: driver %s authenticated", phone)
	c.SendJSON(TypeWAStatus, WAStatusMessage{Phone: phone, Connected: true})
}

func (h *Hub) handleRideAction(c *Client, data json.RawMessage) {
	if !c.Authenticated {
		return
	}
	var action RideActionMessage
	if err := json.Unmarshal(data, &action); err != nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var err error
	switch action.Action {
	case "reply_group":
		err = h.sendGroupReply(ctx, c.DriverPhone, action.RideID, "ת")
	case "reply_group_n":
		err = h.sendGroupReply(ctx, c.DriverPhone, action.RideID, "ן")
	case "reply_private":
		err = h.sendPrivateReply(ctx, action.RideID)
	case "send_link":
		err = h.sendLinkAction(ctx, action.RideID)
	}

	success := err == nil
	errMsg := ""
	if err != nil {
		errMsg = err.Error()
	}

	c.SendJSON(TypeActionResult, ActionResultMessage{
		RideID:  action.RideID,
		Action:  action.Action,
		Success: success,
		Error:   errMsg,
	})

	if success {
		go h.saveAction(c.DriverPhone, action.RideID, action.Action)
	}
}

func (h *Hub) sendGroupReply(ctx context.Context, driverPhone, rideID, text string) error {
	ride := h.getRide(rideID)
	if ride == nil {
		return nil
	}
	return h.waSender.SendGroupReply(ctx, h.waSender.GetBotPhone(), ride.GroupID, ride.MessageID, text)
}

func (h *Hub) sendPrivateReply(ctx context.Context, rideID string) error {
	ride := h.getRide(rideID)
	if ride == nil {
		return nil
	}
	return h.waSender.SendPrivateMessage(ctx, h.waSender.GetBotPhone(), ride.SenderPhone, "ת")
}

func (h *Hub) sendLinkAction(ctx context.Context, rideID string) error {
	ride := h.getRide(rideID)
	if ride == nil || !ride.HasLink {
		return nil
	}
	return h.waSender.SendLinkAction(ctx, h.waSender.GetBotPhone(), ride.LinkPhone, ride.LinkText)
}

func (h *Hub) handleSetAvailability(c *Client, data json.RawMessage) {
	if !c.Authenticated {
		return
	}
	var avail SetAvailabilityMessage
	if err := json.Unmarshal(data, &avail); err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	drivers.SetDriverBusy(ctx, h.db, c.DriverPhone, !avail.Available)
	drivers.RemoveKeywords(ctx, h.db, c.DriverPhone)

	if avail.Available {
		for _, kw := range avail.Keywords {
			drivers.SaveKeyword(ctx, h.db, c.DriverPhone, kw)
		}
	}
	h.driverCache.Invalidate(c.DriverPhone)
}

func (h *Hub) handleSendMessage(c *Client, data json.RawMessage) {
	if !c.Authenticated {
		return
	}
	var req SendMessageRequest
	if err := json.Unmarshal(data, &req); err != nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	h.waSender.SendPrivateMessage(ctx, h.waSender.GetBotPhone(), req.To, req.Text)
}

// SendRideToDriver sends a ride notification to a specific driver
func (h *Hub) SendRideToDriver(driverPhone string, ride *rides.Ride) {
	if c, ok := h.byPhone[driverPhone]; ok {
		c.SendJSON(TypeNewRide, ride)
	}
}

func (h *Hub) BroadcastWAStatus(phone string, connected bool) {
	msg, _ := json.Marshal(Envelope{
		Type: TypeWAStatus,
		Data: WAStatusMessage{Phone: phone, Connected: connected},
	})
	for c := range h.clients {
		select {
		case c.send <- msg:
		default:
		}
	}
}

func (h *Hub) StoreRide(ride *rides.Ride) {
	h.rideMu.Lock()
	h.rideStore[ride.MessageID] = ride
	h.rideMu.Unlock()
}

func (h *Hub) getRide(id string) *rides.Ride {
	h.rideMu.RLock()
	r := h.rideStore[id]
	h.rideMu.RUnlock()
	return r
}

func (h *Hub) saveAction(driverPhone, rideID, action string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	ride := h.getRide(rideID)
	if ride == nil {
		return
	}
	h.db.Collection("rides").InsertOne(ctx, map[string]interface{}{
		"messageId":   rideID,
		"groupId":     ride.GroupID,
		"origin":      ride.Origin,
		"destination": ride.Destination,
		"driverPhone": driverPhone,
		"action":      action,
		"timestamp":   ride.Timestamp,
		"createdAt":   time.Now(),
	})
}
