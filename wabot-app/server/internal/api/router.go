package api

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"

	ws "wabot-app/internal/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func NewRouter(h *Handlers, hub *ws.Hub) http.Handler {
	r := mux.NewRouter()

	// WebSocket endpoint for driver app
	r.HandleFunc("/ws", func(w http.ResponseWriter, req *http.Request) {
		conn, err := upgrader.Upgrade(w, req, nil)
		if err != nil {
			return
		}
		client := ws.NewClient(hub, conn)
		hub.Register(client)
		go client.WritePump()
		go client.ReadPump()
	})

	// WhatsApp bot callbacks
	r.HandleFunc("/api/wa/message", h.HandleIncomingMessage).Methods("POST")
	r.HandleFunc("/api/wa/private-message", h.HandlePrivateMessage).Methods("POST")
	r.HandleFunc("/api/wa/status", h.HandleWAStatus).Methods("GET")
	r.HandleFunc("/api/wa/pair", h.HandlePair).Methods("POST")

	// Drivers
	r.HandleFunc("/api/drivers", h.HandleListDrivers).Methods("GET")
	r.HandleFunc("/api/drivers/{phone}/keywords", h.HandleDriverKeywords).Methods("GET")

	// Areas
	r.HandleFunc("/api/areas/support", h.HandleListSupportAreas).Methods("GET")
	r.HandleFunc("/api/areas/shortcuts", h.HandleListShortcuts).Methods("GET")

	// Rides
	r.HandleFunc("/api/rides/recent", h.HandleRecentRides).Methods("GET")

	// Health
	r.HandleFunc("/health", h.HandleHealth).Methods("GET")

	return CORSMiddleware(r)
}
