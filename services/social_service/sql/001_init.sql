CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID NOT NULL,
  following_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE TABLE IF NOT EXISTS route_likes (
  user_id UUID NOT NULL,
  route_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, route_id)
);

CREATE TABLE IF NOT EXISTS route_owners (
  route_id UUID PRIMARY KEY,
  creator_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_owners (
  activity_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS route_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  route_id UUID NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS route_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL,
  shared_by UUID NOT NULL,
  shared_to UUID,
  share_token VARCHAR NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_kudos (
  user_id UUID NOT NULL,
  activity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, activity_id)
);

CREATE TABLE IF NOT EXISTS feed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  target_user_id UUID,
  item_type VARCHAR NOT NULL,
  route_id UUID,
  activity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_follows_following ON follows (following_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_owners_creator ON route_owners (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_owners_user ON activity_owners (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_likes_route ON route_likes (route_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_comments_route ON route_comments (route_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_shares_token ON route_shares (share_token);
CREATE INDEX IF NOT EXISTS idx_activity_kudos_activity ON activity_kudos (activity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_actor_created ON feed_items (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_target_created ON feed_items (target_user_id, created_at DESC);
