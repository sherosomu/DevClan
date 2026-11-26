CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  upvotes INTEGER DEFAULT 0 CHECK (upvotes >= 0),
  downvotes INTEGER DEFAULT 0 CHECK (downvotes >= 0),
  score INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  direction SMALLINT NOT NULL CHECK (direction IN (-1, 1)),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_user_post_vote UNIQUE (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_score_created ON posts(score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_votes_user_post ON votes(user_id, post_id);

-- Insert a test seed user for initial posts
INSERT INTO users (id, username, email)
VALUES ('a0000000-0000-0000-0000-000000000001', 'demo_user', 'demo@devclan.local')
ON CONFLICT (username) DO NOTHING;

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

-- Sample posts (+ matching votes so the denormalized counters equal the votes table).
INSERT INTO posts (id, author_id, title, content, tags, upvotes, score, created_at) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Why cursor pagination beats OFFSET', 'OFFSET makes Postgres read and discard every skipped row. A cursor seeks straight to where you left off.', ARRAY['postgres','performance'], 3, 3, NOW() - INTERVAL '3 hours'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'Redis sorted sets for timelines', 'Fan-out on write: push each new post id into every follower''s sorted set, read with ZREVRANGEBYSCORE.', ARRAY['redis','systems'], 2, 2, NOW() - INTERVAL '90 minutes'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'Token bucket vs sliding window', 'Token bucket allows bursts at a steady refill rate; a sliding window enforces a hard cap per interval.', ARRAY['backend'], 1, 1, NOW() - INTERVAL '20 minutes')
ON CONFLICT DO NOTHING;

INSERT INTO votes (user_id, post_id, direction) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 1),
  ('a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 1),
  ('a0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', 1),
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 1),
  ('a0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000002', 1),
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 1)
ON CONFLICT DO NOTHING;
