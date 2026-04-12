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
		// Also forward outgoing PRIVATE messages so the app's chat shows
		// messages the user typed directly in WhatsApp on their phone.
		if msg.Info.Chat.Server == "s.whatsapp.net" || msg.Info.Chat.Server == "lid" {
			body := s.getMessageText(msg)
			if body != "" {
				// For from-me messages, the "chat partner" is the recipient (Chat),
				// not the bot itself.
				recipient := msg.Info.Chat.User
				go s.forwardPrivateMessageToServerWithFlag(msg, recipient, botPhone, true)
			}
		}
		return
	}

	// Global deduplication — only ONE forwarding per message regardless of
	// how many users are members of the group. The server-side matching
	// iterates over every user who's a member of the group and checks their
	// keywords individually, so duplicate forwards are wasteful.
	if s.redisService != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		dedupeKey := "wa:msg:seen:" + msg.Info.ID
		acquired, err := s.redisService.GetClient().SetNX(ctx, dedupeKey, botPhone, 30*time.Second).Result()
		if err == nil && !acquired {
			s.bot.GetLogger().Debugf("Message %s already forwarded by another user, skipping (user: %s)", msg.Info.ID, botPhone)
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
	// Group messages: prefer SenderAlt (real phone) over Sender (which may be a LID)
	if msg.Info.Chat.Server == "g.us" && msg.Info.SenderAlt.Server == "s.whatsapp.net" {
		return msg.Info.SenderAlt.User
	}
	// Private chats with a real phone number
	if msg.Info.Chat.Server == "s.whatsapp.net" {
		return msg.Info.Chat.User
	}
	if msg.Info.Sender.Server == "s.whatsapp.net" {
		return msg.Info.Sender.User
	}
	// Private chats from a LID (linked id) — try to resolve to a real phone
	if msg.Info.SenderAlt.Server == "s.whatsapp.net" {
		return msg.Info.SenderAlt.User
	}
	return msg.Info.Chat.User
}

func (s *WhatsAppHandlers) getMessageText(msg *events.Message) string {
	// Plain conversation
	if t := msg.Message.GetConversation(); t != "" {
		return t
	}
	// Text with link preview
	if et := msg.Message.GetExtendedTextMessage(); et != nil {
		if t := et.GetText(); t != "" {
			return t
		}
	}
	// Image / video / document captions
	if im := msg.Message.GetImageMessage(); im != nil {
		if c := im.GetCaption(); c != "" {
			return c
		}
	}
	if vm := msg.Message.GetVideoMessage(); vm != nil {
		if c := vm.GetCaption(); c != "" {
			return c
		}
	}
	if dm := msg.Message.GetDocumentMessage(); dm != nil {
		if c := dm.GetCaption(); c != "" {
			return c
		}
	}
	// Buttons message (the kind drivebot uses to send rides with action buttons)
	if bm := msg.Message.GetButtonsMessage(); bm != nil {
		if t := bm.GetContentText(); t != "" {
			return t
		}
		if t := bm.GetText(); t != "" {
			return t
		}
	}
	// List message
	if lm := msg.Message.GetListMessage(); lm != nil {
		if t := lm.GetDescription(); t != "" {
			return t
		}
		if t := lm.GetTitle(); t != "" {
			return t
		}
	}
	// Template message (hydrated four-row card)
	if tm := msg.Message.GetTemplateMessage(); tm != nil {
		if h := tm.GetHydratedTemplate(); h != nil {
			if t := h.GetHydratedContentText(); t != "" {
				return t
			}
		}
	}
	// Interactive message (modern WhatsApp business API rich content)
	if im := msg.Message.GetInteractiveMessage(); im != nil {
		if b := im.GetBody(); b != nil {
			if t := b.GetText(); t != "" {
				return t
			}
		}
		if h := im.GetHeader(); h != nil {
			if t := h.GetTitle(); t != "" {
				return t
			}
		}
	}
	// View-once / ephemeral wrapper
	if v := msg.Message.GetEphemeralMessage(); v != nil && v.GetMessage() != nil {
		inner := &events.Message{Message: v.GetMessage()}
		if t := s.getMessageText(inner); t != "" {
			return t
		}
	}
	if v := msg.Message.GetViewOnceMessage(); v != nil && v.GetMessage() != nil {
		inner := &events.Message{Message: v.GetMessage()}
		if t := s.getMessageText(inner); t != "" {
			return t
		}
	}
	if v := msg.Message.GetViewOnceMessageV2(); v != nil && v.GetMessage() != nil {
		inner := &events.Message{Message: v.GetMessage()}
		if t := s.getMessageText(inner); t != "" {
			return t
		}
	}
	// Edited message — extract the edited content
	if em := msg.Message.GetEditedMessage(); em != nil && em.GetMessage() != nil {
		inner := &events.Message{Message: em.GetMessage()}
		if t := s.getMessageText(inner); t != "" {
			return t
		}
	}
	// Highly structured message (legacy template)
	if hs := msg.Message.GetHighlyStructuredMessage(); hs != nil {
		if t := hs.GetHydratedHsm(); t != nil {
			if h := t.GetHydratedTemplate(); h != nil {
				if ct := h.GetHydratedContentText(); ct != "" {
					return ct
				}
			}
		}
	}
	return ""
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
	if msg.Message.GetProtocolMessage() != nil {
		return "protocol"
	}
	if msg.Message.GetButtonsMessage() != nil {
		return "buttons"
	}
	if msg.Message.GetListMessage() != nil {
		return "list"
	}
	if msg.Message.GetTemplateMessage() != nil {
		return "template"
	}
	if msg.Message.GetInteractiveMessage() != nil {
		return "interactive"
	}
	if msg.Message.GetViewOnceMessage() != nil {
		return "view_once"
	}
	if msg.Message.GetViewOnceMessageV2() != nil {
		return "view_once_v2"
	}
	if msg.Message.GetEphemeralMessage() != nil {
		return "ephemeral"
	}
	if msg.Message.GetEditedMessage() != nil {
		return "edited"
	}
	if msg.Message.GetPollCreationMessage() != nil {
		return "poll"
	}
	if msg.Message.GetPollUpdateMessage() != nil {
		return "poll_update"
	}
	if msg.Message.GetHighlyStructuredMessage() != nil {
		return "highly_structured"
	}
	if msg.Message.GetContactsArrayMessage() != nil {
		return "contacts_array"
	}
	if msg.Message.GetLiveLocationMessage() != nil {
		return "live_location"
	}
	if msg.Message.GetGroupInviteMessage() != nil {
		return "group_invite"
	}
	// Log protobuf fields for truly unknown messages
	s.bot.GetLogger().Warnf("[MSG-TYPE-UNKNOWN] msgId=%s proto=%v", msg.Info.ID, msg.Message.ProtoReflect().Descriptor().Fields())
	return "unknown"
}

// forwardPrivateMessageToServer forwards an INCOMING private message to the server
func (s *WhatsAppHandlers) forwardPrivateMessageToServer(msg *events.Message, senderPhone string, botPhone string) {
	s.forwardPrivateMessageToServerWithFlag(msg, senderPhone, botPhone, false)
}

// forwardPrivateMessageToServerWithFlag forwards a private message with an explicit isFromMe flag.
// For incoming messages, partnerPhone is the actual sender. For from-me messages, it is the recipient.
func (s *WhatsAppHandlers) forwardPrivateMessageToServerWithFlag(msg *events.Message, partnerPhone string, botPhone string, isFromMe bool) {
	// If partnerPhone is a LID (Chat.Server == "lid"), try to resolve to a real phone
	if msg.Info.Chat.Server == "lid" || msg.Info.Sender.Server == "lid" {
		client, err := s.bot.GetClient(botPhone)
		if err == nil && client != nil && client.Store != nil && client.Store.LIDs != nil {
			lidJID := msg.Info.Chat
			if lidJID.Server != "lid" && msg.Info.Sender.Server == "lid" {
				lidJID = msg.Info.Sender
			}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			pnJID, lerr := client.Store.LIDs.GetPNForLID(ctx, lidJID)
			cancel()
			if lerr == nil && pnJID.Server == "s.whatsapp.net" && pnJID.User != "" {
				s.bot.GetLogger().Infof("Resolved LID %s -> phone %s", lidJID.User, pnJID.User)
				partnerPhone = pnJID.User
			} else if lerr != nil {
				s.bot.GetLogger().Warnf("Failed to resolve LID %s: %v", lidJID.User, lerr)
			}
		}
	}

	payload := map[string]interface{}{
		"senderPhone": partnerPhone,
		"botPhone":    botPhone,
		"body":        s.getMessageText(msg),
		"messageId":   msg.Info.ID,
		"fromName":    msg.Info.PushName,
		"timestamp":   msg.Info.Timestamp.Unix(),
		"isFromMe":    isFromMe,
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
	s.bot.GetLogger().Debugf("Private message (isFromMe=%v) with %s forwarded to server", isFromMe, partnerPhone)
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
