package services

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"wabot/types"

	"github.com/redis/go-redis/v9"
	"github.com/sirupsen/logrus"
	"go.mau.fi/whatsmeow/types/events"
)

// RedisService handles Redis operations for caching
type RedisService struct {
	client *redis.Client
	logger *logrus.Logger
}

// NewRedisService creates a new Redis service instance
func NewRedisService(config *types.Config, logger *logrus.Logger) (*RedisService, error) {
	// Set default Redis URL if not provided
	redisURL := config.RedisURL
	if redisURL == "" {
		redisURL = "localhost:6379"
	}

	// Set default Redis DB if not provided
	redisDB := config.RedisDB
	if redisDB == 0 {
		redisDB = 0
	}

	// Parse Redis URL and create client
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		// If URL parsing fails, try to connect directly
		opt = &redis.Options{
			Addr:         redisURL,
			DB:           redisDB,
			Password:     "", // Add password support if needed
			DialTimeout:  10 * time.Second,
			ReadTimeout:  30 * time.Second,
			WriteTimeout: 30 * time.Second,
			PoolSize:     10,
			MinIdleConns: 5,
			MaxRetries:   3,
		}
	} else {
		// Add timeout settings even when parsing URL succeeds
		opt.DialTimeout = 10 * time.Second
		opt.ReadTimeout = 30 * time.Second
		opt.WriteTimeout = 30 * time.Second
		opt.PoolSize = 10
		opt.MinIdleConns = 5
		opt.MaxRetries = 3
	}

	client := redis.NewClient(opt)

	// Test connection with longer timeout
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	_, err = client.Ping(ctx).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Redis at %s: %v", redisURL, err)
	}

	logger.Infof("Successfully connected to Redis at %s (DB: %d)", redisURL, redisDB)

	return &RedisService{
		client: client,
		logger: logger,
	}, nil
}

// Close closes the Redis connection
func (r *RedisService) Close() error {
	return r.client.Close()
}

// GetClient returns the Redis client for direct operations if needed
func (r *RedisService) GetClient() *redis.Client {
	return r.client
}

// SetGroupInfo caches group information in Redis with TTL
func (r *RedisService) SetGroupInfo(ctx context.Context, groupID string, groupInfo types.GroupInfo) error {
	key := fmt.Sprintf("group:info:%s", groupID)

	// Serialize group info to JSON
	data, err := json.Marshal(groupInfo)
	if err != nil {
		return fmt.Errorf("failed to marshal group info: %v", err)
	}

	// Try up to 3 times with exponential backoff
	for i := 0; i < 3; i++ {
		err = r.client.Set(ctx, key, data, 0).Err()
		if err == nil {
			break
		}

		// If it's a network error and we have retries left, wait and try again
		if i < 2 && isNetworkError(err) {
			r.logger.Warnf("Redis Set operation failed (attempt %d/3), retrying: %v", i+1, err)
			time.Sleep(time.Duration(i+1) * time.Second)
			continue
		}

		// For other errors, return immediately
		return fmt.Errorf("failed to set group info in Redis: %v", err)
	}

	return nil
}

// GetGroupInfo retrieves group information from Redis cache
func (r *RedisService) GetGroupInfo(ctx context.Context, groupID string) (*types.GroupInfo, error) {
	key := fmt.Sprintf("group:info:%s", groupID)

	// Get from Redis
	data, err := r.client.Get(ctx, key).Result()
	if err != nil {
		if err == redis.Nil {
			return nil, nil
		}

		// For other errors, return immediately
		return nil, fmt.Errorf("failed to get group info from Redis: %v", err)
	}

	// Deserialize from JSON
	var groupInfo types.GroupInfo
	err = json.Unmarshal([]byte(data), &groupInfo)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal group info: %v", err)
	}

	r.logger.Debugf("Retrieved group info for %s from Redis cache", groupID)
	return &groupInfo, nil
}

// DeleteGroupInfo removes group information from Redis cache
func (r *RedisService) DeleteGroupInfo(ctx context.Context, groupID string) error {
	key := fmt.Sprintf("group:info:%s", groupID)

	err := r.client.Del(ctx, key).Err()
	if err != nil {
		return fmt.Errorf("failed to delete group info from Redis: %v", err)
	}

	r.logger.Debugf("Deleted group info for %s from Redis cache", groupID)
	return nil
}

// SetMessage caches message information in Redis with TTL
func (r *RedisService) SetMessage(ctx context.Context, messageID string, botPhone string, message *events.Message) error {
	key := fmt.Sprintf("messagev2:%s:%s", botPhone, messageID)

	// Serialize message to JSON
	data, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %v", err)
	}

	// Set with TTL of 2 hours
	err = r.client.Set(ctx, key, data, 2*time.Hour).Err()
	if err != nil {
		return fmt.Errorf("failed to set message in Redis: %v", err)
	}

	return nil
}

// GetMessage retrieves message information from Redis cache
func (r *RedisService) GetMessage(ctx context.Context, messageID string, botPhone string) (*events.Message, error) {
	key := fmt.Sprintf("messagev2:%s:%s", botPhone, messageID)

	data, err := r.client.Get(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get message from Redis: %v", err)
	}

	var message events.Message
	err = json.Unmarshal([]byte(data), &message)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal message: %v", err)
	}

	return &message, nil
}

// isNetworkError checks if the error is a network-related error that might be retryable
func isNetworkError(err error) bool {
	if err == nil {
		return false
	}

	errStr := err.Error()
	// Check for common network error patterns
	return strings.Contains(errStr, "timeout") ||
		strings.Contains(errStr, "connection refused") ||
		strings.Contains(errStr, "i/o timeout") ||
		strings.Contains(errStr, "network is unreachable") ||
		strings.Contains(errStr, "no route to host")
}
