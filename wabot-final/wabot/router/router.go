package router

import (
	"net/http"

	"wabot/handlers"

	"github.com/rs/cors"
)

// SetupRoutes configures all the HTTP routes for the WhatsApp bot
func SetupRoutes(handlers *handlers.WhatsAppHandlers) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", handlers.HealthHandler)

	mux.HandleFunc("GET /status", handlers.StatusHandler)

	mux.HandleFunc("GET /sessions", handlers.ListSessionsHandler)

	mux.HandleFunc("POST /send", handlers.SendMessageHandler)

	mux.HandleFunc("POST /pair", handlers.PairWithCodeHandler)

	mux.HandleFunc("GET /groups", handlers.GetAllGroupsHandler)

	mux.HandleFunc("POST /reply-to-group", handlers.ReplyToGroupHandler)

	mux.HandleFunc("POST /reply-private-from-group", handlers.ReplyPrivateFromGroupHandler)

	mux.HandleFunc("POST /send-private-message", handlers.SendPrivateMessageHandler)

	// Send a message to a group by groupId (optionally specify phone)
	mux.HandleFunc("POST /send-message-to-group", handlers.SendMessageToGroupHandler)

	// Get profile picture URL for a phone number
	mux.HandleFunc("GET /profile-picture", handlers.ProfilePictureHandler)

	// Setup CORS
	c := cors.New(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"*"},
	})

	return c.Handler(mux)
}
