CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE activity_type AS ENUM ('running', 'cycling', 'hiking');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE route_difficulty AS ENUM ('easy', 'moderate', 'hard', 'extreme');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE surface_type AS ENUM ('road', 'trail', 'mixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE waypoint_type AS ENUM ('start', 'end', 'via', 'poi');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS routes (
  id UUID PRIMARY KEY,
  creator_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  activity_type activity_type NOT NULL,
  distance_m DOUBLE PRECISION NOT NULL,
  elevation_gain_m DOUBLE PRECISION NOT NULL,
  difficulty route_difficulty NOT NULL,
  is_loop BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT true,
  surface_type surface_type NOT NULL,
  geometry GEOMETRY(LINESTRING, 4326) NOT NULL,
  start_point GEOMETRY(POINT, 4326) NOT NULL,
  end_point GEOMETRY(POINT, 4326) NOT NULL,
  thumbnail_url VARCHAR,
  view_count INTEGER NOT NULL DEFAULT 0,
  elevation_profile JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_duration_s INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS route_waypoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  sequence_order INTEGER NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  type waypoint_type NOT NULL,
  label VARCHAR,
  UNIQUE (route_id, sequence_order)
);

CREATE INDEX IF NOT EXISTS idx_routes_creator_id ON routes (creator_id);
CREATE INDEX IF NOT EXISTS idx_routes_activity_created ON routes (activity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_routes_start_gist ON routes USING GIST (start_point);
CREATE INDEX IF NOT EXISTS idx_routes_geom_gist ON routes USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_route_waypoints_route_order ON route_waypoints (route_id, sequence_order);

