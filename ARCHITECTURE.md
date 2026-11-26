# DevClan v2 — Architecture Notes

## 1. Why there are *two* feed pipelines, not one

`Trending` and `Following` have opposite performance profiles, so they get opposite solutions:

| | Trending | Following |
|---|---|---|
| Same result for every viewer? | Yes | No — unique per user |
| Bottleneck | CPU (aggregation + scoring math) | I/O fan-out (write amplification) |
| Solution | SQL: materialized view + indexed range scan | Redis ZSET: fan-out on write, O(log N) read |

Using one strategy for both would be wrong in both directions: caching a single "hot" ranking works because it's shared, but caching a personalized "following" feed the same way means either recomputing a join+sort per user on every request (slow), or maintaining N per-user caches by hand in SQL (what Redis ZSETs already do natively, faster).

## 2. Eliminating `OFFSET` pagination lag

`OFFSET n` forces Postgres to scan and discard the first `n` rows of the result set on *every single request* — page 500 costs as much as page 1 plus 500 rows of wasted work. As a feed grows, `OFFSET`-based "load more" gets linearly slower.

Both pipelines here use **keyset (cursor) pagination** instead:

- **Latest / Trending:** the cursor is the last row's sort key (`c_t` timestamp or computed `score`). The next page's query is `WHERE c_t < $cursor ORDER BY c_t DESC LIMIT n` — Postgres walks the `idx_posts_c_t_desc` index directly to that position and reads forward. Cost is `O(limit)`, not `O(offset + limit)`, regardless of how deep you page.
- **Following:** `ZREVRANGEBYSCORE key (cursor -inf LIMIT 0 n` does the equivalent inside Redis — an `O(log N + limit)` skip-list traversal straight to the cursor position.

## 3. Mitigating the vote race condition

The naive "check if a vote exists, then insert or update" pattern is a **check-then-act (TOCTOU)** bug: under concurrent requests (double-tap, a retried fetch, a buggy client firing twice), two transactions can both pass the `SELECT` before either `INSERT` commits, producing duplicate rows or a race on the tally.

The fix is `INSERT ... ON CONFLICT (user_id, post_id) DO UPDATE`, a single atomic statement. Postgres takes a row-level lock on the conflicting key as part of the same statement that does the check — there's no gap between "check" and "act" for another transaction to land in. Two concurrent votes from the same user now serialize automatically instead of racing.

Vote *counts* shown to users are read fresh from `post_votes` at request time (not the materialized view, which can be up to ~60s stale) — this keeps the number a user sees right after voting consistent with what they just did, which matters more for perceived correctness than the trending *ranking*, where a few seconds of staleness is invisible.

## 4. Minimizing feed latency end-to-end

- **Materialized view (`mv_post_engagement`)** turns an expensive `GROUP BY` over votes/comments into a cheap indexed lookup, refreshed on a timer (`REFRESH MATERIALIZED VIEW CONCURRENTLY`, non-blocking) instead of recomputed per request.
- **Partial index on recent posts** (`WHERE c_t > now() - interval`) means the trending query's candidate set is bounded by the trending window, not the whole `posts` table — the query plan is an index range scan, not a sequential scan, even with millions of historical rows.
- **Connection pooling** (`pg.Pool`, max 20) with a 5s `connectionTimeoutMillis` means a saturated pool fails fast with a clear error instead of queuing requests indefinitely and cascading into timeouts elsewhere.
- **Distributed sliding-window rate limiting** via a Redis Lua script protects both of the above from being overwhelmed by scripted/bot traffic in the first place — the limiter itself is O(1) amortized per request (bounded ZSET eviction + cardinality check).
- **Fan-out on write** trades a small amount of extra work at post-creation time (N writes to follower ZSETs) for O(log N) reads on every subsequent feed load — the right trade for a read-heavy social feed, with an explicit celebrity-account escape hatch (`celebrity_authors` set) to avoid pathological fan-out for high-follower accounts.

## 5. Known trade-offs worth naming in a design review

- **MV staleness:** trending ranking can lag actual vote counts by up to the refresh interval (30–60s). Acceptable for a ranking signal; not used for anything requiring strong consistency.
- **Fan-out-on-write cost:** scales with follower count per post. The threshold-based fallback to fan-out-on-read for high-follower accounts is stubbed (`celebrity_authors`) but the read-side merge isn't implemented here — that's the natural "phase 2" if this needs to support accounts with large followings.
- **Redis as a cache, not source of truth:** the follower graph and vote counts always live in Postgres; Redis holds derived, rebuildable state (timelines, rate-limit windows). If Redis is flushed, timelines can be rebuilt from `followers` + `posts`, and the rate limiter fails open rather than blocking traffic.
