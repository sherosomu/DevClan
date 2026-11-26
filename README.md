# DevClan v2 — Ranked Developer Feed

A developer discussion feed focused on **ranking, caching, timelines and concurrency-safe voting**.
React + Tailwind frontend, Node/Express API, PostgreSQL, Redis.

> This branch is a focused rebuild of the feed core. The original full app (Passport session auth,
> comments, notifications, search) lives on `main`.

## Features

- **Hot / New / Top feeds** — Hacker-News-style time-decay ranking `score / (hours + 2)^1.8`, cached in Redis sorted sets
- **Following feed via fan-out on write** — publishing a post pushes its id into each follower's Redis sorted set
  (`timeline:<userId>`, score = timestamp); reads use `ZREVRANGEBYSCORE` cursor pagination instead of SQL `OFFSET`
- **Atomic voting** — `INSERT ... ON CONFLICT` inside a CTE that keeps `score/upvotes/downvotes` consistent, plus a
  per-(user, post) advisory lock so concurrent votes from one user can't corrupt the counters
- **Distributed rate limiter** — one atomic Redis Lua script combining a **token bucket** (burst + steady refill)
  and a **sliding window** (hard cap per interval), shared across API instances
- **Application-layer (L7) flood protection** — a global per-IP limit that runs *before* CORS, body parsing and auth
  (so a flood can't cost Postgres lookups; `/health` and unknown routes are covered too), per-route budgets on top,
  an in-process fallback limiter if Redis goes down (instead of failing open), and tight HTTP header/request timeouts
  against slow-connection attacks
- Follow / unfollow, post composer, demo-user switcher, optimistic vote UI with rollback, skeleton loaders

## Where each piece lives

| Feature | Code | Tests |
|---|---|---|
| Time-decay Hot ranking | `server/lib/feedCursor.js` (`hotScore`), `server/services/feedService.js` | `tests/feedCursor.test.js` |
| Redis ZSET fan-out timeline + `ZREVRANGEBYSCORE` cursor pagination | `server/services/timelineService.js`, `feedService.js` (`readZsetPage`), `server/lib/feedCursor.js` | `tests/timeline.integration.test.js`, `tests/feedCursor.test.js` |
| Atomic voting (UPSERT CTE + per-(user, post) advisory lock) | `server/controllers/postController.js` (`handleVote`) | `tests/vote.integration.test.js`, `tests/vote.spike.integration.test.js` |
| Redis token-bucket + sliding-window rate limiter | `server/middleware/rateLimiter.js`, applied globally in `server/index.js` and per route in `server/routes/*.js` | `tests/rateLimiter.integration.test.js` |
| Flood / DDoS hardening (L7) | `server/index.js` (global limiter, HTTP timeouts), `server/lib/localLimiter.js` (Redis-outage fallback) | `tests/flood.integration.test.js`, `tests/rateLimiter.failover.test.js`, `tests/localLimiter.test.js` |

## Not implemented (listed honestly)

- Real authentication: the app uses **demo auth** (`server/middleware/auth.js`) with 5 seeded users you can switch between
- No materialized views; no comment-count term in the ranking
- No celebrity-account handling for fan-out (cost grows with follower count; see ARCHITECTURE.md)
- No volumetric (L3/L4) DDoS protection: everything here is application-layer and per-IP. Floods that saturate the
  network link or the connection table need a CDN/WAF/cloud scrubbing in front (see ARCHITECTURE.md section 5)
- No throughput/latency benchmarks. The spike tests fire 200-400 simultaneous requests from a single Node process
  against one Postgres/Redis, which checks correctness under contention, not capacity

## Run locally

```bash
docker compose up -d                 # Postgres (schema + demo data auto-loaded on first start) + Redis
cd server && cp .env.example .env && npm install && npm start      # API on :5000
cd frontend && npm install && npm start                            # UI on :3000 (proxies /api)
```

Try it: pick **alice** in "Acting as", follow **bob**, switch to **bob**, publish a post, switch back to alice -> **Following** tab.

Existing database (not a fresh docker volume)? Apply the follow-graph migration once:

```bash
psql "$DATABASE_URL" -f server/migrations/002_follows.sql
```

## Tests

```bash
cd server
npm test                     # unit tests (cursor/tie logic, hot score) - no services needed
RUN_DB_TESTS=1 npm test      # + integration tests against real Postgres/Redis (docker compose up -d first)
```

Integration tests cover: 50-60 concurrent votes keeping counters equal to the `votes` table, plus spike runs of
200-400 simultaneous votes (one hot post, many users, double-clicks, up/down/remove mixes); fan-out into follower
timelines (and not into non-followers'), tie-safe cursor pagination over the timeline, unfollow/refollow, cold-timeline
rebuild; the limiter's burst cap / window cap / refill / independence of budgets; a 600-request flood that must be
rejected before demo auth touches Postgres (including `/health` and unknown routes); and slow-header connections being
closed. The Redis-outage fallback is tested with a stubbed Redis client, so it needs no services.
To see why the advisory lock exists, comment out the `pg_advisory_xact_lock` line in `postController.js` and re-run:
the same-user and spike vote tests fail.

## Deploying

API: `DATABASE_URL`, `REDIS_URL` (or `REDIS_HOST/PORT`), `CORS_ORIGIN`, `TRUST_PROXY=1`, `PGSSL=true` if your Postgres needs SSL.
Frontend build: `REACT_APP_API_URL=<api origin>`. Health check: `GET /health` (Postgres + Redis status).
Apply `server/migrations/002_follows.sql` to the deployed database before deploying this branch.

See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions and known limitations.
