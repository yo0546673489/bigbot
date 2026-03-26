package services

import (
	"context"
	"fmt"
	"time"

	"wabot/types"

	"github.com/redis/go-redis/v9"
	"github.com/sirupsen/logrus"
	"go.codycody31.dev/gobullmq"
)

// BullMQQueueService handles BullMQ queue operations for message processing
type BullMQQueueService struct {
	queue  *gobullmq.Queue
	logger *logrus.Logger
}

// Job types
const (
	// messageProcessingQueue is the name of the queue from whatsappMgn.service.ts
	TypeProcessWhatsAppMessage = "messageProcessingQueue"
)

// NewBullMQQueueService creates a new BullMQ queue service instance
func NewBullMQQueueService(config *types.Config, logger *logrus.Logger) (*BullMQQueueService, error) {
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

	// Create Redis client
	redisClient := redis.NewClient(&redis.Options{
		Addr:     redisURL,
		Password: "", // Add password if needed
		DB:       redisDB,
	})

	// Test the connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := redisClient.Ping(ctx).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %v", err)
	}

	// Create BullMQ queue
	queue, err := gobullmq.NewQueue(ctx, TypeProcessWhatsAppMessage, redisClient)
	if err != nil {
		return nil, fmt.Errorf("failed to create BullMQ queue: %v", err)
	}

	logger.Infof("Successfully created BullMQ queue service connected to Redis at %s (DB: %d)", redisURL, redisDB)

	return &BullMQQueueService{
		queue:  queue,
		logger: logger,
	}, nil
}

// GetQueue returns the BullMQ queue for direct operations if needed
func (b *BullMQQueueService) GetQueue() *gobullmq.Queue {
	return b.queue
}

// WhatsAppMessagePayload represents the data structure for WhatsApp message processing
type WhatsAppMessagePayload struct {
	JobName      string   `json:"jobName"`
	Phone        string   `json:"phone"`
	Body         string   `json:"body"`
	MessageID    string   `json:"messageId"`
	GroupName    string   `json:"groupName"`
	SenderPhone  string   `json:"senderPhone"`
	FromName     string   `json:"fromName"`
	Timestamp    int64    `json:"timestamp"`
	Type         string   `json:"type"`
	GroupID      string   `json:"groupId"`
	Participants []string `json:"participants"`
}

// AddWhatsAppMessageJob adds a WhatsApp message job to the BullMQ queue
func (b *BullMQQueueService) AddWhatsAppMessageJob(ctx context.Context, whatsappMsg *types.WhatsAppMessage) error {
	// Create payload
	payload := WhatsAppMessagePayload{
		JobName:      "processWhatsAppMessage",
		Phone:        whatsappMsg.Phone,
		Body:         whatsappMsg.Body,
		MessageID:    whatsappMsg.MessageID,
		GroupName:    whatsappMsg.GroupName,
		SenderPhone:  whatsappMsg.SenderPhone,
		FromName:     whatsappMsg.FromName,
		Timestamp:    whatsappMsg.Timestamp,
		Type:         whatsappMsg.Type,
		GroupID:      whatsappMsg.GroupID,
		Participants: whatsappMsg.Participants,
	}

	// Add job to BullMQ queue
	_, err := b.queue.Add(ctx, "processWhatsAppMessage", payload)
	if err != nil {
		return fmt.Errorf("failed to add WhatsApp message job: %v", err)
	}
	return nil
}
