package whatsapp

import (
	"context"
	"fmt"
	"log"

	waProto "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"
)

// GetBotPhone returns the primary bot phone
func (m *Manager) GetBotPhone() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for phone := range m.clients {
		return phone
	}
	return ""
}

// SendGroupReply sends a quoted reply to a group
func (m *Manager) SendGroupReply(ctx context.Context, botPhone, groupID, quotedMsgID, text string) error {
	client := m.getClient(botPhone)
	if client == nil {
		return fmt.Errorf("bot %s not connected", botPhone)
	}

	jid, err := types.ParseJID(groupID)
	if err != nil {
		return fmt.Errorf("invalid group JID: %w", err)
	}

	// Clean quoted message - no MentionedJid to avoid tagging everyone
	cleanQuoted := &waProto.Message{
		Conversation: proto.String(text),
	}

	msg := &waProto.Message{
		ExtendedTextMessage: &waProto.ExtendedTextMessage{
			Text: proto.String(text),
			ContextInfo: &waProto.ContextInfo{
				StanzaID:      proto.String(quotedMsgID),
				QuotedMessage: cleanQuoted,
			},
		},
	}

	_, err = client.SendMessage(ctx, jid, msg)
	if err != nil {
		log.Printf("wa sender: failed to send group reply: %v", err)
	}
	return err
}

// SendPrivateMessage sends a private message to a phone number
func (m *Manager) SendPrivateMessage(ctx context.Context, botPhone, toPhone, text string) error {
	client := m.getClient(botPhone)
	if client == nil {
		return fmt.Errorf("bot %s not connected", botPhone)
	}

	jid, err := types.ParseJID(toPhone + "@s.whatsapp.net")
	if err != nil {
		return fmt.Errorf("invalid JID for %s: %w", toPhone, err)
	}

	msg := &waProto.Message{
		Conversation: proto.String(text),
	}

	_, err = client.SendMessage(ctx, jid, msg)
	if err != nil {
		log.Printf("wa sender: failed to send private message to %s: %v", toPhone, err)
	}
	return err
}

// SendLinkAction sends the extracted link text to the rider bot
func (m *Manager) SendLinkAction(ctx context.Context, botPhone, toPhone, text string) error {
	return m.SendPrivateMessage(ctx, botPhone, toPhone, text)
}
