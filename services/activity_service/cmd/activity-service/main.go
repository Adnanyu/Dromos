package main

import (
	"context"
	"log"
	"os"

	"dromos/activity_service/internal/activity"
	"dromos/activity_service/internal/httpapi"
	"dromos/activity_service/internal/realtime"
)

func main() {
	ctx := context.Background()
	cfg := httpapi.Config{
		Addr:        env("ACTIVITY_SERVICE_ADDR", ":8082"),
		DatabaseURL: env("ACTIVITY_DATABASE_URL", "postgres://dromos:dromos@127.0.0.1:5433/dromos_activities"),
		RedisAddr:   env("ACTIVITY_REDIS_ADDR", "127.0.0.1:6379"),
		UserServiceURL: env("USER_SERVICE_URL", "http://127.0.0.1:8084"),
		NotificationServiceURL: env("NOTIFICATION_SERVICE_URL", "http://127.0.0.1:8086"),
	}

	repo, err := activity.NewPostgresRepository(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("activity repository: %v", err)
	}
	defer repo.Close()

	sessionStore := realtime.NewRedisSessionStore(cfg.RedisAddr)
	userStats := activity.NewUserStatsClient(cfg.UserServiceURL)
	notifications := activity.NewNotificationClient(cfg.NotificationServiceURL)
	tracker := activity.NewService(repo, sessionStore, userStats, notifications)
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
