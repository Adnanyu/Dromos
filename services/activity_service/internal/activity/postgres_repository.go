package activity

import (
	"context"
	_ "embed"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/001_init.sql
var initSQL string

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(ctx context.Context, databaseURL string) (*PostgresRepository, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if _, err := pool.Exec(ctx, initSQL); err != nil {
		pool.Close()
		return nil, err
	}
	return &PostgresRepository{pool: pool}, nil
}

func (r *PostgresRepository) Close() {
	r.pool.Close()
}

func (r *PostgresRepository) CreateActivity(ctx context.Context, userID string, req StartActivityRequest) (Activity, error) {
	id := uuid.NewString()
	startedAt := time.Now().UTC()
	_, err := r.pool.Exec(
		ctx,
		`INSERT INTO activities (id, user_id, route_id, activity_type, status, started_at, planned_distance_m)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		id,
		userID,
		req.RouteID,
		req.ActivityType,
		StatusInProgress,
		startedAt,
		req.PlannedDistanceM,
	)
	if err != nil {
		return Activity{}, err
	}
	return r.GetActivity(ctx, id)
}

func (r *PostgresRepository) GetActivity(ctx context.Context, activityID string) (Activity, error) {
	row := r.pool.QueryRow(
		ctx,
		`SELECT id::text, user_id::text, route_id::text, activity_type, status, started_at, ended_at,
		        planned_distance_m, actual_distance_m, duration_s, avg_pace_s_per_km, avg_speed_kmh,
		        elevation_gain_m, calories
		   FROM activities
		  WHERE id = $1`,
		activityID,
	)
	return scanActivity(row)
}

func (r *PostgresRepository) ListUserActivities(ctx context.Context, userID string, limit int) ([]Activity, error) {
	rows, err := r.pool.Query(
		ctx,
		`SELECT id::text, user_id::text, route_id::text, activity_type, status, started_at, ended_at,
		        planned_distance_m, actual_distance_m, duration_s, avg_pace_s_per_km, avg_speed_kmh,
		        elevation_gain_m, calories
		   FROM activities
		  WHERE user_id = $1
		  ORDER BY started_at DESC
		  LIMIT $2`,
		userID,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	activities := make([]Activity, 0)
	for rows.Next() {
		activity, err := scanActivity(rows)
		if err != nil {
			return nil, err
		}
		activities = append(activities, activity)
	}
	return activities, rows.Err()
}

func (r *PostgresRepository) UpdateStatus(ctx context.Context, activityID string, userID string, status ActivityStatus, endedAt *time.Time) (Activity, error) {
	commandTag, err := r.pool.Exec(
		ctx,
		`UPDATE activities
		    SET status = $1,
		        ended_at = COALESCE($2, ended_at),
		        duration_s = CASE WHEN $2::timestamptz IS NULL THEN duration_s ELSE EXTRACT(EPOCH FROM ($2 - started_at))::int END
		  WHERE id = $3 AND user_id = $4`,
		status,
		endedAt,
		activityID,
		userID,
	)
	if err != nil {
		return Activity{}, err
	}
	if commandTag.RowsAffected() == 0 {
		return Activity{}, pgx.ErrNoRows
	}
	if status == StatusCompleted {
		if err := r.finalizeActivity(ctx, activityID); err != nil {
			return Activity{}, err
		}
	}
	return r.GetActivity(ctx, activityID)
}

func (r *PostgresRepository) finalizeActivity(ctx context.Context, activityID string) error {
	_, err := r.pool.Exec(
		ctx,
		`WITH track AS (
		   SELECT
		     ST_MakeLine(ST_SetSRID(ST_MakePoint(lng, lat), 4326) ORDER BY time) AS geom,
		     COALESCE(SUM(GREATEST(elevation_m - lag_elevation_m, 0)), 0) AS elevation_gain_m
		   FROM (
		     SELECT
		       time,
		       lat,
		       lng,
		       elevation_m,
		       LAG(elevation_m) OVER (ORDER BY time) AS lag_elevation_m
		     FROM activity_gps_points
		     WHERE activity_id = $1
		   ) points
		 )
		 UPDATE activities
		    SET track_geometry = track.geom,
		        actual_distance_m = COALESCE(ST_Length(track.geom::geography), 0),
		        elevation_gain_m = track.elevation_gain_m,
		        avg_speed_kmh = CASE
		          WHEN duration_s > 0 THEN (COALESCE(ST_Length(track.geom::geography), 0) / 1000) / (duration_s::double precision / 3600)
		          ELSE NULL
		        END,
		        avg_pace_s_per_km = CASE
		          WHEN COALESCE(ST_Length(track.geom::geography), 0) > 0 THEN duration_s / (COALESCE(ST_Length(track.geom::geography), 0) / 1000)
		          ELSE NULL
		        END
		   FROM track
		  WHERE activities.id = $1`,
		activityID,
	)
	return err
}

func (r *PostgresRepository) InsertGPSPoints(ctx context.Context, activityID string, points []GPSPoint) error {
	batch := &pgx.Batch{}
	for _, point := range points {
		batch.Queue(
			`INSERT INTO activity_gps_points
			 (time, activity_id, lat, lng, elevation_m, accuracy_m, speed_kmh, heart_rate_bpm)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			point.Timestamp,
			activityID,
			point.Lat,
			point.Lng,
			point.ElevationM,
			point.AccuracyM,
			point.SpeedKMH,
			point.HeartRateBPM,
		)
	}
	results := r.pool.SendBatch(ctx, batch)
	defer results.Close()
	for range points {
		if _, err := results.Exec(); err != nil {
			return err
		}
	}
	return nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scanActivity(row scanner) (Activity, error) {
	var routeID *string
	activity := Activity{}
	err := row.Scan(
		&activity.ID,
		&activity.UserID,
		&routeID,
		&activity.ActivityType,
		&activity.Status,
		&activity.StartedAt,
		&activity.EndedAt,
		&activity.PlannedDistanceM,
		&activity.ActualDistanceM,
		&activity.DurationS,
		&activity.AvgPaceSPKM,
		&activity.AvgSpeedKMH,
		&activity.ElevationGainM,
		&activity.Calories,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Activity{}, err
		}
		return Activity{}, err
	}
	activity.RouteID = routeID
	return activity, nil
}
