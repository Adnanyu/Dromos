package main

import (
	"context"
	"log"
	"os"

	"stride/activity_service/internal/activity"
	"stride/activity_service/internal/httpapi"
	"stride/activity_service/internal/realtime"
)

func main() {
	ctx := context.Background()
	cfg := httpapi.Config{
		Addr:        env("ACTIVITY_SERVICE_ADDR", ":8082"),
		DatabaseURL: env("ACTIVITY_DATABASE_URL", "postgres://stride:stride@127.0.0.1:5433/stride_activities"),
		RedisAddr:   env("ACTIVITY_REDIS_ADDR", "127.0.0.1:6379"),
		UserServiceURL: env("USER_SERVICE_URL", "http://127.0.0.1:8084"),
		SocialServiceURL: env("SOCIAL_SERVICE_URL", "http://127.0.0.1:8085"),
		NotificationServiceURL: env("NOTIFICATION_SERVICE_URL", "http://127.0.0.1:8086"),
	}

	repo, err := activity.NewPostgresRepository(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("activity repository: %v", err)
	}
	defer repo.Close()

	sessionStore := realtime.NewRedisSessionStore(cfg.RedisAddr)
	userStats := activity.NewUserStatsClient(cfg.UserServiceURL)
	socialFeed := activity.NewSocialFeedClient(cfg.SocialServiceURL)
	notifications := activity.NewNotificationClient(cfg.NotificationServiceURL)
	tracker := activity.NewService(repo, sessionStore, userStats, socialFeed, notifications)
	server := httpapi.NewServer(cfg, tracker)

	if err := server.Listen(cfg.Addr); err != nil {
		log.Fatalf("activity service stopped: %v", err)
	}
}

func env(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
