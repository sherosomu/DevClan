# DevClan v2 — Upgrade Package

Drop these into your existing `DevClan` repo (paths mirror your `server/` and `frontend/` folders).

## New/changed files
```
server/
  db/schema.sql              # migration: post_votes, tags, indexes, materialized view
  db/pool.js                 # pg connection pool config
  db/redisClient.js          # ioredis client
  services/feedService.js    # trending score query + Redis ZSET fan-out
  middleware/rateLimiter.js  # sliding-window rate limiter (Lua/EVAL, atomic)
  controllers/postController.js  # atomic vote endpoint, cursor pagination
  routes/postRoutes.js       # wires it all together

frontend/
  tailwind.config.js
  src/components/feed/
    FeedSwitcher.jsx         # animated Trending/Following/Latest tabs
    PostCard.jsx             # syntax-highlighted card, optimistic votes
    PostCardSkeleton.jsx     # shimmer loaders
    Feed.jsx                 # container: cursor pagination + infinite scroll

ARCHITECTURE.md              # design writeup (OFFSET, race conditions, latency)
```

## New dependencies to install
```
cd server && npm install ioredis
cd frontend && npm install framer-motion lucide-react react-syntax-highlighter axios
```

## Setup steps
1. Run `server/db/schema.sql` against your existing Postgres database.
2. Set up a Redis instance (local via `docker run -p 6379:6379 redis` for dev, or a managed instance in prod).
3. Add `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` to `.env`.
4. Schedule `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_post_engagement;` on an interval — a simple `node-cron` job calling `pool.query(...)` every 30–60s is enough at this scale.
5. Wire `postRoutes.js` into your existing Express app (`app.use(postRoutes)`), and make sure `req.user` is populated by your existing Passport session middleware before these routes run.
