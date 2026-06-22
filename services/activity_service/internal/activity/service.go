package activity

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"
)

type Repository interface {
	CreateActivity(ctx context.Context, userID string, req StartActivityRequest) (Activity, error)
	GetActivity(ctx context.Context, activityID string) (Activity, error)
	ListUserActivities(ctx context.Context, userID string, limit int) ([]Activity, error)
	UpdateStatus(ctx context.Context, activityID string, userID string, status ActivityStatus, endedAt *time.Time) (Activity, error)
	InsertGPSPoints(ctx context.Context, activityID string, points []GPSPoint) error
}

type SessionStore interface {
	Start(ctx context.Context, activity Activity) error
	UpdateStats(ctx context.Context, stats LiveStats) error
	End(ctx context.Context, activityID string) error
}

type UserStatsSink interface {
	ActivityCompleted(ctx context.Context, userID string, distanceM float64) error
}

type SocialFeedSink interface {
	ActivityCompleted(ctx context.Context, userID string, activityID string, distanceM float64) error
}

type NotificationSink interface {
	ActivityCompleted(ctx context.Context, userID string, activityID string, distanceM float64) error
}

type Service struct {
	repo      Repository
	sessions  SessionStore
	userStats UserStatsSink
	socialFeed SocialFeedSink
	notifications NotificationSink
}

func NewService(repo Repository, sessions SessionStore, userStats UserStatsSink, socialFeed SocialFeedSink, notifications NotificationSink) Service {
	return Service{repo: repo, sessions: sessions, userStats: userStats, socialFeed: socialFeed, notifications: notifications}
}

func (s Service) Start(ctx context.Context, userID string, req StartActivityRequest) (Activity, error) {
	if req.ActivityType == "" {
		req.ActivityType = ActivityRunning
	}
	if req.ActivityType != ActivityRunning && req.ActivityType != ActivityCycling {
		return Activity{}, errors.New("activity_type must be running or cycling")
	}
	activity, err := s.repo.CreateActivity(ctx, userID, req)
	if err != nil {
		return Activity{}, err
	}
	return activity, s.sessions.Start(ctx, activity)
}

func (s Service) UpdateStatus(ctx context.Context, activityID string, userID string, status ActivityStatus) (Activity, error) {
	switch status {
	case StatusPaused, StatusInProgress, StatusCompleted, StatusCancelled:
	default:
		return Activity{}, fmt.Errorf("unsupported activity status %q", status)
	}

	var endedAt *time.Time
	if status == StatusCompleted || status == StatusCancelled {
		now := time.Now().UTC()
		endedAt = &now
	}

	activity, err := s.repo.UpdateStatus(ctx, activityID, userID, status, endedAt)
	if err != nil {
		return Activity{}, err
	}
	if endedAt != nil {
		if err := s.sessions.End(ctx, activityID); err != nil {
			return Activity{}, err
		}
		if status == StatusCompleted && s.userStats != nil {
			if err := s.userStats.ActivityCompleted(ctx, activity.UserID, activity.ActualDistanceM); err != nil {
				return Activity{}, err
			}
		}
		if status == StatusCompleted && s.socialFeed != nil {
			if err := s.socialFeed.ActivityCompleted(ctx, activity.UserID, activity.ID, activity.ActualDistanceM); err != nil {
				return Activity{}, err
			}
		}
		if status == StatusCompleted && s.notifications != nil {
			if err := s.notifications.ActivityCompleted(ctx, activity.UserID, activity.ID, activity.ActualDistanceM); err != nil {
				return Activity{}, err
			}
		}
	}
	return activity, nil
}

func (s Service) Get(ctx context.Context, activityID string) (Activity, error) {
	return s.repo.GetActivity(ctx, activityID)
}

func (s Service) ListUserActivities(ctx context.Context, userID string, limit int) ([]Activity, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	return s.repo.ListUserActivities(ctx, userID, limit)
}

func (s Service) IngestGPSBatch(ctx context.Context, activity *Activity, points []GPSPoint) (LiveStats, error) {
	if len(points) == 0 {
		return LiveStats{}, errors.New("gps batch must include at least one point")
	}
	if err := s.repo.InsertGPSPoints(ctx, activity.ID, points); err != nil {
		return LiveStats{}, err
	}
	stats := computeLiveStats(*activity, points)

	// Update the in-memory activity so subsequent batches accumulate correctly.
	activity.ActualDistanceM = stats.DistanceM
	activity.ElevationGainM = stats.ElevationGainM

	return stats, s.sessions.UpdateStats(ctx, stats)
}

func computeLiveStats(activity Activity, points []GPSPoint) LiveStats {
	// Compute the delta for THIS batch only.
	batchDistance := 0.0
	batchElevation := 0.0
	for idx := 1; idx < len(points); idx++ {
		previous := points[idx-1]
		current := points[idx]
		batchDistance += haversineM(previous.Lat, previous.Lng, current.Lat, current.Lng)
		if previous.ElevationM != nil && current.ElevationM != nil {
			delta := *current.ElevationM - *previous.ElevationM
			if delta > 0 {
				batchElevation += delta
			}
		}
	}

	// Accumulate on top of the persisted totals so distance never resets between batches.
	totalDistance := activity.ActualDistanceM + batchDistance
	totalElevation := activity.ElevationGainM + batchElevation

	elapsed := int64(time.Since(activity.StartedAt).Seconds())

	var pace *float64
	if totalDistance > 0 && elapsed > 0 {
		value := float64(elapsed) / (totalDistance / 1000)
		pace = &value
	}

	return LiveStats{
		ActivityID:      activity.ID,
		DistanceM:       totalDistance,
		PaceSPKM:        pace,
		ElapsedS:        elapsed,
		ElevationGainM:  totalElevation,
		CurrentPosition: points[len(points)-1],
	}
}

func haversineM(lat1, lng1, lat2, lng2 float64) float64 {
	const earthRadiusM = 6371000
	phi1 := lat1 * math.Pi / 180
	phi2 := lat2 * math.Pi / 180
	dPhi := (lat2 - lat1) * math.Pi / 180
	dLambda := (lng2 - lng1) * math.Pi / 180
	a := math.Sin(dPhi/2)*math.Sin(dPhi/2) + math.Cos(phi1)*math.Cos(phi2)*math.Sin(dLambda/2)*math.Sin(dLambda/2)
	return 2 * earthRadiusM * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}