package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"

	"wabot-app/internal/drivers"
	"wabot-app/internal/matching"
	"wabot-app/internal/rides"
	ws "wabot-app/internal/websocket"
	"wabot-app/internal/whatsapp"
)

type Handlers struct {
	db          *mongo.Database
	driverCache *drivers.Cache
	processor   *rides.Processor
	hub         *ws.Hub
	waMgr       *whatsapp.Manager
	dedup       *rides.Deduplicator
}

func NewHandlers(
	db *mongo.Database,
	driverCache *drivers.Cache,
	processor *rides.Processor,
	hub *ws.Hub,
	waMgr *whatsapp.Manager,
	dedup *rides.Deduplicator,
) *Handlers {
	return &Handlers{
		db:          db,
		driverCache: driverCache,
		processor:   processor,
		hub:         hub,
		waMgr:       waMgr,
		dedup:       dedup,
	}
}

// POST /api/wa/message — incoming group message
func (h *Handlers) HandleIncomingMessage(w http.ResponseWriter, r *http.Request) {
	var msg rides.IncomingMessage
	if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
		http.Error(w, "bad request", 400)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	go h.processor.ProcessMessage(ctx, &msg)
	w.WriteHeader(http.StatusOK)
}

// POST /api/wa/private-message — private message from a driver
func (h *Handlers) HandlePrivateMessage(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SenderPhone string `json:"senderPhone"`
		Body        string `json:"body"`
		FromName    string `json:"fromName"`
		Timestamp   int64  `json:"timestamp"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", 400)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	go handlePrivateDriverMessage(ctx, h.db, h.driverCache, body.SenderPhone, body.FromName, body.Body)
	w.WriteHeader(http.StatusOK)
}

// GET /api/wa/status
func (h *Handlers) HandleWAStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.waMgr.GetStatus())
}

// POST /api/wa/pair
func (h *Handlers) HandlePair(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Phone string `json:"phone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", 400)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	code, err := h.waMgr.PairPhone(ctx, body.Phone)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, map[string]string{"code": code})
}

// GET /api/drivers
func (h *Handlers) HandleListDrivers(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.driverCache.GetAll())
}

// GET /api/drivers/{phone}/keywords
func (h *Handlers) HandleDriverKeywords(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	phone := vars["phone"]
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	kws, err := drivers.GetKeywords(ctx, h.db, phone)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	writeJSON(w, kws)
}

// GET /api/areas/support
func (h *Handlers) HandleListSupportAreas(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, matching.GetIndex().SupportAreas)
}

// GET /api/areas/shortcuts
func (h *Handlers) HandleListShortcuts(w http.ResponseWriter, r *http.Request) {
	idx := matching.GetIndex()
	idx.RLock()
	defer idx.RUnlock()
	writeJSON(w, idx.Shortcuts)
}

// GET /api/rides/recent
func (h *Handlers) HandleRecentRides(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cursor, err := h.db.Collection("rides").Find(ctx, bson.M{})
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	defer cursor.Close(ctx)
	var result []bson.M
	cursor.All(ctx, &result)
	writeJSON(w, result)
}

// GET /health
func (h *Handlers) HandleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"status": "ok", "time": time.Now().Format(time.RFC3339)})
}

func handlePrivateDriverMessage(ctx context.Context, db *mongo.Database, cache *drivers.Cache, phone, name, body string) {
	bodyLower := strings.ToLower(strings.TrimSpace(body))

	if isPanavCmd(bodyLower) {
		kw := extractKW(body)
		if kw != "" {
			drivers.SaveKeyword(ctx, db, phone, kw)
			drivers.SetDriverBusy(ctx, db, phone, false)
			cache.Invalidate(phone)
		}
		return
	}

	if bodyLower == "עסוק" || bodyLower == "busy" {
		drivers.RemoveKeywords(ctx, db, phone)
		drivers.SetDriverBusy(ctx, db, phone, true)
		cache.Invalidate(phone)
		return
	}

	// Auto register
	drivers.UpsertDriver(ctx, db, phone, name)
}

func isPanavCmd(lower string) bool {
	for _, prefix := range []string{"פנוי ב", "פנויה ב", "available in ", "available at "} {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	return false
}

func extractKW(body string) string {
	for _, prefix := range []string{"פנוי ב", "פנויה ב", "available in ", "available at "} {
		lower := strings.ToLower(body)
		pLower := strings.ToLower(prefix)
		if strings.HasPrefix(lower, pLower) {
			return strings.TrimSpace(body[len(prefix):])
		}
	}
	return ""
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
