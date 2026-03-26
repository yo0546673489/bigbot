package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"time"

	"wabot/services"
	"wabot/types"

	"go.mau.fi/whatsmeow/types/events"
)

// HandleEvent processes individual events
func (h *WhatsAppHandlers) HandleEvent(eventData *types.EventData) {
	switch eventData.EventType {
	case "Message":
		go h.handleMessageEvent(eventData)
	case "Receipt":
		h.handleReceiptEvent(eventData)
	case "Presence":
		h.handlePresenceEvent(eventData)
	case "Connected":
		h.handleConnectedEvent(eventData)
	case "Disconnected":
		h.handleDisconnectedEvent(eventData)
	case "LoggedOut":
		h.handleLoggedOutEvent(eventData)
	case "GroupInfo":
		h.handleGroupInfoEvent(eventData)
	case "GroupCreated":
		h.handleGroupCreatedEvent(eventData)
	default:
		h.bot.GetLogger().Debugf("Unknown event type: %s", eventData.EventType)
	}
}

func (h *WhatsAppHandlers) handleMessageEvent(eventData *types.EventData) {
	h.handleMessage(eventData.Data.(*events.Message), eventData.BotPhone)
}

func (h *WhatsAppHandlers) handleReceiptEvent(eventData *types.EventData) {
	h.handleReceipt(eventData.Data.(*events.Receipt))
}

func (h *WhatsAppHandlers) handlePresenceEvent(eventData *types.EventData) {
	h.handlePresence(eventData.Data.(*events.Presence))
}

func (h *WhatsAppHandlers) handleConnectedEvent(eventData *types.EventData) {
	h.bot.GetLogger().Infof("Handling connected event for bot %s", eventData.BotPhone)
	groups, err := h.GetAllGroups(eventData.BotPhone)
	if err != nil {
		h.bot.GetLogger().Errorf("Failed to get all groups for bot %s: %v", eventData.BotPhone, err)
		return
	}
	h.bot.GetLogger().Infof("Phone: %s, Groups: %d", eventData.BotPhone, len(*groups))
	go h.forwardConnectionStatusToServer(eventData)
	for _, group := range *groups {
		h.setCachedGroupInfo(h.ctx, group.JID, group)
		go h.forwardGroupInfoToServer(group)
	}
}

func (h *WhatsAppHandlers) handleDisconnectedEvent(eventData *types.EventData) {
	h.bot.GetLogger().Infof("Handling disconnected event for bot %s", eventData.BotPhone)
	go h.forwardConnectionStatusToServer(eventData)
}

func (h *WhatsAppHandlers) handleLoggedOutEvent(eventData *types.EventData) {
	h.bot.GetLogger().Infof("Handling logged out event for bot %s", eventData.BotPhone)
	h.bot.RemoveClient(eventData.BotPhone)
	go h.forwardConnectionStatusToServer(eventData)
}

// handleMessage processes incoming messages
func (s *WhatsAppHandlers) handleMessage(msg *events.Message, botPhone string) {
	if msg.Info.IsFromMe {
		s.handleMessageFromMe(msg, botPhone)
		return
	}

	// ✅ FIX 1: Global deduplication - only ONE bot processes each message
	// Even if 50 bots are in the same group, only one will process the message
	if s.redisService != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		dedupeKey := "wa:msg:seen:" + msg.Info.ID
		acquired, err := s.redisService.GetClient().SetNX(ctx, dedupeKey, botPhone, 30*time.Second).Result()
		if err == nil && !acquired {
			// Another bot instance already processing this message
			s.bot.GetLogger().Debugf("Message %s already being processed, skipping (bot: %s)", msg.Info.ID, botPhone)
			return
		}
	}

	// Check if message timestamp is older than 20 seconds
	cutoffTime := time.Now().Add(-20 * time.Second)
	if msg.Info.Timestamp.Before(cutoffTime) {
		senderPhone := s.extractPhoneFromMessage(msg)
		s.bot.GetLogger().Infof("Ignoring old message from %s, message time: %s, cutoff: %s",
			senderPhone, msg.Info.Timestamp.Format("15:04:05"), cutoffTime.Format("15:04:05"))
		return
	}

	go s.forwardMessageToServerHTTP(msg, s.extractPhoneFromMessage(msg), botPhone)
}

func (s *WhatsAppHandlers) handleReceipt(receipt *events.Receipt) {
	s.bot.GetLogger().Debugf("Message receipt: %s", receipt.MessageIDs)
}

func (s *WhatsAppHandlers) handlePresence(presence *events.Presence) {
	status := "online"
	if presence.Unavailable {
		status = "offline"
	}
	s.bot.GetLogger().Debugf("Presence update: %s is %s", presence.From, status)
}

func (s *WhatsAppHandlers) extractPhoneFromMessage(msg *events.Message) string {
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

func (s *WhatsAppHandlers) getMessageText(msg *events.Message) string {
	body := msg.Message.GetConversation()
	if msg.Message.GetExtendedTextMessage() != nil {
		body = msg.Message.GetExtendedTextMessage().GetText()
	}
	return body
}

func (s *WhatsAppHandlers) getMessageType(msg *events.Message) string {
	if msg.Message.GetConversation() != "" {
		return "conversation"
	}
	if msg.Message.GetExtendedTextMessage() != nil {
		return "extended_text"
	}
	if msg.Message.GetImageMessage() != nil {
		return "image"
	}
	if msg.Message.GetVideoMessage() != nil {
		return "video"
	}
	if msg.Message.GetAudioMessage() != nil {
		return "audio"
	}
	if msg.Message.GetDocumentMessage() != nil {
		return "document"
	}
	if msg.Message.GetStickerMessage() != nil {
		return "sticker"
	}
	if msg.Message.GetLocationMessage() != nil {
		return "location"
	}
	if msg.Message.GetContactMessage() != nil {
		return "contact"
	}
	if msg.Message.GetReactionMessage() != nil {
		return "reaction"
	}
	return "unknown"
}

// forwardPrivateMessageToServer forwards private (non-group) messages to the server
func (s *WhatsAppHandlers) forwardPrivateMessageToServer(msg *events.Message, senderPhone string, botPhone string) {
	payload := map[string]interface{}{
		"senderPhone": senderPhone,
		"botPhone":    botPhone,
		"body":        s.getMessageText(msg),
		"messageId":   msg.Info.ID,
		"fromName":    msg.Info.PushName,
		"timestamp":   msg.Info.Timestamp.Unix(),
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		s.bot.GetLogger().Errorf("Failed to marshal private message: %v", err)
		return
	}

	resp, err := s.bot.GetHTTPClient().Post(
		s.bot.GetConfig().ServerURL+"/api/waweb/"+botPhone+"/private-message",
		"application/json",
		bytes.NewBuffer(jsonData),
	)
	if err != nil {
		s.bot.GetLogger().Debugf("Failed to forward private message to server: %v", err)
		return
	}
	defer resp.Body.Close()
	s.bot.GetLogger().Debugf("Private message from %s forwarded to server", senderPhone)
}

// forwardMessageToServerHTTP forwards messages to the main server via Redis Queue or HTTP fallback
// ✅ FIX 2: Removed time.Sleep(1 second) - group info is cached on Connected event
func (s *WhatsAppHandlers) forwardMessageToServerHTTP(msg *events.Message, senderPhone string, botPhone string) {
	// Forward private messages to a separate endpoint
	if msg.Info.Chat.Server != "g.us" {
		go s.forwardPrivateMessageToServer(msg, senderPhone, botPhone)
		return
	}

	whatsappMsg := &types.WhatsAppMessage{
		Phone:       botPhone,
		Body:        s.getMessageText(msg),
		MessageID:   msg.Info.ID,
		SenderPhone: senderPhone,
		FromName:    msg.Info.PushName,
		Timestamp:   msg.Info.Timestamp.Unix(),
		Type:        s.getMessageType(msg),
		GroupID:     msg.Info.Chat.String(),
	}

	// Get group info from cache (no sleep needed - cached on connect)
	if cachedGroupInfo, err := s.getCachedGroupInfo(s.ctx, msg.Info.Chat.String()); err == nil && cachedGroupInfo != nil {
		whatsappMsg.GroupName = cachedGroupInfo.Name
		participants := make([]string, 0, len(cachedGroupInfo.Participants))
		for _, participant := range cachedGroupInfo.Participants {
			participants = append(participants, strings.Replace(participant.PhoneNumber, "@s.whatsapp.net", "", 1))
		}
		whatsappMsg.Participants = participants
	} else {
		// Cache miss - fetch in background for next time, but still send message
		// This only happens on first message after restart
		go func() {
			groupInfo, err := s.retrieveGroupInfo(msg.Info.Chat, botPhone)
			if err == nil {
				s.setCachedGroupInfo(s.ctx, msg.Info.Chat.String(), groupInfo)
				// Also forward the group info to server
				s.forwardGroupInfoToServer(groupInfo)
			}
		}()
		// Don't drop message - send without participants and let server handle
		// The server has its own participant list
	}

	// Store message in Redis for button responses (non-blocking)
	if s.redisService != nil {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			s.redisService.SetMessage(ctx, msg.Info.ID, botPhone, msg)
		}()
	}

	// ✅ Use Redis BullMQ queue (preferred) or HTTP fallback
	redisQueue := s.bot.GetBullQueue()
	if redisQueue != nil {
		if bullMQQueueService, ok := redisQueue.(*services.BullMQQueueService); ok {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()

			err := bullMQQueueService.AddWhatsAppMessageJob(ctx, whatsappMsg)
			if err != nil {
				s.bot.GetLogger().Errorf("Failed to add message to Redis queue: %v, falling back to HTTP", err)
				s.forwardMessageHTTPFallback(whatsappMsg)
			} else {
				s.bot.GetLogger().Debugf("Message %s added to queue", msg.Info.ID)
			}
			return
		}
	}

	// Fallback to HTTP
	s.forwardMessageHTTPFallback(whatsappMsg)
}

func (s *WhatsAppHandlers) forwardMessageHTTPFallback(whatsappMsg *types.WhatsAppMessage) {
	jsonData, err := json.Marshal(whatsappMsg)
	if err != nil {
		s.bot.GetLogger().Errorf("Failed to marshal message: %v", err)
		return
	}

	resp, err := s.bot.GetHTTPClient().Post(
		s.bot.GetConfig().ServerURL+"/api/waweb/"+whatsappMsg.Phone+"/message",
		"application/json",
		bytes.NewBuffer(jsonData),
	)
	if err != nil {
		s.bot.GetLogger().Infof("Failed to forward message via HTTP: %v", err)
		return
	}
	defer resp.Body.Close()
}

func (s *WhatsAppHandlers) forwardGroupInfoToServer(group types.GroupInfo) {
	jsonData, err := json.Marshal(group)
	if err != nil {
		s.bot.GetLogger().Errorf("Failed to marshal group info: %v", err)
		return
	}

	resp, err := s.bot.GetHTTPClient().Post(
		s.bot.GetConfig().ServerURL+"/api/waweb/group",
		"application/json",
		bytes.NewBuffer(jsonData),
	)
	if err != nil {
		s.bot.GetLogger().Errorf("Failed to forward group info to server: %v", err)
		return
	}
	defer resp.Body.Close()
}

func (s *WhatsAppHandlers) forwardConnectionStatusToServer(event *types.EventData) {
	resp, err := s.bot.GetHTTPClient().Post(
		s.bot.GetConfig().ServerURL+"/api/waweb/whatsapp-status/"+event.BotPhone,
		"application/json",
		bytes.NewBuffer([]byte("{\"event\":\""+event.EventType+"\"}")),
	)
	if err != nil {
		s.bot.GetLogger().Errorf("Failed to forward connection status to server: %v", err)
		return
	}
	defer resp.Body.Close()
}
