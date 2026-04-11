package bot

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/glebarez/sqlite" // CGO-free SQLite driver
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store/sqlstore"
	waLog "go.mau.fi/whatsmeow/util/log"

	"wabot/config"
	"wabot/handlers"
	"wabot/router"
	"wabot/services"
	"wabot/types"
)

// WhatsAppBotManager manages the WhatsApp bot instance
type WhatsAppBotManager struct {
	bot      *types.WhatsAppBot
	service  *services.WhatsAppService
	server   *http.Server
	handlers *handlers.WhatsAppHandlers
}

// NewWhatsAppBotManager creates a new WhatsApp bot manager
func NewWhatsAppBotManager() (*WhatsAppBotManager, error) {
	// Load configuration
	cfg := config.LoadConfig()

	// Setup logger
	logger := config.SetupLogger(cfg.LogLevel)

	// Create WhatsApp bot instance
	bot := &types.WhatsAppBot{
		Clients:    make(map[string]*whatsmeow.Client),
		Config:     cfg,
		Logger:     logger,
		Router:     http.NewServeMux(),
		HTTPClient: &types.HTTPClient{
			Client: &http.Client{
				// 5s timeout — was 10s. Server is local; if it hangs, we want
				// to fail fast rather than block goroutines.
				Timeout: 5 * time.Second,
				Transport: &http.Transport{
					// Bumped to handle 500+ groups firing simultaneously.
					// All requests target the same host (localhost:7878) so
					// PerHost is what matters most. Was 100/20.
					MaxIdleConns:        500,
					MaxIdleConnsPerHost: 500,
					IdleConnTimeout:     90 * time.Second,
				},
			},
		},
	}

	// Initialize Kafka service
	kafkaService, err := services.NewKafkaService(cfg.KafkaBrokers, cfg.KafkaTopicMessages, cfg.KafkaClientID, logger)
	if err != nil {
		logger.Warnf("Failed to initialize Kafka service: %v", err)
		logger.Info("Continuing without Kafka - messages will not be forwarded")
	} else {
		// Test Kafka connection
		if err := kafkaService.TestConnection(); err != nil {
			logger.Warnf("Kafka connection test failed: %v", err)
			logger.Info("Continuing without Kafka - messages will not be forwarded")
		} else {
			bot.SetKafkaProducer(kafkaService)
			logger.Info("Kafka service initialized and tested successfully")
		}
	}

	// Initialize BullMQ queue service
	bullMQQueueService, err := services.NewBullMQQueueService(cfg, logger)
	if err != nil {
		logger.Warnf("Failed to initialize BullMQ queue service: %v", err)
		logger.Info("Continuing without BullMQ queue - messages will use HTTP fallback")
	} else {
		bot.SetBullQueue(bullMQQueueService)
		logger.Info("BullMQ queue service initialized successfully")
	}

	// Create WhatsApp service
	service := services.NewWhatsAppService(bot)

	// Create handlers
	handlers, err := handlers.NewWhatsAppHandlers(bot)
	if err != nil {
		return nil, fmt.Errorf("failed to create WhatsApp handlers: %v", err)
	}

	// Set handlers reference in bot for direct event processing
	bot.SetHandlers(handlers)

	// Setup routes
	handler := router.SetupRoutes(handlers)

	// Create HTTP server
	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: handler,
	}

	return &WhatsAppBotManager{
		bot:      bot,
		service:  service,
		server:   server,
		handlers: handlers, // Store handlers reference
	}, nil
}

// Initialize sets up the WhatsApp bot
func (m *WhatsAppBotManager) Initialize() error {
	// Initialize database
	db, err := sqlstore.New(context.Background(), "sqlite", "file:"+m.bot.GetConfig().DBPath+"?_pragma=foreign_keys(ON)", waLog.Stdout("Database", "DEBUG", true))
	if err != nil {
		return fmt.Errorf("failed to connect to database: %v", err)
	}

	// Store database reference
	m.bot.SetDB(db)

	// Initialize WhatsApp service
	if err := m.service.Initialize(); err != nil {
		return fmt.Errorf("failed to initialize WhatsApp service: %v", err)
	}

	// Event processing is now handled directly in the event handlers

	return nil
}

// Start starts the HTTP server
func (m *WhatsAppBotManager) Start() error {
	m.bot.GetLogger().Infof("Starting WhatsApp bot server on port %s", m.bot.GetConfig().Port)
	return m.server.ListenAndServe()
}

// Shutdown gracefully shuts down the bot
func (m *WhatsAppBotManager) Shutdown(ctx context.Context) error {
	// Shutdown HTTP server
	if err := m.server.Shutdown(ctx); err != nil {
		return fmt.Errorf("failed to shutdown HTTP server: %v", err)
	}

	// Close Kafka producer if available
	// if kafkaProducer := m.bot.GetKafkaProducer(); kafkaProducer != nil {
	// 	if kafkaService, ok := kafkaProducer.(*services.KafkaService); ok {
	// 		if err := kafkaService.Close(); err != nil {
	// 			m.bot.GetLogger().Warnf("Failed to close Kafka service: %v", err)
	// 		} else {
	// 			m.bot.GetLogger().Info("Kafka service closed successfully")
	// 		}
	// 	}
	// }

	// Disconnect all WhatsApp clients
	for phone, client := range m.bot.GetAllClients() {
		client.Disconnect()
		m.bot.GetLogger().Infof("Disconnected client: %s", phone)
	}

	return nil
}

// Run starts the bot and handles graceful shutdown
func (m *WhatsAppBotManager) Run() error {
	// Initialize the bot
	if err := m.Initialize(); err != nil {
		return fmt.Errorf("failed to initialize WhatsApp bot: %v", err)
	}

	// Start server in background
	go func() {
		if err := m.Start(); err != nil && err != http.ErrServerClosed {
			m.bot.GetLogger().Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	m.bot.GetLogger().Info("Shutting down WhatsApp bot server...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := m.Shutdown(ctx); err != nil {
		m.bot.GetLogger().Errorf("Error during shutdown: %v", err)
	}

	m.bot.GetLogger().Info("WhatsApp bot server stopped")
	return nil
}
