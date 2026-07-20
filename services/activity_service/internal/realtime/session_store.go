package realtime

import (
	"context"
	"encoding/json"
	"time"

	"dromos/activity_service/internal/activity"

	"github.com/redis/go-redis/v9"
)

type RedisSessionStore struct {
	client *redis.Client
}

func NewRedisSessionStore(addr string) RedisSessionStore {
	return RedisSessionStore{
		client: redis.NewClient(&redis.Options{Addr: addr}),
	}
}

func (s RedisSessionStore) Start(ctx context.Context, activity activity.Activity) error {
	key := sessionKey(activity.ID)
	values := map[string]any{
		"activity_id": activity.ID,
		"user_id":     activity.UserID,
		"status":      string(activity.Status),
		"started_at":  activity.StartedAt.Format(time.RFC3339Nano),
	}
	return s.client.HSet(ctx, key, values).Err()
}

func (s RedisSessionStore) UpdateStats(ctx context.Context, stats activity.LiveStats) error {
	raw, err := json.Marshal(stats)
	if err != nil {
		return err
	}
	key := sessionKey(stats.ActivityID)
	pipe := s.client.TxPipeline()
	pipe.HSet(ctx, key, "latest_stats", string(raw))
	pipe.Expire(ctx, key, 24*time.Hour)
	_, err = pipe.Exec(ctx)
	return err
}

func (s RedisSessionStore) End(ctx context.Context, activityID string) error {
	return s.client.Del(ctx, sessionKey(activityID)).Err()
}

func sessionKey(activityID string) string {
	return "activity:session:" + activityID
}

