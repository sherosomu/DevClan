# DevClan v2 — Architecture

## Request flow

```
any request -> global per-IP rate limiter (before CORS / body parsing / auth)
GET /api/posts/feed?type=hot|new|top|following&cursor=...
  -> per-route rate limiter (Redis Lua: token bucket + sliding window)
  -> Redis ZSET  feed:<type>  (global)   or   timeline:<userId>  (Following)
  -> Postgres primary-key lookup to hydrate posts + the viewer's vote (always fresh)

POST /api/posts            -> INSERT post; invalidate global feed caches; fan-out to follower timelines (async)
POST /api/posts/:id/vote   -> BEGIN; advisory lock(user, post); upsert vote + update counters; COMMIT
POST/DELETE /api/users/:id/follow -> change follow graph; drop the follower's timeline (rebuilt on next read)
```

## 1. Ranking and caching (Hot / New / Top)

`hot` ranks the 500 newest posts with `net_votes / (hours_since_post + 2)^1.8`; `new` is the 500 newest; `top` is the
500 highest-scored. Each candidate set comes from an **indexed** query, so ranking never scores the whole table.
Orderings are cached as Redis sorted sets, built under a temporary key and `RENAME`d inside `MULTI` so readers never
see a half-built feed. Concurrent cold-cache requests share one rebuild per process. Only the *ordering* is cached;
vote counts and the viewer's own vote come from Postgres on every request.

## 2. Following feed: fan-out on write

Per-user sorted set `timeline:<userId>` (member = post id, score = created_at in ms), capped at 1000 posts with a 7-day TTL.

- **Write path:** after a post commits, followers are read from Postgres in keyset-paginated batches
  (`follower_id > last`, walking `idx_follows_following`, no OFFSET) and a Lua script `ZADD`s the post into each
  follower's (and the author's) timeline in one round trip per batch. It runs after the HTTP response, so the author
  isn't blocked on N writes.
- **Read path:** `ZREVRANGEBYSCORE` with a cursor: an `O(log N + page)` skip-list seek, no join + sort across everyone
  the viewer follows on every request.
- **Redis is a rebuildable cache, Postgres is the source of truth.** A timeline that doesn't exist (new user, TTL expiry,
  Redis flush, or a follow/unfollow that invalidated it) is rebuilt from Postgres on the next read.
- **Marker key.** `timeline:<id>:ready` says "this ZSET is fully materialized". Without it, a fan-out into a missing key
  would create a ZSET holding one post, which a reader would mistake for a complete timeline. Rebuild sets the marker
  *before* reading Postgres, so a post committed during a rebuild is either seen by the query or pushed by fan-out.
  Fan-out only writes to timelines whose marker exists, so idle users cost nothing.

## 3. Cursor pagination (no OFFSET)

`OFFSET n` makes the database produce and discard `n` rows on every request. The cursor here is `"<score>|<lastPostId>"`
and the next page is `ZREVRANGEBYSCORE key <score> -inf LIMIT 0 <pageSize + tiedCount>`. Many entries can share a
score, so the tied group is re-read inclusively and already-served members dropped; a plain exclusive-score cursor
would silently skip them. Unit-tested in `tests/feedCursor.test.js`, and against real Redis in
`tests/timeline.integration.test.js` (including 5 posts with identical timestamps).

## 4. Vote consistency

The vote CTE reads the previous vote, upserts the new one, and applies a *relative* delta to the post's counters.

- **Different users, same post:** safe. `UPDATE posts` takes a row lock and uses relative increments.
- **Same user, same post, concurrent requests:** would be a read-modify-write race (two requests both read "no previous
  vote" and both add +1). A transaction-scoped `pg_advisory_xact_lock(hash(user, post))` serializes just those requests.
- Invariant (checked by `tests/vote.integration.test.js`): `posts.score/upvotes/downvotes` always equal what is in `votes`.

## 5. Rate limiting

One Lua script, executed atomically in Redis, enforces two limits and admits a request only if both allow it:

- **Token bucket** (`capacity`, `refillPerSec`): allows a short burst, enforces a steady average rate.
- **Sliding window** (`max` per `windowMs`): a timestamp log in a sorted set; a hard cap with no fixed-window edge effects.

Nothing is consumed when a request is rejected; `Retry-After` is computed from whichever limit is binding. State lives in
Redis, so the limit holds across multiple API instances. Reads and writes have separate budgets. Keyed by client IP
(set `TRUST_PROXY` behind a proxy).

### Flood (application-layer DDoS) hardening

- **Global limiter first.** One per-IP limiter covers every request, `/health` and unknown routes included, and runs
  before CORS, JSON parsing and demo auth. Demo auth does a Postgres lookup per request, so without this a flood of
  junk requests would be rejected only after already costing a DB query each. Measured locally with 600 rapid requests:
  unknown-route flood 600 DB queries -> 101; `/health` flood 1200 DB queries -> 204 (the remainder is the burst the
  limiter deliberately admits).
- **No fail-open.** If Redis is unreachable (or the script errors) the same token-bucket + sliding-window rules are
  enforced in-process (`lib/localLimiter.js`). Limits are then per API instance rather than shared, so N instances
  allow up to N x the configured rate until Redis returns. When Redis is known to be down the limiter and the feed
  skip it immediately, so requests no longer stall on client retries (measured 5.7s median -> 0.18s under a flood
  with Redis down) and the feed serves its Postgres fallback.
- **Slow-connection attacks.** `headersTimeout` 10s, `requestTimeout` 20s, `keepAliveTimeout` 5s, with
  `connectionsCheckingInterval` 5s (Node only enforces these when it sweeps connections; the default sweep is 30s). A
  connection that dribbles headers is answered `408` and closed in about 14s; with the previous settings the same
  connection was still open after 40s. Request bodies are capped at 100kb.

**Scope:** this is application-layer (L7) protection. It is not volumetric (L3/L4) DDoS protection: traffic that
saturates the network link or the connection table has to be absorbed upstream by a CDN/WAF or cloud provider, which
this complements. It is also per-IP, so a botnet spread over many addresses is only limited per source (the
Postgres fallback and pool limits still bound the damage), and clients behind one NAT share a budget.

## Known limitations / trade-offs

- **Fan-out cost grows with follower count.** Fine for normal accounts; a very-high-follower account would need a hybrid
  (fan-out on read for those authors). Not implemented.
- Global feeds are snapshots (<= 5 min old, invalidated on votes/posts), so order can shift slightly between pages. Each
  covers at most 500 candidate posts; "hot" deliberately forgets older ones.
- Invalidating global feeds on every vote is simple but causes frequent rebuilds under heavy voting; a periodic refresh
  would scale better.
- Following timelines are chronological, so votes don't affect their order.
- Demo auth only; the limiter should be keyed by user id once real auth exists.
- Not benchmarked; no throughput or latency numbers are claimed. The spike tests (200-400 simultaneous votes) and flood
  tests check correctness and rejection behaviour from a single process, not capacity.
