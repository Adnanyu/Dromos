package activity

import "time"

type ActivityType string

const (
	ActivityRunning ActivityType = "running"
	ActivityCycling ActivityType = "cycling"
)

type ActivityStatus string

const (
	StatusInProgress ActivityStatus = "in_progress"
	StatusPaused     ActivityStatus = "paused"
	StatusCompleted  ActivityStatus = "completed"
	StatusCancelled  ActivityStatus = "cancelled"
)

type Activity struct {
	ID               string         `json:"id"`
	UserID           string         `json:"user_id"`
	RouteID          *string        `json:"route_id,omitempty"`
	ActivityType     ActivityType   `json:"activity_type"`
	Status           ActivityStatus `json:"status"`
	StartedAt        time.Time      `json:"started_at"`
	EndedAt          *time.Time     `json:"ended_at,omitempty"`
	PlannedDistanceM *float64     `json:"planned_distance_m,omitempty"`
	ActualDistanceM  float64       `json:"actual_distance_m"`
	DurationS        int64         `json:"duration_s"`
	AvgPaceSPKM      *float64      `json:"avg_pace_s_per_km,omitempty"`
	AvgSpeedKMH      *float64      `json:"avg_speed_kmh,omitempty"`
	ElevationGainM   float64       `json:"elevation_gain_m"`
	Calories         int           `json:"calories"`
}

type GPSPoint struct {
	Lat          float64   `json:"lat"`
	Lng          float64   `json:"lng"`
	ElevationM   *float64  `json:"elevation_m,omitempty"`
	AccuracyM    *float64  `json:"accuracy_m,omitempty"`
	SpeedKMH     *float64  `json:"speed_kmh,omitempty"`
	HeartRateBPM *int      `json:"heart_rate_bpm,omitempty"`
	Timestamp    time.Time `json:"timestamp"`
}

type LiveStats struct {
	ActivityID      string   `json:"activity_id"`
	DistanceM       float64  `json:"distance_m"`
	PaceSPKM        *float64 `json:"pace_s_per_km,omitempty"`
	ElapsedS        int64    `json:"elapsed_s"`
	ElevationGainM  float64  `json:"elevation_gain_m"`
	CurrentPosition GPSPoint `json:"current_position"`
}

type StartActivityRequest struct {
	RouteID          *string      `json:"route_id"`
	ActivityType     ActivityType `json:"activity_type"`
	PlannedDistanceM *float64     `json:"planned_distance_m"`
}

type UpdateActivityRequest struct {
	Status ActivityStatus `json:"status"`
}

type GPSBatchMessage struct {
	Type   string     `json:"type"`
	Points []GPSPoint `json:"points"`
}