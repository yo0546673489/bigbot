package types

import (
	"context"
	"fmt"
	"net/http"
	"reflect"
	"time"

	"github.com/sirupsen/logrus"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store/sqlstore"
	waTypes "go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

// Config holds the application configuration
type Config struct {
	Port               string `mapstructure:"PORT"`
	DBPath             string `mapstructure:"DB_PATH"`
	LogLevel           string `mapstructure:"LOG_LEVEL"`
	ServerURL          string `mapstructure:"SERVER_URL"`
	RedisURL           string `mapstructure:"REDIS_URL"`
	RedisDB            int    `mapstructure:"REDIS_DB"`
	KafkaBrokers       string `mapstructure:"KAFKA_BROKERS"`
	KafkaTopicMessages string `mapstructure:"KAFKA_TOPIC_MESSAGES"`
	KafkaClientID      string `mapstructure:"KAFKA_CLIENT_ID"`
}

// WhatsAppBot represents the main bot instance
type WhatsAppBot struct {
	Clients       map[string]*whatsmeow.Client // Multiple clients by phone number
	Config        *Config
	Logger        *logrus.Logger
	Router        *http.ServeMux
	HTTPClient    *HTTPClient
	DB            *sqlstore.Container
	Handlers      interface{} // Reference to WhatsAppHandlers for direct event processing
	KafkaProducer interface{} // Kafka producer interface
	QueueService  interface{} // Queue service interface (Redis or Bull)
}

type HTTPClient struct {
	*http.Client
}

// Getter methods for WhatsAppBot
func (bot *WhatsAppBot) GetAllClients() map[string]*whatsmeow.Client {
	return bot.Clients
}

func (bot *WhatsAppBot) GetClient(phone string) (*whatsmeow.Client, error) {
	client, exists := bot.Clients[phone]
	if !exists {
		return nil, fmt.Errorf("no client found for phone: %s", phone)
	}
	return client, nil
}

func (bot *WhatsAppBot) DeleteClient(phone string) {
	bot.Clients[phone].Store.Delete(context.Background())
	delete(bot.Clients, phone)
}

func (bot *WhatsAppBot) GetLogger() *logrus.Logger {
	return bot.Logger
}

func (bot *WhatsAppBot) GetDB() *sqlstore.Container {
	return bot.DB
}

func (bot *WhatsAppBot) GetEventHandler() func(interface{}, string) {
	return bot.handleEvent
}

// EventData represents common data for all WhatsApp events
type EventData struct {
	EventType string      `json:"eventType"`
	BotPhone  string      `json:"botPhone"`
	Timestamp int64       `json:"timestamp"`
	Data      interface{} `json:"data"`
}

// handleEvent handles WhatsApp events
func (bot *WhatsAppBot) handleEvent(evt interface{}, botPhone string) {
	// Create common event data
	eventData := &EventData{
		BotPhone:  botPhone,
		Timestamp: time.Now().Unix(),
	}

	switch v := evt.(type) {
	case *events.Message:
		eventData.EventType = "Message"
		eventData.Data = v
	case *events.Receipt:
		eventData.EventType = "Receipt"
		eventData.Data = v
	case *events.Presence:
		eventData.EventType = "Presence"
		eventData.Data = v
	case *events.Connected:
		eventData.EventType = "Connected"
		eventData.Data = v
	case *events.Disconnected:
		eventData.EventType = "Disconnected"
		eventData.Data = v
	case *events.LoggedOut:
		eventData.EventType = "LoggedOut"
		eventData.Data = v
	case *events.GroupInfo:
		eventData.EventType = "GroupInfo"
		eventData.Data = v
	default:
		// Check if this is a group creation event by examining the struct fields
		eventValue := reflect.ValueOf(evt)
		if eventValue.Kind() == reflect.Ptr && !eventValue.IsNil() {
			eventValue = eventValue.Elem()
		}

		if eventValue.Kind() == reflect.Struct {
			// Check if it has a Type field with value "new"
			typeField := eventValue.FieldByName("Type")
			if typeField.IsValid() && typeField.String() == "new" {
				eventData.EventType = "GroupCreated"
				eventData.Data = v
			} else {
				eventData.EventType = "Unknown"
				eventData.Data = evt
			}
		} else {
			eventData.EventType = "Unknown"
			eventData.Data = evt
		}
	}

	// Call handlers directly instead of using channels
	if bot.Handlers != nil {
		// Type assert to avoid reflection overhead
		if handlers, ok := bot.Handlers.(interface{ HandleEvent(*EventData) }); ok {
			go handlers.HandleEvent(eventData)
		}
	}

	// Log the event data for debugging/monitoring
	bot.GetLogger().Debugf("Event processed: %+v", eventData)
}

// CreateEventData creates EventData from any event
func (bot *WhatsAppBot) CreateEventData(evt interface{}, botPhone string) *EventData {
	return &EventData{
		EventType: bot.getEventType(evt),
		BotPhone:  botPhone,
		Timestamp: time.Now().Unix(),
		Data:      evt,
	}
}

// getEventType determines the event type from the event interface
func (bot *WhatsAppBot) getEventType(evt interface{}) string {
	switch evt.(type) {
	case *events.Message:
		return "Message"
	case *events.Receipt:
		return "Receipt"
	case *events.Presence:
		return "Presence"
	case *events.Connected:
		return "Connected"
	case *events.Disconnected:
		return "Disconnected"
	case *events.LoggedOut:
		return "LoggedOut"
	case *events.GroupInfo:
		return "GroupInfo"
	default:
		return "Unknown"
	}
}

// GetEventData returns the event data for external use
func (bot *WhatsAppBot) GetEventData(evt interface{}, botPhone string) *EventData {
	return bot.CreateEventData(evt, botPhone)
}

// Client management methods
func (bot *WhatsAppBot) AddClient(phone string, client *whatsmeow.Client) {
	bot.Clients[phone] = client
}

func (bot *WhatsAppBot) RemoveClient(phone string) {
	delete(bot.Clients, phone)
}

func (bot *WhatsAppBot) ClearAllClients() {
	bot.Clients = make(map[string]*whatsmeow.Client)
}

// JID parsing method
func (bot *WhatsAppBot) ParseJID(jidString string) (waTypes.JID, error) {
	return waTypes.ParseJID(jidString)
}

// Additional getter methods
func (bot *WhatsAppBot) GetHTTPClient() *HTTPClient {
	return bot.HTTPClient
}

// Thêm method Delete
func (c *HTTPClient) Delete(url string) (*http.Response, error) {
	req, err := http.NewRequest(http.MethodDelete, url, nil)
	if err != nil {
		return nil, err
	}
	return c.Do(req)
}

func (bot *WhatsAppBot) GetConfig() *Config {
	return bot.Config
}

// GetKafkaProducer returns the Kafka producer
func (bot *WhatsAppBot) GetKafkaProducer() interface{} {
	return bot.KafkaProducer
}

// SetKafkaProducer sets the Kafka producer
func (bot *WhatsAppBot) SetKafkaProducer(producer interface{}) {
	bot.KafkaProducer = producer
}

// GetQueueService returns the queue service
func (bot *WhatsAppBot) GetQueueService() interface{} {
	return bot.QueueService
}

// SetQueueService sets the queue service
func (bot *WhatsAppBot) SetQueueService(queue interface{}) {
	bot.QueueService = queue
}

// GetBullQueue returns the queue service (for backward compatibility)
func (bot *WhatsAppBot) GetBullQueue() interface{} {
	return bot.QueueService
}

// SetBullQueue sets the queue service (for backward compatibility)
func (bot *WhatsAppBot) SetBullQueue(queue interface{}) {
	bot.QueueService = queue
}

// SetDB sets the database reference
func (bot *WhatsAppBot) SetDB(db *sqlstore.Container) {
	bot.DB = db
}

// SetHandlers sets the handlers reference
func (bot *WhatsAppBot) SetHandlers(handlers interface{}) {
	bot.Handlers = handlers
}

// MessageRequest represents a request to send a message
type MessageRequest struct {
	FromPhone string `json:"fromPhone"`
	ToPhone   string `json:"toPhone"`
	Message   string `json:"message"`
	Type      string `json:"type"`
}

// MessageResponse represents a response to a message request
type MessageResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	ID      string `json:"id,omitempty"`
}

// StatusResponse represents the status of a WhatsApp session
type StatusResponse struct {
	Connected bool   `json:"connected"`
	Status    string `json:"status"`
	Phone     string `json:"phone,omitempty"`
}

// SessionStatus represents the status of a single session
type SessionStatus struct {
	Phone     string `json:"phone"`
	IsHealthy bool   `json:"isHealthy"`
}

// PairRequest represents a request to pair with a phone number
type PairRequest struct {
	Phone string `json:"phone"`
}

// CompletePairingRequest represents a request to complete pairing
type CompletePairingRequest struct {
	Phone string `json:"phone"`
}

// HealthResponse represents the health check response
type HealthResponse struct {
	Status string `json:"status"`
}

// WhatsAppMessage represents a WhatsApp message for forwarding to the server
type WhatsAppMessage struct {
	Phone        string   `json:"phone"`
	Body         string   `json:"body"`
	MessageID    string   `json:"messageId"`
	GroupName    string   `json:"groupName,omitempty"`
	SenderPhone  string   `json:"senderPhone"`
	FromName     string   `json:"fromName"`
	Timestamp    int64    `json:"timestamp"`
	Type         string   `json:"type"`
	GroupID      string   `json:"groupId,omitempty"`
	Participants []string `json:"participants,omitempty"`
}

// GroupParticipantInfo represents a participant in a WhatsApp group
type GroupParticipantInfo struct {
	JID          string `json:"jid"`
	PhoneNumber  string `json:"phoneNumber"`
	LID          string `json:"lid"`
	IsAdmin      bool   `json:"isAdmin"`
	IsSuperAdmin bool   `json:"isSuperAdmin"`
	DisplayName  string `json:"displayName,omitempty"`
}

type GroupInfo struct {
	Participants           []GroupParticipantInfo `json:"participants"`
	Name                   string                 `json:"name"`
	JID                    string                 `json:"jid,omitempty"`
	ParticipantVersionID   string                 `json:"participantVersionId,omitempty"`
	Description            string                 `json:"description,omitempty"`
	TopicID                string                 `json:"topicId,omitempty"`
	TopicSetAt             int64                  `json:"topicSetAt,omitempty"`
	TopicSetBy             string                 `json:"topicSetBy,omitempty"`
	TopicDeleted           bool                   `json:"topicDeleted,omitempty"`
	NameSetAt              int64                  `json:"nameSetAt,omitempty"`
	NameSetBy              string                 `json:"nameSetBy,omitempty"`
	OwnerJID               string                 `json:"ownerJid,omitempty"`
	CreatedAt              int64                  `json:"createdAt,omitempty"`
	CreatorCountryCode     string                 `json:"creatorCountryCode,omitempty"`
	MemberAddMode          string                 `json:"memberAddMode,omitempty"`
	AddressingMode         string                 `json:"addressingMode,omitempty"`
	IsAnnounce             bool                   `json:"isAnnounce,omitempty"`
	AnnounceVersionID      string                 `json:"announceVersionId,omitempty"`
	IsEphemeral            bool                   `json:"isEphemeral,omitempty"`
	DisappearingTimer      uint32                 `json:"disappearingTimer,omitempty"`
	IsIncognito            bool                   `json:"isIncognito,omitempty"`
	IsLocked               bool                   `json:"isLocked,omitempty"`
	ParentGroup            string                 `json:"parentGroup,omitempty"`
	LinkedParent           string                 `json:"linkedParent,omitempty"`
	IsDefaultSub           bool                   `json:"isDefaultSub,omitempty"`
	MembershipApprovalMode string                 `json:"membershipApprovalMode,omitempty"`
	JoinApprovalRequired   bool                   `json:"joinApprovalRequired,omitempty"`
}

type ReplyToGroupRequest struct {
	Phone     string `json:"phone"`
	GroupId   string `json:"groupId"`
	MessageId string `json:"messageId"`
	Text      string `json:"text"`
}

type ReplyPrivateFromGroupRequest struct {
	Phone       string `json:"phone"`
	PhoneNumber string `json:"phoneNumber"`
	MessageId   string `json:"messageId"`
	GroupId     string `json:"groupId"`
	Text        string `json:"text"`
}

type SendPrivateMessageRequest struct {
	Phone       string `json:"phone"`
	PhoneNumber string `json:"phoneNumber"`
	Message     string `json:"message"`
}

// SendMessageToGroupRequest represents a request to send a message to a group
type SendMessageToGroupRequest struct {
	Phone   string `json:"phone"`
	GroupId string `json:"groupId"`
	Message string `json:"message"`
}
