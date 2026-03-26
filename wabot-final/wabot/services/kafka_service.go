package services

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"wabot/types"

	"github.com/segmentio/kafka-go"
)

// KafkaService handles Kafka operations for WhatsApp messages
type KafkaService struct {
	writer   *kafka.Writer
	reader   *kafka.Reader
	brokers  []string
	topic    string
	clientID string
	logger   interface{}
}

// NewKafkaService creates a new Kafka service instance
func NewKafkaService(brokers, topic, clientID string, logger interface{}) (*KafkaService, error) {
	brokerList := []string{brokers}
	if brokers == "" {
		brokerList = []string{"localhost:9092"}
	}

	// Parse multiple brokers if comma-separated
	if brokers != "" {
		brokerList = strings.Split(brokers, ",")
		for i, broker := range brokerList {
			brokerList[i] = strings.TrimSpace(broker)
		}
	}

	writer := &kafka.Writer{
		Addr:         kafka.TCP(brokerList...),
		Topic:        topic,
		Balancer:     &kafka.LeastBytes{},
		BatchSize:    10,                     // Batch messages for efficiency
		BatchTimeout: 100 * time.Millisecond, // Send batch every 100ms
		RequiredAcks: kafka.RequireOne,       // Wait for at least one acknowledgment
		Compression:  kafka.Snappy,           // Compress messages
		Async:        false,                  // Synchronous writes for reliability
		ReadTimeout:  10 * time.Second,       // Read timeout
		WriteTimeout: 10 * time.Second,       // Write timeout
	}

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  brokerList,
		Topic:    topic,
		GroupID:  clientID + "-group",
		MinBytes: 1,
		MaxBytes: 10e6, // 10MB
		MaxWait:  100 * time.Millisecond,
	})

	return &KafkaService{
		writer:   writer,
		reader:   reader,
		brokers:  brokerList,
		topic:    topic,
		clientID: clientID,
		logger:   logger,
	}, nil
}

// SendWhatsAppMessage sends a WhatsApp message to Kafka
func (k *KafkaService) SendWhatsAppMessage(message *types.WhatsAppMessage) error {
	// Add timestamp if not set
	if message.Timestamp == 0 {
		message.Timestamp = time.Now().Unix()
	}

	// Serialize message to JSON
	jsonData, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %v", err)
	}

	// Create Kafka message
	kafkaMsg := kafka.Message{
		Key:   []byte(message.Phone), // Partition by bot phone
		Value: jsonData,
		Time:  time.Now(),
		Headers: []kafka.Header{
			{Key: "messageType", Value: []byte("whatsapp")},
			{Key: "botPhone", Value: []byte(message.Phone)},
			{Key: "messageId", Value: []byte(message.MessageID)},
		},
	}

	// Send message to Kafka
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err = k.writer.WriteMessages(ctx, kafkaMsg)
	if err != nil {
		return fmt.Errorf("failed to write message to Kafka: %v", err)
	}

	return nil
}

// SendBatchWhatsAppMessages sends multiple WhatsApp messages to Kafka in a batch
func (k *KafkaService) SendBatchWhatsAppMessages(messages []*types.WhatsAppMessage) error {
	if len(messages) == 0 {
		return nil
	}

	// Prepare Kafka messages
	kafkaMessages := make([]kafka.Message, 0, len(messages))

	for _, message := range messages {
		// Add timestamp if not set
		if message.Timestamp == 0 {
			message.Timestamp = time.Now().Unix()
		}

		// Serialize message to JSON
		jsonData, err := json.Marshal(message)
		if err != nil {
			return fmt.Errorf("failed to marshal message %s: %v", message.MessageID, err)
		}

		// Create Kafka message
		kafkaMsg := kafka.Message{
			Key:   []byte(message.Phone), // Partition by bot phone
			Value: jsonData,
			Time:  time.Now(),
			Headers: []kafka.Header{
				{Key: "messageType", Value: []byte("whatsapp")},
				{Key: "botPhone", Value: []byte(message.Phone)},
				{Key: "messageId", Value: []byte(message.MessageID)},
			},
		}

		kafkaMessages = append(kafkaMessages, kafkaMsg)
	}

	// Send batch to Kafka
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := k.writer.WriteMessages(ctx, kafkaMessages...)
	if err != nil {
		return fmt.Errorf("failed to write message batch to Kafka: %v", err)
	}

	return nil
}

// ReadMessages reads messages from Kafka (for testing/debugging)
func (k *KafkaService) ReadMessages(ctx context.Context, handler func(*types.WhatsAppMessage) error) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			msg, err := k.reader.ReadMessage(ctx)
			if err != nil {
				return fmt.Errorf("failed to read message from Kafka: %v", err)
			}

			// Parse message
			var whatsappMsg types.WhatsAppMessage
			if err := json.Unmarshal(msg.Value, &whatsappMsg); err != nil {
				return fmt.Errorf("failed to unmarshal message: %v", err)
			}

			// Call handler
			if err := handler(&whatsappMsg); err != nil {
				return fmt.Errorf("handler error: %v", err)
			}
		}
	}
}

// Close closes the Kafka service
func (k *KafkaService) Close() error {
	if err := k.writer.Close(); err != nil {
		return fmt.Errorf("failed to close Kafka writer: %v", err)
	}
	if err := k.reader.Close(); err != nil {
		return fmt.Errorf("failed to close Kafka reader: %v", err)
	}
	return nil
}

// TestConnection tests the Kafka connection
func (k *KafkaService) TestConnection() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Try to create a test message
	testMsg := kafka.Message{
		Key:   []byte("test"),
		Value: []byte("connection test"),
		Time:  time.Now(),
	}

	err := k.writer.WriteMessages(ctx, testMsg)
	if err != nil {
		return fmt.Errorf("failed to test Kafka connection: %v", err)
	}

	return nil
}

// GetStats returns Kafka service statistics
func (k *KafkaService) GetStats() map[string]interface{} {
	return map[string]interface{}{
		"brokers":  k.brokers,
		"topic":    k.topic,
		"clientID": k.clientID,
	}
}
