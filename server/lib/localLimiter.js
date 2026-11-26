// In-process limiter with the SAME semantics as the Redis Lua script in middleware/rateLimiter.js:
// a token bucket AND a sliding-window log, a request must pass both, and a rejected request
// consumes nothing.
//
// It exists so that a Redis outage does not silently remove rate limiting (and every request
// does not stall on Redis retries). State is per process, so with N API instances the effective
// limit is up to N x the configured one until Redis is back. Better than no limit at all.
//
// Pure apart from the injected clock, so it is unit-testable without Redis.

function createLocalLimiter({ maxKeys = 50000, now = Date.now } = {}) {
  const state = new Map(); // key -> { tokens, ts, hits: number[], expires }

  function check(key, { windowMs, max, capacity, refillPerSec }) {
    const t = now();
    let s = state.get(key);
    if (s) {
      state.delete(key); // re-insert below so Map order stays least-recently-used first
    } else {
      if (state.size >= maxKeys) state.delete(state.keys().next().value); // bound memory
      s = { tokens: capacity, ts: t, hits: [], expires: 0 };
    }
    state.set(key, s);

    // sliding window: drop entries at/older than the window edge (same boundary as ZREMRANGEBYSCORE 0..now-window)
    const cutoff = t - windowMs;
    let drop = 0;
    while (drop < s.hits.length && s.hits[drop] <= cutoff) drop++;
    if (drop) s.hits.splice(0, drop);

    // token bucket: refill from elapsed time
    s.tokens = Math.min(capacity, s.tokens + (Math.max(0, t - s.ts) / 1000) * refillPerSec);
    s.ts = t;

    let allowed = true;
    let retryMs = 0;
    if (s.hits.length >= max) {
      allowed = false;
      retryMs = Math.max(retryMs, Math.ceil(s.hits[0] + windowMs - t));
    }
    if (s.tokens < 1) {
      allowed = false;
      retryMs = Math.max(retryMs, Math.ceil(((1 - s.tokens) / refillPerSec) * 1000));
    }
    if (allowed) {
      s.tokens -= 1;
      s.hits.push(t); // `hits` only ever holds admitted requests, so it is bounded by `max`
    }

    s.expires = t + Math.max(windowMs, Math.ceil((capacity / refillPerSec) * 1000)) + 1000;
    const remaining = Math.max(0, Math.min(max - s.hits.length, Math.floor(s.tokens)));
    return { allowed, remaining, retryMs };
  }

  // Drop idle clients so a long-running process does not accumulate state.
  function sweep() {
    const t = now();
    for (const [key, s] of state) if (s.expires <= t) state.delete(key);
  }

  return { check, sweep, size: () => state.size };
}

module.exports = createLocalLimiter;
