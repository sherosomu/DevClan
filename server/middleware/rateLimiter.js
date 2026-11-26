const redis = require('../db/redisClient');
const createLocalLimiter = require('../lib/localLimiter');

// Distributed limiter combining TWO algorithms in one atomic Redis (Lua) step:
//
//   * Token bucket  - `capacity` tokens, refilled at `refillPerSec`. Allows a short burst
//                     (up to `capacity` requests at once) but enforces a steady average rate.
//   * Sliding window - a log of request timestamps in a sorted set; at most `max` requests
//                     in any trailing `windowMs`. A hard cap with no fixed-window edge effect.
//
// A request is admitted only if BOTH allow it; nothing is consumed when it is rejected.
// Because check-and-consume happens inside one script, concurrent requests (from any
// number of API instances sharing this Redis) can't both slip under the limit.
//
// KEYS[1] = sliding-window zset, KEYS[2] = token-bucket hash
// ARGV    = now(ms), windowMs, max, member, capacity, refillPerSec
const SCRIPT = `
local now      = tonumber(ARGV[1])
local window   = tonumber(ARGV[2])
local max      = tonumber(ARGV[3])
local member   = ARGV[4]
local capacity = tonumber(ARGV[5])
local rate     = tonumber(ARGV[6])

-- sliding window: drop entries older than the window, then count
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, now - window)
local count = redis.call('ZCARD', KEYS[1])

-- token bucket: refill based on elapsed time
local b = redis.call('HMGET', KEYS[2], 'tokens', 'ts')
local tokens = tonumber(b[1])
local ts = tonumber(b[2])
if tokens == nil or ts == nil then
  tokens = capacity
  ts = now
end
tokens = math.min(capacity, tokens + (math.max(0, now - ts) / 1000) * rate)

local allowed = 1
local retry = 0

if count >= max then
  allowed = 0
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  if oldest[2] then
    retry = math.max(retry, math.ceil(tonumber(oldest[2]) + window - now))
  end
end

if tokens < 1 then
  allowed = 0
  retry = math.max(retry, math.ceil(((1 - tokens) / rate) * 1000))
end

if allowed == 1 then
  tokens = tokens - 1
  redis.call('ZADD', KEYS[1], now, member)
  redis.call('PEXPIRE', KEYS[1], window)
  count = count + 1
end

redis.call('HSET', KEYS[2], 'tokens', tostring(tokens), 'ts', ARGV[1])
redis.call('PEXPIRE', KEYS[2], math.ceil((capacity / rate) * 1000) + 1000)

local remaining = math.min(max - count, math.floor(tokens))
if remaining < 0 then remaining = 0 end
return {allowed, remaining, retry}
`;

// `name` keeps separate budgets per limiter (feed reads vs writes must not share a counter).
// Redis outage handling: ioredis states in which a command would only queue and wait.
// Skipping Redis in those states keeps requests fast instead of stalling on retries.
const REDIS_DOWN = new Set(['reconnecting', 'close', 'end']);

// While Redis is unreachable, enforce the same limits in-process instead of failing open.
const local = createLocalLimiter();
setInterval(() => local.sweep(), 30000).unref();

let lastFallbackLog = 0;
function noteFallback(reason) {
  const t = Date.now();
  if (t - lastFallbackLog > 10000) { // one line per 10s, not one per request
    lastFallbackLog = t;
    console.error(`[RateLimiter] Redis unavailable (${reason}); using per-process limiter`);
  }
}

const createRateLimiter = ({
  name = 'default',
  windowMs = 60000,
  max = 60,
  capacity = 10,
  refillPerSec = 1,
} = {}) => {
  return async (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const base = `ratelimit:${name}:${ip}`;
    const now = Date.now();
    const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;

    let allowed, remaining, retryMs;
    let decided = false;

    if (!REDIS_DOWN.has(redis.status)) {
      try {
        [allowed, remaining, retryMs] = await redis.eval(
          SCRIPT, 2, `${base}:win`, `${base}:bucket`,
          now, windowMs, max, member, capacity, refillPerSec
        );
        decided = true;
      } catch (err) {
        noteFallback(err.message);
      }
    } else {
      noteFallback(`status=${redis.status}`);
    }

    if (!decided) {
      const r = local.check(base, { windowMs, max, capacity, refillPerSec });
      allowed = r.allowed ? 1 : 0;
      remaining = r.remaining;
      retryMs = r.retryMs;
    }

    res.set({
      'X-RateLimit-Limit': String(max),
      'X-RateLimit-Remaining': String(remaining),
    });

    if (!allowed) {
      res.set('Retry-After', String(Math.max(1, Math.ceil(retryMs / 1000))));
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded (max ${max} per ${windowMs / 1000}s, burst ${capacity}).`,
      });
    }
    next();
  };
};

module.exports = createRateLimiter;
