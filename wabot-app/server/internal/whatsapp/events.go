package whatsapp

import (
	"context"
	"log"
	"strings"
	"time"

	"go.mau.fi/whatsmeow/types/events"

	"wabot-app/internal/drivers"
	"wabot-app/internal/rides"
)

// EventHandler processes WhatsApp events and routes them
type EventHandler struct {
	processor   *rides.Processor
	driverCache *drivers.Cache
	waMgr       *Manager
	onStatus    func(phone string, connected bool)
}

func NewEventHandler(
	processor *rides.Processor,
	driverCache *drivers.Cache,
	waMgr *Manager,
	onStatus func(phone string, connected bool),
) *EventHandler {
	return &EventHandler{
		processor:   processor,
		driverCache: driverCache,
		waMgr:       waMgr,
		onStatus:    onStatus,
	}
}

// Handle routes an event from a specific bot phone
func (h *EventHandler) Handle(botPhone string, evt interface{}) {
	switch v := evt.(type) {
	case *events.Message:
		go h.handleMessage(botPhone, v)
	case *events.Connected:
		log.Printf("wa events: %s connected", botPhone)
		if h.onStatus != nil {
			h.onStatus(botPhone, true)
		}
	case *events.Disconnected:
		log.Printf("wa events: %s disconnected", botPhone)
		if h.onStatus != nil {
			h.onStatus(botPhone, false)
		}
	case *events.LoggedOut:
		log.Printf("wa events: %s logged out", botPhone)
		if h.onStatus != nil {
			h.onStatus(botPhone, false)
		}
	}
}

func (h *EventHandler) handleMessage(botPhone string, msg *events.Message) {
	if msg.Info.IsFromMe {
		return
	}
	if time.Since(msg.Info.Timestamp) > 20*time.Second {
		return
	}

	body := msg.Message.GetConversation()
	if msg.Message.GetExtendedTextMessage() != nil {
		body = msg.Message.GetExtendedTextMessage().GetText()
	}
	if body == "" {
		return
	}

	senderPhone := extractPhone(msg)

	// Group messages → process as ride
	if msg.Info.Chat.Server == "g.us" {
		incoming := &rides.IncomingMessage{
			Phone:       botPhone,
			Body:        body,
			MessageID:   msg.Info.ID,
			GroupID:     msg.Info.Chat.String(),
			SenderPhone: senderPhone,
			FromName:    msg.Info.PushName,
			Timestamp:   msg.Info.Timestamp.Unix(),
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		h.processor.ProcessMessage(ctx, incoming)
		return
	}

	// Private messages → driver commands
	go h.handlePrivateMessage(senderPhone, msg.Info.PushName, body)
}

func (h *EventHandler) handlePrivateMessage(senderPhone, fromName, body string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db := h.driverCache.DB()
	bodyLower := strings.ToLower(strings.TrimSpace(body))

	if hasPanavPrefix(bodyLower) {
		kw := extractPanavKeyword(body)
		if kw != "" {
			drivers.SaveKeyword(ctx, db, senderPhone, kw)
			drivers.SetDriverBusy(ctx, db, senderPhone, false)
			h.driverCache.Invalidate(senderPhone)
		}
		return
	}

	if bodyLower == "עסוק" || bodyLower == "busy" {
		drivers.RemoveKeywords(ctx, db, senderPhone)
		drivers.SetDriverBusy(ctx, db, senderPhone, true)
		h.driverCache.Invalidate(senderPhone)
		return
	}

	// Auto register
	d, _ := h.driverCache.GetFromDB(ctx, senderPhone)
	if d == nil {
		drivers.UpsertDriver(ctx, db, senderPhone, fromName)
		log.Printf("wa events: registered new driver %s (%s)", senderPhone, fromName)
	}
}

func hasPanavPrefix(lower string) bool {
	for _, p := range []string{"פנוי ב", "פנויה ב", "available in ", "available at "} {
		if strings.HasPrefix(lower, p) {
			return true
		}
	}
	return false
}

func extractPanavKeyword(body string) string {
	for _, p := range []string{"פנוי ב", "פנויה ב", "available in ", "available at "} {
		lower := strings.ToLower(body)
		if strings.HasPrefix(lower, strings.ToLower(p)) {
			return strings.TrimSpace(body[len(p):])
		}
	}
	return ""
}

func extractPhone(msg *events.Message) string {
	if msg.Info.Chat.Server == "g.us" && msg.Info.SenderAlt.Server == "s.whatsapp.net" {
		return msg.Info.SenderAlt.User
	}
	if msg.Info.Chat.Server == "s.whatsapp.net" {
		return msg.Info.Chat.User
	}
	if msg.Info.Sender.Server == "s.whatsapp.net" {
		return msg.Info.Sender.User
	}
	return msg.Info.Chat.User
}
