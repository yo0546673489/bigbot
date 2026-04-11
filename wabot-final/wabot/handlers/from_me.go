package handlers

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/url"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	waTypes "go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
)

// getTextFromMessage extracts plain text from any message type
// Used to create clean QuotedMessage without MentionedJids
func getTextFromMessage(msg *waE2E.Message) string {
	if msg == nil {
		return ""
	}
	if conv := msg.GetConversation(); conv != "" {
		return conv
	}
	if ext := msg.GetExtendedTextMessage(); ext != nil {
		return ext.GetText()
	}
	return ""
}

// handleMessageFromMe handles messages from the bot itself (button responses)
func (s *WhatsAppHandlers) handleMessageFromMe(msg *events.Message, botPhone string) {
	// Handle button response messages
	if buttonsResponse := msg.Message.GetButtonsResponseMessage(); buttonsResponse != nil {
		selectedButtonID := buttonsResponse.GetSelectedButtonID()
		selectedDisplayText := buttonsResponse.GetSelectedDisplayText()

		if selectedButtonID == "" {
			return
		}

		s.bot.GetLogger().Debugf("Selected button ID: %s", selectedButtonID)

		// Handle driver response to group (reply with quote)
		if strings.HasPrefix(selectedButtonID, "driverResponseToGroupButton_") ||
			strings.HasPrefix(selectedButtonID, "driverResponseToGroupButton2_") ||
			strings.HasPrefix(selectedButtonID, "driverResponseToGroupButton3_") {
			parts := strings.Split(selectedButtonID, "_")
			if len(parts) >= 3 {
				groupId := parts[1]
				messageId := parts[2]
				s.sendReplyToGroup(botPhone, groupId, messageId, selectedDisplayText)
			}
			return
		}

		// Handle driver response private from group button
		if strings.HasPrefix(selectedButtonID, "driverResponsePrivateFromGroupButton_") {
			parts := strings.Split(selectedButtonID, "_")
			if len(parts) >= 3 {
				groupId := parts[1]
				messageId := parts[2]
				s.handleDriverResponsePrivateFromGroup(botPhone, groupId, messageId, "ת")
			}
			return
		}

		// Handle send private message button
		if strings.HasPrefix(selectedButtonID, "sendPrivateMessageButton_") {
			parts := strings.Split(selectedButtonID, "_")
			if len(parts) >= 3 {
				phoneNumber := parts[1]
				privateMessageBase64 := parts[2]
				s.handleSendPrivateMessage(botPhone, phoneNumber, privateMessageBase64)
			}
			return
		}

		return
	}

	// Handle extended text messages with quoted button messages
	if extendedText := msg.Message.GetExtendedTextMessage(); extendedText != nil {
		text := extendedText.GetText()
		if contextInfo := extendedText.GetContextInfo(); contextInfo != nil {
			if quotedMessage := contextInfo.GetQuotedMessage(); quotedMessage != nil {
				if buttonsMessage := quotedMessage.GetButtonsMessage(); buttonsMessage != nil {
					for _, button := range buttonsMessage.GetButtons() {
						buttonID := button.GetButtonID()
						if strings.HasPrefix(buttonID, "driverResponseToGroupButton_") {
							parts := strings.Split(buttonID, "_")
							if len(parts) >= 3 {
								groupId := parts[1]
								messageId := parts[2]
								s.sendReplyToGroup(botPhone, groupId, messageId, text)
							}
							return
						}
					}
				}
			}
		}
	}

	// Handle special commands
	text := msg.Message.GetConversation()
	if extendedText := msg.Message.GetExtendedTextMessage(); extendedText != nil {
		if text == "" {
			text = extendedText.GetText()
		}
	}

	if text == "#clearChat" {
		s.handleClearChat(msg, botPhone)
	}
}

// handleDriverResponsePrivateFromGroup handles driver "ת לפרטי" button press
func (s *WhatsAppHandlers) handleDriverResponsePrivateFromGroup(botPhone, groupId, messageId, displayText string) {
	s.bot.GetLogger().Infof("Driver response private from group: groupId=%s, messageId=%s", groupId, messageId)

	client, err := s.bot.GetClient(botPhone)
	if err != nil {
		s.bot.GetLogger().Errorf("Failed to get client for phone %s: %v", botPhone, err)
		return
	}

	if s.redisService == nil {
		s.bot.GetLogger().Errorf("Redis service not available")
		return
	}

	messageStore, err := s.redisService.GetMessage(context.Background(), messageId, botPhone)
	if err != nil {
		s.bot.GetLogger().Errorf("Failed to get message from Redis: %v", err)
		return
	}

	targetPhoneNumber := s.extractPhoneFromStoredMessage(messageStore)
	if targetPhoneNumber == "" {
		s.bot.GetLogger().Errorf("Failed to extract phone number from stored message")
		return
	}

	err = s.sendPrivateQuotedReplyToUser(client, targetPhoneNumber, displayText, groupId, messageId, botPhone)
	if err != nil {
		s.bot.GetLogger().Errorf("Failed to send private quoted reply to %s: %v", targetPhoneNumber, err)
		return
	}
	s.bot.GetLogger().Infof("Private quoted reply sent successfully to %s", targetPhoneNumber)
}

// extractPhoneFromStoredMessage extracts phone number from a stored message
func (s *WhatsAppHandlers) extractPhoneFromStoredMessage(msg interface{}) string {
	type msgWithInfo interface {
		GetInfo() interface{}
	}
	// Use the same events.Message type
	if storedMsg, ok := msg.(*events.Message); ok {
		if storedMsg.Info.Chat.Server == "g.us" && storedMsg.Info.SenderAlt.Server == "s.whatsapp.net" {
			return storedMsg.Info.SenderAlt.User
		}
		if storedMsg.Info.Sender.Server == "s.whatsapp.net" {
			return storedMsg.Info.Sender.User
		}
		if storedMsg.Info.Chat.Server == "s.whatsapp.net" {
			return storedMsg.Info.Chat.User
		}
	}
	return ""
}

func (s *WhatsAppHandlers) sendPrivateMessageToUser(client *whatsmeow.Client, phoneNumber, text string) error {
	cleanPhone := cleanPhoneNumber(phoneNumber)
	if len(cleanPhone) < 10 {
		return fmt.Errorf("phone number too short: %s", phoneNumber)
	}

	targetJID, err := waTypes.ParseJID(cleanPhone + "@s.whatsapp.net")
	if err != nil {
		return fmt.Errorf("invalid phone number JID: %v", err)
	}

	message := &waE2E.Message{
		Conversation: proto.String(text),
	}

	resp, err := client.SendMessage(context.Background(), targetJID, message)
	if err != nil {
		return fmt.Errorf("failed to send message: %v", err)
	}

	s.bot.GetLogger().Debugf("Private message sent, response ID: %s", resp.ID)
	return nil
}

// sendPrivateQuotedReplyToUser sends a private message as a quoted reply
func (s *WhatsAppHandlers) sendPrivateQuotedReplyToUser(client *whatsmeow.Client, targetPhoneNumber, text, groupId, messageId, botPhone string) error {
	cleanPhone := cleanPhoneNumber(targetPhoneNumber)
	if len(cleanPhone) < 10 {
		return fmt.Errorf("phone number too short: %s", targetPhoneNumber)
	}

	targetJID, err := waTypes.ParseJID(cleanPhone + "@s.whatsapp.net")
	if err != nil {
		return fmt.Errorf("invalid phone number JID: %v", err)
	}

	if s.redisService == nil {
		return fmt.Errorf("redis service not available")
	}

	messageStore, err := s.redisService.GetMessage(context.Background(), messageId, botPhone)
	if err != nil {
		return fmt.Errorf("failed to get message from Redis: %v", err)
	}

	// ✅ FIX 3: Clean QuotedMessage - only text, no MentionedJids!
	// The original messageStore.Message contains MentionedJid which causes
	// WhatsApp to tag ALL those people in the group. We only keep the text.
	originalText := getTextFromMessage(messageStore.Message)
	cleanQuotedMsg := &waE2E.Message{
		Conversation: proto.String(originalText),
		// ✅ No MentionedJid, no ContextInfo - just clean text
	}

	message := &waE2E.Message{
		ExtendedTextMessage: &waE2E.ExtendedTextMessage{
			Text: proto.String(text),
			ContextInfo: &waE2E.ContextInfo{
				RemoteJID:     proto.String(groupId),
				StanzaID:      proto.String(messageId),
				QuotedMessage: cleanQuotedMsg, // ✅ Clean - no tags!
			},
		},
	}

	resp, err := client.SendMessage(context.Background(), targetJID, message)
	if err != nil {
		return fmt.Errorf("failed to send quoted reply: %w", err)
	}

	s.bot.GetLogger().Debugf("Private quoted reply sent, response ID: %s", resp.ID)
	return nil
}

// sendReplyToGroup sends a quoted reply to a group
// ✅ FIX 3 applied here too: clean QuotedMessage without MentionedJids
func (s *WhatsAppHandlers) sendReplyToGroup(botPhone, groupId, messageId, displayText string) {
	t0 := time.Now()
	s.bot.GetLogger().Infof("Sending reply to group: groupId=%s, messageId=%s", groupId, messageId)

	client, err := s.bot.GetClient(botPhone)
	if err != nil {
		s.bot.GetLogger().Errorf("Failed to get client for phone %s: %v", botPhone, err)
		return
	}

	if !strings.Contains(groupId, "@g.us") {
		s.bot.GetLogger().Warnf("Invalid group ID (missing @g.us): %s", groupId)
		return
	}

	jid, err := waTypes.ParseJID(groupId)
	if err != nil {
		s.bot.GetLogger().Errorf("Invalid group JID: %v", err)
		return
	}

	// Try to load the original message for a clean quoted reply, but don't
	// block on Redis: if it's missing (different bot won the dedup race and
	// hasn't pushed to the global key yet), fall back to sending a plain
	// text "ת" so the user doesn't wait for the round-trip.
	var contextInfo *waE2E.ContextInfo
	if s.redisService != nil {
		messageStore, err := s.redisService.GetMessage(context.Background(), messageId, botPhone)
		if err == nil && messageStore != nil {
			originalText := getTextFromMessage(messageStore.Message)
			cleanQuotedMsg := &waE2E.Message{
				Conversation: proto.String(originalText),
			}
			// Participant is required for quoted replies in groups — WhatsApp
			// won't render the quote bubble without the sender's JID.
			var participant *string
			if messageStore.Info.Sender.User != "" {
				p := messageStore.Info.Sender.String()
				participant = &p
			}
			contextInfo = &waE2E.ContextInfo{
				StanzaID:      proto.String(messageId),
				Participant:   participant,
				RemoteJID:     proto.String(groupId),
				QuotedMessage: cleanQuotedMsg,
			}
		} else if err != nil {
			s.bot.GetLogger().Warnf("sendReplyToGroup: message %s not in Redis (%v) — sending plain text", messageId, err)
		}
	}
	tRedis := time.Now()

	message := &waE2E.Message{
		ExtendedTextMessage: &waE2E.ExtendedTextMessage{
			Text:        proto.String(displayText),
			ContextInfo: contextInfo, // nil = plain text, not nil = quoted reply
		},
	}

	resp, err := client.SendMessage(context.Background(), jid, message)
	if err != nil {
		s.bot.GetLogger().Errorf("Failed to send quoted message to group: %v", err)
		return
	}
	tSend := time.Now()

	s.bot.GetLogger().Infof("Reply sent to group %s: %s (redis=%dms send=%dms total=%dms)",
		groupId, resp.ID,
		tRedis.Sub(t0).Milliseconds(),
		tSend.Sub(tRedis).Milliseconds(),
		tSend.Sub(t0).Milliseconds(),
	)
}

func (s *WhatsAppHandlers) handleSendPrivateMessage(botPhone, phoneNumber, privateMessageBase64 string) {
	var text string
	if strings.HasPrefix(privateMessageBase64, "BASE64") {
		decodedBytes, err := base64.StdEncoding.DecodeString(
			strings.TrimPrefix(privateMessageBase64, "BASE64"))
		if err != nil {
			s.bot.GetLogger().Errorf("Failed to decode base64 message: %v", err)
			return
		}
		text, err = url.QueryUnescape(string(decodedBytes))
		if err != nil {
			s.bot.GetLogger().Errorf("Failed to unescape message: %v", err)
			return
		}
	}

	if text == "" {
		s.bot.GetLogger().Warnf("Empty text after decoding private message")
		return
	}

	client, err := s.bot.GetClient(botPhone)
	if err != nil {
		s.bot.GetLogger().Errorf("Failed to get client for phone %s: %v", botPhone, err)
		return
	}

	err = s.sendPrivateMessageToUser(client, phoneNumber, text)
	if err != nil {
		s.bot.GetLogger().Errorf("Failed to send private message to %s: %v", phoneNumber, err)
	}
}

func (s *WhatsAppHandlers) handleClearChat(msg *events.Message, botPhone string) {
	client, err := s.bot.GetClient(botPhone)
	if err != nil {
		s.bot.GetLogger().Errorf("Failed to get client for phone %s: %v", botPhone, err)
		return
	}

	jid := msg.Info.Chat

	if msg.Info.IsGroup {
		client.MarkRead(context.Background(), []waTypes.MessageID{msg.Info.ID}, time.Now(), jid, msg.Info.Sender)
	} else {
		client.MarkRead(context.Background(), []waTypes.MessageID{msg.Info.ID}, time.Now(), jid, jid)
	}

	s.bot.GetLogger().Infof("Clear chat command received for: %s", jid.User)
}

// cleanPhoneNumber removes non-digit characters from a phone number
func cleanPhoneNumber(phoneNumber string) string {
	result := make([]byte, 0, len(phoneNumber))
	for _, c := range phoneNumber {
		if c >= '0' && c <= '9' {
			result = append(result, byte(c))
		}
	}
	return string(result)
}
