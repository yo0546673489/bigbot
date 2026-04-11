package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"database/sql"

	"github.com/mattn/go-sqlite3"

	"wabot-app/internal/api"
	"wabot-app/internal/config"
	"wabot-app/internal/db"
	"wabot-app/internal/drivers"
	"wabot-app/internal/rides"
	ws "wabot-app/internal/websocket"
	"wabot-app/internal/whatsapp"
)

func init() {
	sql.Register("sqlite3_fk", &sqlite3.SQLiteDriver{
		ConnectHook: func(conn *sqlite3.SQLiteConn) error {
			_, err := conn.Exec("PRAGMA foreign_keys = ON", nil)
			return err
		},
	})
}

func main() {
	cfg := config.Load()

	// Init databases
	rdb := db.NewRedis(cfg.RedisURL)
	mongoDB := db.NewMongo(cfg.MongoURI, cfg.MongoDB)

	// Init components
	dedup := rides.NewDeduplicator(rdb)
	driverCache := drivers.NewCache(rdb, mongoDB)

	// WebSocket Hub (created before waMgr so we can reference it in callbacks)
	var hub *ws.Hub
	var waMgr *whatsapp.Manager
	var evtHandler *whatsapp.EventHandler

	// Ride processor — sends ride to driver via WebSocket
	processor := rides.NewProcessor(
		dedup,
		driverCache,
		rdb,
		mongoDB,
		cfg.SpecialGroup,
		func(driverPhone string, ride *rides.Ride) {
			if hub != nil {
				hub.StoreRide(ride)
				hub.SendRideToDriver(driverPhone, ride)
			}
		},
	)

	// WhatsApp Manager with lazy event handler reference
	waMgr = whatsapp.NewManager(cfg.WabotDBPath, func(phone string, evt interface{}) {
		if evtHandler != nil {
			evtHandler.Handle(phone, evt)
		}
	})

	// WebSocket Hub
	hub = ws.NewHub(mongoDB, driverCache, waMgr)
	go hub.Run()

	// Event handler
	evtHandler = whatsapp.NewEventHandler(
		processor,
		driverCache,
		waMgr,
		func(phone string, connected bool) {
			hub.BroadcastWAStatus(phone, connected)
		},
	)

	// Connect existing WhatsApp sessions
	ctx := context.Background()
	if err := waMgr.Connect(ctx); err != nil {
		log.Printf("wa: failed to connect sessions: %v", err)
	}

	// HTTP server
	handlers := api.NewHandlers(mongoDB, driverCache, processor, hub, waMgr, dedup)
	router := api.NewRouter(handlers, hub)

	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	go func() {
		log.Printf("Server starting on :%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down...")
	shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	server.Shutdown(shutCtx)
}
