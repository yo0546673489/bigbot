package main

import (
	"log"

	"wabot/bot"
)

func main() {
	// Create and run the WhatsApp bot
	botManager, err := bot.NewWhatsAppBotManager()
	if err != nil {
		log.Fatalf("Failed to create WhatsApp bot manager: %v", err)
	}

	if err := botManager.Run(); err != nil {
		log.Fatalf("Failed to run WhatsApp bot: %v", err)
	}
}
