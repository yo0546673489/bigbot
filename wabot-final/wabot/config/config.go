package config

import (
	"log"

	"wabot/types"

	"github.com/sirupsen/logrus"
	"github.com/spf13/viper"
)

// LoadConfig loads the application configuration
func LoadConfig() *types.Config {
	// Set defaults first
	viper.SetDefault("PORT", "8080")
	viper.SetDefault("DB_PATH", "./wabot.db")
	viper.SetDefault("LOG_LEVEL", "info")
	viper.SetDefault("SERVER_URL", "http://localhost:3000")
	viper.SetDefault("REDIS_URL", "localhost:6379")
	viper.SetDefault("REDIS_DB", 0)
	viper.SetDefault("KAFKA_BROKERS", "localhost:9092")
	viper.SetDefault("KAFKA_TOPIC_MESSAGES", "whatsapp-messages")
	viper.SetDefault("KAFKA_CLIENT_ID", "wabot")

	// Try to load from .env file
	viper.SetConfigName(".env")
	viper.SetConfigType("env")
	viper.AddConfigPath(".")

	// Also enable automatic environment variable loading
	viper.AutomaticEnv()

	// Read the config file
	if err := viper.ReadInConfig(); err != nil {
		log.Printf("Warning: Could not read .env file: %v", err)
		log.Printf("Using default values and environment variables")
	}

	var config types.Config
	if err := viper.Unmarshal(&config); err != nil {
		log.Fatalf("Failed to unmarshal config: %v", err)
	}

	return &config
}

// SetupLogger sets up the application logger
func SetupLogger(level string) *logrus.Logger {
	logger := logrus.New()
	logger.SetFormatter(&logrus.JSONFormatter{})

	switch level {
	case "debug":
		logger.SetLevel(logrus.DebugLevel)
	case "info":
		logger.SetLevel(logrus.InfoLevel)
	case "warn":
		logger.SetLevel(logrus.WarnLevel)
	case "error":
		logger.SetLevel(logrus.ErrorLevel)
	default:
		logger.SetLevel(logrus.InfoLevel)
	}

	return logger
}
