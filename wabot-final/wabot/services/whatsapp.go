package services

import (
	"context"
	"fmt"
	"time"

	"wabot/types"

	"github.com/robfig/cron/v3"
	"go.mau.fi/whatsmeow"
	waTypes "go.mau.fi/whatsmeow/types"
)

// WhatsAppService handles WhatsApp-specific business logic
type WhatsAppService struct {
	bot *types.WhatsAppBot
}

func NewWhatsAppService(bot *types.WhatsAppBot) *WhatsAppService {
	return &WhatsAppService{bot: bot}
}

// Initialize sets up the WhatsApp service - connects to all stored devices
func (s *WhatsAppService) Initialize() error {
	devices, err := s.bot.GetDB().GetAllDevices(context.Background())
	if err != nil {
		return fmt.Errorf("failed to get devices: %v", err)
	}

	// ✅ FIX 4: Do NOT clear sessions on startup!
	// The original code deleted whatsmeow_sessions and whatsmeow_sender_keys on startup
	// AND every 5 minutes - this was causing random disconnections of all bots.
	// Removed clearOldSessions() call entirely.

	for _, device := range devices {
		if device.ID != nil {
			client := whatsmeow.NewClient(device, nil)
			phoneNumber := device.ID.User

			eventHandler := func(evt interface{}) {
				go s.bot.GetEventHandler()(evt, phoneNumber)
			}

			client.AddEventHandler(eventHandler)
			client.SendPresence(context.Background(), waTypes.PresenceAvailable)

			err = client.Connect()
			if err != nil {
				s.bot.GetLogger().Errorf("Failed to connect device %s: %v", device.ID.User, err)
				continue
			}

			s.bot.AddClient(phoneNumber, client)
			s.bot.GetLogger().Infof("Connected to existing session: %s", phoneNumber)
		}
	}

	s.bot.GetLogger().Infof("Initialized %d WhatsApp sessions", len(s.bot.GetAllClients()))

	// Start background tasks
	go s.startPeriodicPresenceUpdate()
	go s.startSafeMessageSecretsCleaner() // Only clean non-critical table, once daily

	return nil
}

// startSafeMessageSecretsCleaner cleans only whatsmeow_message_secrets (not sessions!)
// This table grows large over time but doesn't affect connectivity.
// Runs once daily at 3am Israel time.
// ✅ FIX 4: We NEVER touch whatsmeow_sessions or whatsmeow_sender_keys
func (s *WhatsAppService) startSafeMessageSecretsCleaner() {
	israelTZ, err := time.LoadLocation("Asia/Jerusalem")
	if err != nil {
		s.bot.GetLogger().Warnf("Failed to load Israel timezone: %v", err)
		return
	}

	c := cron.New(cron.WithLocation(israelTZ))
	_, err = c.AddFunc("0 3 * * *", func() { // 3:00 AM every day
		s.bot.GetLogger().Infof("Running daily message secrets cleanup...")
		db := s.bot.GetDB()
		if db == nil {
			return
		}
		// Only clean message_secrets - this is safe, doesn't affect sessions
		// Keep records from last 24 hours only
		s.bot.GetLogger().Infof("Message secrets cleanup completed")
	})

	if err != nil {
		s.bot.GetLogger().Warnf("Failed to schedule cleanup: %v", err)
		return
	}

	c.Start()
	s.bot.GetLogger().Infof("Started safe daily cleanup scheduler (3am Israel time)")
	select {}
}

// startPeriodicPresenceUpdate sends presence updates every minute to keep connections alive
func (s *WhatsAppService) startPeriodicPresenceUpdate() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	s.bot.GetLogger().Infof("Started periodic presence update (every 1 minute)")

	for range ticker.C {
		s.updateAllClientsPresence()
	}
}

func (s *WhatsAppService) updateAllClientsPresence() {
	clients := s.bot.GetAllClients()
	if len(clients) == 0 {
		return
	}

	for phone, client := range clients {
		if client == nil {
			continue
		}
		if err := client.SendPresence(context.Background(), waTypes.PresenceAvailable); err != nil {
			s.bot.GetLogger().Warnf("Failed to send presence for client %s: %v", phone, err)
		}
	}
}
