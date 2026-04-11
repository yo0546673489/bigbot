package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port         string
	MongoURI     string
	MongoDB      string
	RedisURL     string
	JWTSecret    string
	FCMKey       string
	LogLevel     string
	SpecialGroup string
	WabotDBPath  string
}

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	return &Config{
		Port:         getEnv("PORT", "7879"),
		MongoURI:     getEnv("MONGO_URI", "mongodb://localhost:27017"),
		MongoDB:      getEnv("MONGO_DB", "wabot_dev"),
		RedisURL:     getEnv("REDIS_URL", "redis://localhost:6379"),
		JWTSecret:    getEnv("JWT_SECRET", "secret"),
		FCMKey:       getEnv("FCM_KEY", ""),
		LogLevel:     getEnv("LOG_LEVEL", "info"),
		SpecialGroup: getEnv("SPECIAL_GROUP", "120363024226519232@g.us"),
		WabotDBPath:  getEnv("WABOT_DB_PATH", "./wabot.db"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
