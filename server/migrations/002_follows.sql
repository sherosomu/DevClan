-- Run once on an existing database (init-schema.sql already includes this for fresh installs):
--   psql "$DATABASE_URL" -f server/migrations/002_follows.sql

CREATE TABLE IF NOT EXISTS follows (
  follower_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

-- "who follows X?" is the query fan-out runs on every post; the primary key covers the other direction.
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows (following_id, follower_id);

-- Timeline rebuilds read "recent posts by these authors".
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON posts (author_id, created_at DESC);

-- Demo users so the Following feed can be tried by switching users in the UI.
INSERT INTO users (id, username, email) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'alice', 'alice@devclan.local'),
  ('a0000000-0000-0000-0000-000000000003', 'bob',   'bob@devclan.local'),
  ('a0000000-0000-0000-0000-000000000004', 'carol', 'carol@devclan.local'),
  ('a0000000-0000-0000-0000-000000000005', 'dave',  'dave@devclan.local')
ON CONFLICT DO NOTHING;
