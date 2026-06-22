CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE activity_type AS ENUM ('running', 'cycling');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE activity_status AS ENUM ('in_progress', 'paused', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  route_id UUID,
  activity_type activity_type NOT NULL,
  status activity_status NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  planned_distance_m DOUBLE PRECISION,
  actual_distance_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  duration_s INTEGER NOT NULL DEFAULT 0,
  avg_pace_s_per_km DOUBLE PRECISION,
  avg_speed_kmh DOUBLE PRECISION,
  elevation_gain_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  calories INTEGER NOT NULL DEFAULT 0,
  track_geometry GEOMETRY(LINESTRING, 4326)
);

CREATE TABLE IF NOT EXISTS activity_gps_points (
  time TIMESTAMPTZ NOT NULL,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  elevation_m REAL,
  accuracy_m REAL,
  speed_kmh REAL,
  heart_rate_bpm SMALLINT
);

SELECT create_hypertable('activity_gps_points', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');

CREATE INDEX IF NOT EXISTS idx_activities_user_started ON activities (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_status ON activities (status);
CREATE INDEX IF NOT EXISTS idx_activities_track_gist ON activities USING GIST (track_geometry);
CREATE INDEX IF NOT EXISTS idx_gps_act_time ON activity_gps_points (activity_id, time DESC);

