package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"

	"wabot/services"
	"wabot/types"
)

// WhatsAppHandlers contains all the HTTP handlers for the WhatsApp bot
type WhatsAppHandlers struct {
	bot          *types.WhatsAppBot
	ctx          context.Context
	cancel       context.CancelFunc
	redisService *services.RedisService // Redis service for caching

	// Debouncing for group info cache updates
	cacheUpdateTimers map[string]*time.Timer
	cacheUpdateMutex  sync.RWMutex

	// Rate limiting for group info requests
	lastGroupInfoRequest time.Time
	groupInfoMutex       sync.Mutex
}

// NewWhatsAppHandlers creates a new instance of WhatsAppHandlers
func NewWhatsAppHandlers(bot *types.WhatsAppBot) (*WhatsAppHandlers, error) {
	ctx, cancel := context.WithCancel(context.Background())

	// Initialize Redis service
	redisService, err := services.NewRedisService(bot.GetConfig(), bot.GetLogger())
	if err != nil {
		bot.GetLogger().Warnf("Failed to initialize Redis service: %v - continuing without Redis caching", err)
		// Continue without Redis - make it optional
		redisService = nil
	}

	handlers := &WhatsAppHandlers{
		bot:               bot,
		ctx:               ctx,
		cancel:            cancel,
		redisService:      redisService,
		cacheUpdateTimers: make(map[string]*time.Timer),
	}

	return handlers, nil
}

// getCachedGroupInfo retrieves group info from Redis cache
func (h *WhatsAppHandlers) getCachedGroupInfo(ctx context.Context, groupID string) (*types.GroupInfo, error) {
	if h.redisService == nil {
		return nil, fmt.Errorf("Redis service not available")
	}

	// Use a short timeout to prevent blocking
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	info, err := h.redisService.GetGroupInfo(ctx, groupID)
	if err != nil {
		h.bot.GetLogger().Debugf("Failed to get cached group info for %s: %v", groupID, err)
		return nil, err
	}
	return info, nil
}

// setCachedGroupInfo stores group info in Redis cache
func (h *WhatsAppHandlers) setCachedGroupInfo(ctx context.Context, groupID string, info types.GroupInfo) error {
	if h.redisService == nil {
		return fmt.Errorf("Redis service not available")
	}

	// Use a short timeout to prevent blocking
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	err := h.redisService.SetGroupInfo(ctx, groupID, info)
	if err != nil {
		h.bot.GetLogger().Debugf("Failed to cache group info for %s: %v", groupID, err)
		return err
	}
	return nil
}

// rateLimitGroupInfoRequest implements rate limiting for group info requests
func (h *WhatsAppHandlers) rateLimitGroupInfoRequest() bool {
	h.groupInfoMutex.Lock()
	defer h.groupInfoMutex.Unlock()

	// Rate limit: minimum 2 seconds between requests
	now := time.Now()
	if now.Sub(h.lastGroupInfoRequest) < 2*time.Second {
		h.bot.GetLogger().Debugf("Rate limiting group info request (last request was %v ago)", now.Sub(h.lastGroupInfoRequest))
		return false
	}

	h.lastGroupInfoRequest = now
	return true
}

// setCachedGroupInfoDebounced stores group info in Redis cache with 3-second debouncing
func (h *WhatsAppHandlers) setCachedGroupInfoDebounced(ctx context.Context, groupID string, info types.GroupInfo) {
	h.cacheUpdateMutex.Lock()
	defer h.cacheUpdateMutex.Unlock()

	// If there's already a pending timer for this group, stop it
	if existingTimer, exists := h.cacheUpdateTimers[groupID]; exists {
		existingTimer.Stop()
	}

	// Create a new timer that will execute after 4 seconds
	timer := time.AfterFunc(4*time.Second, func() {
		// Execute the cache update
		err := h.setCachedGroupInfo(ctx, groupID, info)
		if err != nil {
			h.bot.GetLogger().Warnf("Failed to update cache for group %s: %v", groupID, err)
		} else {
			h.bot.GetLogger().Debugf("Debounced cache update completed for group %s", groupID)
		}

		// Clean up the timer from the map
		h.cacheUpdateMutex.Lock()
		delete(h.cacheUpdateTimers, groupID)
		h.cacheUpdateMutex.Unlock()
	})

	// Store the timer in the map
	h.cacheUpdateTimers[groupID] = timer

	h.bot.GetLogger().Debugf("Scheduled debounced cache update for group %s in 3 seconds", groupID)
}

// HealthHandler handles health check requests
func (h *WhatsAppHandlers) HealthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(types.HealthResponse{Status: "healthy"})
}

// StatusHandler handles WhatsApp status requests
func (h *WhatsAppHandlers) StatusHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Get status of all sessions
	var sessions []types.SessionStatus

	for phone, client := range h.bot.GetAllClients() {
		session := types.SessionStatus{
			Phone:     phone,
			IsHealthy: client.IsConnected(),
		}

		sessions = append(sessions, session)
	}

	json.NewEncoder(w).Encode(sessions)
}

// ListSessionsHandler handles requests to list all sessions
func (h *WhatsAppHandlers) ListSessionsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var sessions []map[string]interface{}

	for phone, client := range h.bot.GetAllClients() {
		session := map[string]interface{}{
			"phone":     phone,
			"connected": client.IsConnected(),
			"status":    "disconnected",
		}

		if client.IsConnected() {
			session["status"] = "connected"
		}

		sessions = append(sessions, session)
	}

	response := map[string]interface{}{
		"total_sessions": len(sessions),
		"sessions":       sessions,
	}

	json.NewEncoder(w).Encode(response)
}

// SendMessageHandler handles requests to send messages
func (h *WhatsAppHandlers) SendMessageHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req types.MessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(types.MessageResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	if req.FromPhone == "" || req.ToPhone == "" || req.Message == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(types.MessageResponse{
			Success: false,
			Message: "FromPhone, ToPhone, and Message are required",
		})
		return
	}

	// Get client for the sender phone number
	client, err := h.bot.GetClient(req.FromPhone)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(types.MessageResponse{
			Success: false,
			Message: fmt.Sprintf("No WhatsApp session found for: %s", req.FromPhone),
		})
		return
	}

	// Parse recipient phone number - ensure it's in the correct format
	phoneNumber := req.ToPhone
	if phoneNumber[0] == '+' {
		phoneNumber = phoneNumber[1:] // Remove + if present
	}

	// Add @s.whatsapp.net suffix for proper JID parsing
	jidString := phoneNumber + "@s.whatsapp.net"
	h.bot.GetLogger().Infof("Parsing recipient phone number: %s -> %s", req.ToPhone, jidString)
	recipient, err := h.bot.ParseJID(jidString)
	if err != nil {
		h.bot.GetLogger().Errorf("Failed to parse recipient phone number '%s': %v", jidString, err)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(types.MessageResponse{
			Success: false,
			Message: "Invalid recipient phone number format",
		})
		return
	}

	h.bot.GetLogger().Infof("Successfully parsed recipient JID: %v", recipient)

	// Send message
	msg := &waE2E.Message{
		Conversation: proto.String(req.Message),
	}

	resp, err := client.SendMessage(context.Background(), recipient, msg)
	if err != nil {
		h.bot.GetLogger().Errorf("Failed to send message from %s to %s: %v", req.FromPhone, req.ToPhone, err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(types.MessageResponse{
			Success: false,
			Message: "Failed to send message",
		})
		return
	}

	json.NewEncoder(w).Encode(types.MessageResponse{
		Success: true,
		Message: "Message sent successfully",
		ID:      resp.ID,
	})
}

// PairWithCodeHandler handles requests to pair with a phone number
func (h *WhatsAppHandlers) PairWithCodeHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req types.PairRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid request body",
		})
		return
	}

	if req.Phone == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Phone number is required",
		})
		return
	}

	clientExisted, exists := h.bot.GetAllClients()[req.Phone]
	// Check if already paired
	if exists {
		if clientExisted.IsLoggedIn() {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error": fmt.Sprintf("Already paired with phone: %s", req.Phone),
			})
			return
		}
		h.bot.DeleteClient(req.Phone)
	}

	// Parse phone number - ensure it's in the correct format
	phoneNumber := req.Phone
	if phoneNumber[0] == '+' {
		phoneNumber = phoneNumber[1:] // Remove + if present
	}

	// Add @s.whatsapp.net suffix for proper JID parsing
	jidString := phoneNumber + "@s.whatsapp.net"
	h.bot.GetLogger().Infof("Parsing phone number: %s -> %s", req.Phone, jidString)
	recipient, err := h.bot.ParseJID(jidString)
	if err != nil {
		h.bot.GetLogger().Errorf("Failed to parse phone number '%s': %v", jidString, err)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Invalid phone number format",
		})
		return
	}

	h.bot.GetLogger().Infof("Successfully parsed JID: %v", recipient)

	// Create new device store for this phone number
	deviceStore := h.bot.GetDB().NewDevice()

	// Create client and connect to get pairing code
	client := whatsmeow.NewClient(deviceStore, waLog.Stdout("WhatsApp", "DEBUG", true))
	eventHandler := func(evt interface{}) {
		h.bot.GetEventHandler()(evt, phoneNumber)
	}
	client.AddEventHandler(eventHandler)

	err = client.Connect()
	if err != nil {
		h.bot.GetLogger().Errorf("Failed to connect: %v", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to connect to WhatsApp",
		})
		return
	}

	// Wait for connection to stabilize before requesting pairing code
	time.Sleep(5 * time.Second)

	// Request pairing code using the original phone number
	pairCode, err := client.PairPhone(context.Background(), phoneNumber, true, whatsmeow.PairClientChrome, "Chrome (Linux)")
	if err != nil {
		h.bot.GetLogger().Errorf("Failed to request pairing code: %v", err)
		h.bot.GetLogger().Errorf("phone number: %s", phoneNumber)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to request pairing code",
		})
		return
	}

	// Store the client temporarily (will be moved to clients map after successful pairing)
	h.bot.AddClient(req.Phone, client)

	// Event processing is now handled directly in the event handlers

	h.bot.GetLogger().Infof("Pairing code requested for %s: %s", req.Phone, pairCode)
	json.NewEncoder(w).Encode(map[string]string{
		"message":      "Pairing code requested successfully",
		"phone":        req.Phone,
		"code":         strings.ReplaceAll(pairCode, "-", ""),
		"instructions": "Enter this code in your WhatsApp app to complete pairing",
	})
}

func (h *WhatsAppHandlers) GetAllGroupsHandler(w http.ResponseWriter, r *http.Request) {
	groups, err := h.GetAllGroups(r.URL.Query().Get("phone"))
	if err != nil {
		h.bot.GetLogger().Errorf("Failed to get all groups: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(groups)
}

func (h *WhatsAppHandlers) ReplyToGroupHandler(w http.ResponseWriter, r *http.Request) {
	var req types.ReplyToGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.bot.GetLogger().Errorf("Failed to decode request body: %v", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	h.sendReplyToGroup(req.Phone, req.GroupId, req.MessageId, req.Text)
}

func (h *WhatsAppHandlers) ReplyPrivateFromGroupHandler(w http.ResponseWriter, r *http.Request) {
	var req types.ReplyPrivateFromGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.bot.GetLogger().Errorf("Failed to decode request body: %v", err)
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	client, err := h.bot.GetClient(req.Phone)
	if err != nil {
		h.bot.GetLogger().Errorf("Failed to get client: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	h.sendPrivateQuotedReplyToUser(client, req.PhoneNumber, req.Text, req.GroupId, req.MessageId, req.Phone)
	json.NewEncoder(w).Encode(types.MessageResponse{
		Success: true,
		Message: "Message sent successfully",
	})
}

// SendPrivateMessageHandler handles requests to send messages
func (h *WhatsAppHandlers) SendPrivateMessageHandler(w http.ResponseWriter, r *http.Request) {
	var req types.SendPrivateMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(types.MessageResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	if req.Phone == "" || req.PhoneNumber == "" || req.Message == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(types.MessageResponse{
			Success: false,
			Message: "Phone, PhoneNumber, and Message are required",
		})
		return
	}

	// Get client for the sender phone number
	client, err := h.bot.GetClient(req.Phone)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(types.MessageResponse{
			Success: false,
			Message: fmt.Sprintf("No WhatsApp session found for: %s", req.Phone),
		})
		return
	}

	// Parse recipient phone number - ensure it's in the correct format
	phoneNumber := req.PhoneNumber
	if phoneNumber[0] == '+' {
		phoneNumber = phoneNumber[1:] // Remove + if present
	}

	// Add @s.whatsapp.net suffix for proper JID parsing
	jidString := phoneNumber + "@s.whatsapp.net"
	h.bot.GetLogger().Infof("Parsing recipient phone number: %s -> %s", req.PhoneNumber, jidString)
	_, err = h.bot.ParseJID(jidString)
	if err != nil {
		h.bot.GetLogger().Errorf("Failed to parse recipient phone number '%s': %v", jidString, err)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(types.MessageResponse{
			Success: false,
			Message: fmt.Sprintf("Invalid recipient phone number: %s", req.PhoneNumber),
		})
		return
	}

	h.sendPrivateMessageToUser(client, req.PhoneNumber, req.Message)
	json.NewEncoder(w).Encode(types.MessageResponse{
		Success: true,
		Message: "Message sent successfully",
	})
}

// SendMessageToGroupHandler handles requests to send a message to a group by ID
func (h *WhatsAppHandlers) SendMessageToGroupHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req types.SendMessageToGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(types.MessageResponse{
			Success: false,
			Message: "Invalid request body",
		})
		return
	}

	if req.GroupId == "" || req.Message == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(types.MessageResponse{
			Success: false,
			Message: "GroupId and Message are required",
		})
		h.bot.GetLogger().Infof("GroupId and Message are required")
		return
	}

	// Require phone and get client
	if req.Phone == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(types.MessageResponse{
			Success: false,
			Message: "Phone is required",
		})
		h.bot.GetLogger().Infof("Phone is required")
		return
	}
	client, err := h.bot.GetClient(req.Phone)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(types.MessageResponse{
			Success: false,
			Message: fmt.Sprintf("No WhatsApp session found for: %s", req.Phone),
		})
		return
	}

	// Build JID for group (must end with @g.us)
	groupJIDStr := req.GroupId
	if !strings.Contains(groupJIDStr, "@g.us") {
		groupJIDStr = groupJIDStr + "@g.us"
	}
	jid, err := h.bot.ParseJID(groupJIDStr)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(types.MessageResponse{
			Success: false,
			Message: "Invalid group id",
		})
		h.bot.GetLogger().Infof("Invalid group id: %s", groupJIDStr)
		return
	}

	// Create and send message
	msg := &waE2E.Message{Conversation: proto.String(req.Message)}
	resp, err := client.SendMessage(context.Background(), jid, msg)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(types.MessageResponse{
			Success: false,
			Message: "Failed to send message to group",
		})
		h.bot.GetLogger().Infof("Failed to send message to group %s: %v", req.GroupId, err)
		return
	}

	json.NewEncoder(w).Encode(types.MessageResponse{
		Success: true,
		Message: "Message sent successfully",
		ID:      resp.ID,
	})
}
