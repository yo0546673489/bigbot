package drivers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Cache struct {
	mu      sync.RWMutex
	drivers map[string]*Driver // phone -> driver
	redis   *redis.Client
	mongo   *mongo.Database
}

func NewCache(rdb *redis.Client, db *mongo.Database) *Cache {
	c := &Cache{
		drivers: make(map[string]*Driver),
		redis:   rdb,
		mongo:   db,
	}
	go c.loadAndRefresh()
	return c
}

func (c *Cache) loadAndRefresh() {
	c.load()
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		c.load()
	}
}

func (c *Cache) load() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cursor, err := c.mongo.Collection("drivers").Find(ctx, bson.M{"isApproved": true})
	if err != nil {
		log.Printf("DriversCache: failed to load from mongo: %v", err)
		return
	}
	defer cursor.Close(ctx)

	newDrivers := make(map[string]*Driver)
	pipe := c.redis.Pipeline()

	for cursor.Next(ctx) {
		var d Driver
		if err := cursor.Decode(&d); err != nil {
			continue
		}
		newDrivers[d.Phone] = &d

		data, _ := json.Marshal(&d)
		pipe.Set(ctx, "driver:"+d.Phone, data, 10*time.Minute)
	}

	if _, err := pipe.Exec(ctx); err != nil {
		log.Printf("DriversCache: redis pipeline error: %v", err)
	}

	c.mu.Lock()
	c.drivers = newDrivers
	c.mu.Unlock()

	log.Printf("DriversCache: loaded %d drivers", len(newDrivers))
}

func (c *Cache) Get(phone string) (*Driver, bool) {
	c.mu.RLock()
	d, ok := c.drivers[phone]
	c.mu.RUnlock()
	return d, ok
}

func (c *Cache) GetAll() []*Driver {
	c.mu.RLock()
	list := make([]*Driver, 0, len(c.drivers))
	for _, d := range c.drivers {
		list = append(list, d)
	}
	c.mu.RUnlock()
	return list
}

func (c *Cache) Update(d *Driver) {
	c.mu.Lock()
	c.drivers[d.Phone] = d
	c.mu.Unlock()

	ctx := context.Background()
	data, _ := json.Marshal(d)
	c.redis.Set(ctx, "driver:"+d.Phone, data, 10*time.Minute)
}

func (c *Cache) Invalidate(phone string) {
	c.mu.Lock()
	delete(c.drivers, phone)
	c.mu.Unlock()
	c.redis.Del(context.Background(), "driver:"+phone)
}

// GetKeywords returns search keywords for a driver from MongoDB
func GetKeywords(ctx context.Context, db *mongo.Database, phone string) ([]*DriverSearchKeyword, error) {
	cursor, err := db.Collection("driversearchkeywords").Find(ctx, bson.M{
		"phone":     phone,
		"isBlocked": bson.M{"$ne": true},
	})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var keywords []*DriverSearchKeyword
	if err := cursor.All(ctx, &keywords); err != nil {
		return nil, err
	}
	return keywords, nil
}

// SaveKeyword upserts a driver search keyword
func SaveKeyword(ctx context.Context, db *mongo.Database, phone, keyword string) error {
	_, err := db.Collection("driversearchkeywords").UpdateOne(ctx,
		bson.M{"phone": phone, "keyword": keyword},
		bson.M{
			"$set": bson.M{
				"phone":          phone,
				"keyword":        keyword,
				"lastSearchedAt": time.Now(),
				"isBlocked":      false,
			},
			"$inc":         bson.M{"searchCount": 1},
			"$setOnInsert": bson.M{"createdAt": time.Now()},
		},
		options.Update().SetUpsert(true),
	)
	return err
}

// RemoveKeywords removes all keywords for a driver
func RemoveKeywords(ctx context.Context, db *mongo.Database, phone string) error {
	_, err := db.Collection("driversearchkeywords").DeleteMany(ctx, bson.M{"phone": phone})
	return err
}

// UpsertDriver creates or updates a driver in MongoDB
func UpsertDriver(ctx context.Context, db *mongo.Database, phone, name string) (*Driver, error) {
	now := time.Now()
	filter := bson.M{"phone": phone}
	update := bson.M{
		"$setOnInsert": bson.M{
			"phone":           phone,
			"name":            name,
			"isApproved":      true,
			"isBusy":          false,
			"isActive":        true,
			"language":        "he",
			"filterGroups":    []string{},
			"categoryFilters": []CategoryFilter{},
			"createdAt":       now,
		},
		"$set": bson.M{
			"name": name,
		},
	}

	opts := options.Update().SetUpsert(true)
	_, err := db.Collection("drivers").UpdateOne(ctx, filter, update, opts)
	if err != nil {
		return nil, fmt.Errorf("upsert driver: %w", err)
	}

	var d Driver
	if err := db.Collection("drivers").FindOne(ctx, filter).Decode(&d); err != nil {
		return nil, fmt.Errorf("find driver after upsert: %w", err)
	}
	return &d, nil
}

// SetDriverBusy updates isBusy field
func SetDriverBusy(ctx context.Context, db *mongo.Database, phone string, busy bool) error {
	_, err := db.Collection("drivers").UpdateOne(ctx,
		bson.M{"phone": phone},
		bson.M{"$set": bson.M{"isBusy": busy}},
	)
	return err
}

// DB returns the underlying mongo database
func (c *Cache) DB() *mongo.Database {
	return c.mongo
}

// GetFromDB fetches a driver directly from MongoDB
func (c *Cache) GetFromDB(ctx context.Context, phone string) (*Driver, error) {
	var d Driver
	err := c.mongo.Collection("drivers").FindOne(ctx, bson.M{"phone": phone}).Decode(&d)
	if err != nil {
		return nil, err
	}
	return &d, nil
}
