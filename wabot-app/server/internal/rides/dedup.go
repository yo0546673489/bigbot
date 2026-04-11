package rides

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type Deduplicator struct {
	rdb *redis.Client
}

func NewDeduplicator(rdb *redis.Client) *Deduplicator {
	return &Deduplicator{rdb: rdb}
}

// IsDuplicate returns true if this message was already processed.
// Uses SETNX so only the first call returns false.
func (d *Deduplicator) IsDuplicate(messageID string) bool {
	key := fmt.Sprintf("wa:msg:seen:%s", messageID)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	set, err := d.rdb.SetNX(ctx, key, "1", 30*time.Second).Result()
	if err != nil {
		// On Redis error, assume duplicate to be safe
		return true
	}
	return !set
}

// IsDriverMessageDuplicate prevents sending the same ride to the same driver twice
func (d *Deduplicator) IsDriverMessageDuplicate(driverPhone, groupID, messageID string) bool {
	key := fmt.Sprintf("wa:regular:dedupe:%s:%s:%s", driverPhone, groupID, messageID)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	set, err := d.rdb.SetNX(ctx, key, "1", 11*time.Second).Result()
	if err != nil {
		return true
	}
	return !set
}
