package rides

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/mongo"

	"wabot-app/internal/drivers"
	"wabot-app/internal/matching"
)

type Processor struct {
	dedup        *Deduplicator
	driverCache  *drivers.Cache
	rdb          *redis.Client
	db           *mongo.Database
	specialGroup string
	onRide       func(driverPhone string, ride *Ride) // callback to send ride to driver
	sendQueues   sync.Map                              // phone -> chan struct{} (serialized sends)
}

func NewProcessor(
	dedup *Deduplicator,
	driverCache *drivers.Cache,
	rdb *redis.Client,
	db *mongo.Database,
	specialGroup string,
	onRide func(driverPhone string, ride *Ride),
) *Processor {
	SetOriginDestParser(matching.HasMinimumTwoCities)
	return &Processor{
		dedup:        dedup,
		driverCache:  driverCache,
		rdb:          rdb,
		db:           db,
		specialGroup: specialGroup,
		onRide:       onRide,
	}
}

// ProcessMessage is the main entry point for incoming group messages
func (p *Processor) ProcessMessage(ctx context.Context, msg *IncomingMessage) {
	// 1. Dedup check (first thing!)
	if p.dedup.IsDuplicate(msg.MessageID) {
		return
	}

	// 2. Timestamp check (ignore messages older than 20s)
	if time.Now().Unix()-msg.Timestamp > 20 {
		log.Printf("Processor: ignoring old message %s", msg.MessageID)
		return
	}

	// 3. Parse ride from message
	ride := ParseRideFromMessage(msg, p.specialGroup)
	if ride == nil {
		return // No origin/destination found
	}

	// 4. Get all active drivers
	allDrivers := p.driverCache.GetAll()
	if len(allDrivers) == 0 {
		return
	}

	// 5. Process each driver concurrently
	var wg sync.WaitGroup
	for _, d := range allDrivers {
		d := d
		wg.Add(1)
		go func() {
			defer wg.Done()
			p.checkAndSend(ctx, d, msg, ride)
		}()
	}
	wg.Wait()
}

func (p *Processor) checkAndSend(ctx context.Context, d *drivers.Driver, msg *IncomingMessage, ride *Ride) {
	// Skip self
	if d.Phone == msg.SenderPhone {
		return
	}

	// Dedup per driver
	if p.dedup.IsDriverMessageDuplicate(d.Phone, msg.GroupID, msg.MessageID) {
		return
	}

	// Eligibility checks
	if !d.IsApproved || d.IsBusy {
		return
	}
	if !drivers.IsInTrial(d) {
		return
	}
	if drivers.IsNeedToPay(d) {
		return
	}

	// Group filter
	groupID := strings.ReplaceAll(msg.GroupID, "@g.us", "")
	for _, fg := range d.FilterGroups {
		if fg == groupID {
			return
		}
	}

	// Vehicle eligibility
	if !drivers.IsDriverEligible(d, msg.Body) {
		return
	}

	// Load keywords
	keywords, err := drivers.GetKeywords(ctx, p.db, d.Phone)
	if err != nil || len(keywords) == 0 {
		return
	}

	// Match keyword
	originDest := fmt.Sprintf("%s_%s", ride.OriginRaw, ride.DestinationRaw)
	if ride.DestinationRaw == "" {
		originDest = ride.OriginRaw
	}

	kw := matching.ValidateSearchKeyword(keywords, originDest)
	if kw == nil {
		return
	}

	// Send ride to driver (via callback)
	if p.onRide != nil {
		p.onRide(d.Phone, ride)
	}

	// Track in DB
	go p.saveRideHistory(d.Phone, ride, "notified")
}

func (p *Processor) saveRideHistory(driverPhone string, ride *Ride, action string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	history := RideHistory{
		MessageID:   ride.MessageID,
		GroupID:     ride.GroupID,
		Origin:      ride.Origin,
		Destination: ride.Destination,
		Body:        ride.Body,
		SenderPhone: ride.SenderPhone,
		DriverPhone: driverPhone,
		Action:      action,
		Timestamp:   ride.Timestamp,
		CreatedAt:   time.Now(),
	}
	p.db.Collection("rides").InsertOne(ctx, history)
}
