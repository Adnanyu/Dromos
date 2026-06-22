CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE distance_units AS ENUM ('metric', 'imperial');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE profile_visibility AS ENUM ('public', 'followers', 'private');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  email VARCHAR NOT NULL,
  username VARCHAR NOT NULL UNIQUE,
  first_name VARCHAR,
  last_name VARCHAR,
  avatar_url VARCHAR,
  preferred_activities TEXT[] NOT NULL DEFAULT ARRAY['running', 'cycling'],
  units distance_units NOT NULL DEFAULT 'metric',
  visibility profile_visibility NOT NULL DEFAULT 'public',
  location VARCHAR,
  total_distance_m DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_activities INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles (lower(username));
CREATE INDEX IF NOT EXISTS idx_profiles_search ON profiles USING GIN (to_tsvector('simple', coalesce(username, '') || ' ' || coalesce(first_name, '') || ' ' || coalesce(last_name, '')));

CREATE OR REPLACE FUNCTION public_profile(profile profiles)
RETURNS JSONB
LANGUAGE SQL
STABLE
AS $$
  SELECT jsonb_build_object(
    'user_id', profile.user_id,
    'username', profile.username,
    'first_name', profile.first_name,
    'last_name', profile.last_name,
    'avatar_url', profile.avatar_url,
    'preferred_activities', profile.preferred_activities,
    'units', profile.units,
    'visibility', profile.visibility,
    'location', profile.location,
    'total_distance_m', profile.total_distance_m,
    'total_activities', profile.total_activities,
    'created_at', profile.created_at
  );
$$;
