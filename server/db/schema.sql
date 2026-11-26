-- ============================================================================
-- DevClan v2 — Schema Migration
-- Builds on the existing users/posts/comments/followers/notifications tables.
-- New in this migration:
--   1. post_votes          -> replaces the boolean `likes` table with signed votes (+1/-1)
--   2. tags + post_tags    -> normalized tag pills for the UI
--   3. Composite indexes   -> support index range scans instead of seq scans
--   4. mv_post_engagement  -> materialized view pre-aggregating vote/comment counts
--
-- Design note: the hot-score formula includes a continuous variable, T (hours
-- since posting), which changes every second. You CANNOT bake a continuously
-- decaying value into a materialized view and expect it to stay correct.
-- So the split is:
--    - vote/comment COUNTS  -> precomputed in the MV (expensive to aggregate live)
--    - time decay            -> computed at query time (cheap arithmetic,
--                               and the WHERE clause on c_t hits an index
--                               range scan, not a full table scan)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Votes: replaces `likes` (boolean) with a signed vote so we can support
--    upvote/downvote instead of like-only. One row per (user, post).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_votes (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    vote_value  SMALLINT NOT NULL CHECK (vote_value IN (1, -1)),
    c_t         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, post_id)
);

-- Migrate existing `likes` rows forward as upvotes (safe if `likes` doesn't exist yet).
INSERT INTO post_votes (user_id, post_id, vote_value, c_t)
SELECT user_id, post_id, 1, c_t FROM likes
ON CONFLICT (user_id, post_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Tags: normalized, many-to-many with posts (dynamic tag pills in the UI)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
    id      SERIAL PRIMARY KEY,
    name    VARCHAR(40) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS post_tags (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
);

-- Optional: code-snippet metadata for syntax highlighting on the card
ALTER TABLE posts ADD COLUMN IF NOT EXISTS code_snippet TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS code_language VARCHAR(30);

-- ----------------------------------------------------------------------------
-- 3. Composite / covering indexes
--    Every index here maps to a query pattern the app actually runs.
-- ----------------------------------------------------------------------------

-- "Latest" feed & cursor pagination by time (DESC because feeds page backwards in time)
CREATE INDEX IF NOT EXISTS idx_posts_c_t_desc ON posts (c_t DESC);

-- Per-user post history (profile pages), newest first
CREATE INDEX IF NOT EXISTS idx_posts_user_c_t ON posts (user_id, c_t DESC);

-- Hot-feed candidate window: "posts from the last N hours" range scan
CREATE INDEX IF NOT EXISTS idx_posts_c_t_recent ON posts (c_t) WHERE c_t > (now() - INTERVAL '72 hours');

-- Vote lookups: "all votes for a post" (aggregation) and "did user X vote on Y"
CREATE INDEX IF NOT EXISTS idx_post_votes_post ON post_votes (post_id);
CREATE INDEX IF NOT EXISTS idx_post_votes_user ON post_votes (user_id);

-- Comment counts per post + newest-first comment threads
CREATE INDEX IF NOT EXISTS idx_comments_post_c_t ON comments (post_id, c_t DESC);

-- Follow graph traversal in both directions (fan-out needs "who follows user X")
CREATE INDEX IF NOT EXISTS idx_followers_following ON followers (following_id, follower_id);
CREATE INDEX IF NOT EXISTS idx_followers_follower ON followers (follower_id, following_id);

-- Unread notification lookups (bell icon count)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id) WHERE "isread" = FALSE;

-- ----------------------------------------------------------------------------
-- 4. Materialized view: pre-aggregated engagement counts per post.
--    This is the expensive part (GROUP BY over votes/comments) — do it once,
--    on a schedule, instead of on every feed request.
-- ----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_post_engagement AS
SELECT
    p.id                                                    AS post_id,
    p.user_id,
    p.c_t,
    COALESCE(SUM(CASE WHEN pv.vote_value = 1 THEN 1 ELSE 0 END), 0)::INT  AS upvotes,
    COALESCE(SUM(CASE WHEN pv.vote_value = -1 THEN 1 ELSE 0 END), 0)::INT AS downvotes,
    COALESCE((SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id), 0)::INT AS comment_count
FROM posts p
LEFT JOIN post_votes pv ON pv.post_id = p.id
GROUP BY p.id, p.user_id, p.c_t;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY (no read lock)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_post_engagement_post_id ON mv_post_engagement (post_id);
CREATE INDEX IF NOT EXISTS idx_mv_post_engagement_c_t ON mv_post_engagement (c_t DESC);

-- Refresh cadence: call this from a cron job / node-cron worker every 30-60s.
-- `CONCURRENTLY` means readers never block on the refresh.
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_post_engagement;

COMMIT;
