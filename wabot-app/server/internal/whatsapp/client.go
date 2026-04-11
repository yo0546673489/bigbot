package whatsapp

import (
	"context"
	"log"
	"sync"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store/sqlstore"
	waLog "go.mau.fi/whatsmeow/util/log"
)

// Manager manages one or more WhatsApp clients
type Manager struct {
	mu      sync.RWMutex
	clients map[string]*whatsmeow.Client // phone -> client
	dbPath  string
	onEvent func(phone string, evt interface{})
}

func NewManager(dbPath string, onEvent func(phone string, evt interface{})) *Manager {
	return &Manager{
		clients: make(map[string]*whatsmeow.Client),
		dbPath:  dbPath,
		onEvent: onEvent,
	}
}

func (m *Manager) getClient(phone string) *whatsmeow.Client {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.clients[phone]
}

// Connect connects an existing WhatsApp session from the SQLite store
func (m *Manager) Connect(ctx context.Context) error {
	container, err := sqlstore.New(context.Background(), "sqlite3_fk", m.dbPath, waLog.Stdout("DB", "ERROR", true))
	if err != nil {
		return err
	}

	devices, err := container.GetAllDevices(ctx)
	if err != nil {
		return err
	}

	if len(devices) == 0 {
		log.Println("wa manager: no devices found in store")
		return nil
	}

	for _, device := range devices {
		client := whatsmeow.NewClient(device, waLog.Stdout("WA", "INFO", true))
		phone := device.ID.User

		client.AddEventHandler(func(evt interface{}) {
			m.onEvent(phone, evt)
		})

		if err := client.Connect(); err != nil {
			log.Printf("wa manager: failed to connect %s: %v", phone, err)
			continue
		}

		m.mu.Lock()
		m.clients[phone] = client
		m.mu.Unlock()

		log.Printf("wa manager: connected %s", phone)
	}
	return nil
}

// PairPhone pairs a new phone using linking code
func (m *Manager) PairPhone(ctx context.Context, phone string) (string, error) {
	container, err := sqlstore.New(context.Background(), "sqlite3_fk", m.dbPath, waLog.Stdout("DB", "ERROR", true))
	if err != nil {
		return "", err
	}

	device := container.NewDevice()
	client := whatsmeow.NewClient(device, waLog.Stdout("WA", "INFO", true))

	if err := client.Connect(); err != nil {
		return "", err
	}

	code, err := client.PairPhone(ctx, phone, true, whatsmeow.PairClientChrome, "Chrome (Linux)")
	if err != nil {
		return "", err
	}

	client.AddEventHandler(func(evt interface{}) {
		m.onEvent(phone, evt)
	})

	m.mu.Lock()
	m.clients[phone] = client
	m.mu.Unlock()

	return code, nil
}

// IsConnected returns true if the given phone is connected
func (m *Manager) IsConnected(phone string) bool {
	client := m.getClient(phone)
	return client != nil && client.IsConnected()
}

// GetStatus returns connection status for all clients
func (m *Manager) GetStatus() []map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []map[string]interface{}
	for phone, client := range m.clients {
		result = append(result, map[string]interface{}{
			"phone":     phone,
			"connected": client.IsConnected(),
			"loggedIn":  client.IsLoggedIn(),
		})
	}
	return result
}
