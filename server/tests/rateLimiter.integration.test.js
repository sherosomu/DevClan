// Needs Redis:  docker compose up -d && RUN_DB_TESTS=1 npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const RUN = process.env.RUN_DB_TESTS === '1';

const redis = RUN ? require('../db/redisClient') : null;
const createRateLimiter = RUN ? require('../middleware/rateLimiter') : null;

const uid = () => Math.random().toString(36).slice(2, 10);

// Fire `n` simultaneous requests through the middleware; resolves with how many were admitted.
async function burst(limiter, ip, n) {
  const outcomes = await Promise.all(Array.from({ length: n }, () => new Promise((resolve) => {
    const res = {
      headers: {},
      set(h, v) { if (typeof h === 'object') Object.assign(this.headers, h); else this.headers[h] = v; return this; },
      status(c) { this.code = c; return this; },
      json() { resolve({ allowed: false, res: this }); return this; },
    };
    limiter({ ip }, res, () => resolve({ allowed: true, res }));
  })));
  return outcomes;
}
const allowedCount = (outcomes) => outcomes.filter((o) => o.allowed).length;

async function wipe(name, ip) {
  await redis.del(`ratelimit:${name}:${ip}:win`, `ratelimit:${name}:${ip}:bucket`);
}

test('token bucket: a burst is capped at `capacity` even when 60 requests arrive at once', { skip: !RUN }, async () => {
  const name = `tb-${uid()}`, ip = `ip-${uid()}`;
  const limiter = createRateLimiter({ name, windowMs: 60000, max: 1000, capacity: 10, refillPerSec: 0.001 });
  try {
    const outcomes = await burst(limiter, ip, 60);
    assert.equal(allowedCount(outcomes), 10);
    const rejected = outcomes.find((o) => !o.allowed);
    assert.equal(rejected.res.code, 429);
    assert.ok(Number(rejected.res.headers['Retry-After']) >= 1);
  } finally { await wipe(name, ip); }
});

test('sliding window: at most `max` requests per window, even with a huge token bucket', { skip: !RUN }, async () => {
  const name = `sw-${uid()}`, ip = `ip-${uid()}`;
  const limiter = createRateLimiter({ name, windowMs: 60000, max: 5, capacity: 1000, refillPerSec: 1000 });
  try {
    assert.equal(allowedCount(await burst(limiter, ip, 40)), 5);
  } finally { await wipe(name, ip); }
});

test('rejected requests are not recorded (only admitted ones count)', { skip: !RUN }, async () => {
  const name = `rec-${uid()}`, ip = `ip-${uid()}`;
  const limiter = createRateLimiter({ name, windowMs: 60000, max: 3, capacity: 1000, refillPerSec: 1000 });
  try {
    await burst(limiter, ip, 20);
    assert.equal(await redis.zcard(`ratelimit:${name}:${ip}:win`), 3);
  } finally { await wipe(name, ip); }
});

test('clients and limiter names have independent budgets', { skip: !RUN }, async () => {
  const nameA = `ia-${uid()}`, nameB = `ib-${uid()}`, ip1 = `ip-${uid()}`, ip2 = `ip-${uid()}`;
  const a = createRateLimiter({ name: nameA, windowMs: 60000, max: 2, capacity: 100, refillPerSec: 100 });
  const b = createRateLimiter({ name: nameB, windowMs: 60000, max: 2, capacity: 100, refillPerSec: 100 });
  try {
    assert.equal(allowedCount(await burst(a, ip1, 10)), 2);
    assert.equal(allowedCount(await burst(a, ip2, 10)), 2); // different client
    assert.equal(allowedCount(await burst(b, ip1, 10)), 2); // different limiter
  } finally { await wipe(nameA, ip1); await wipe(nameA, ip2); await wipe(nameB, ip1); }
});

test('the bucket refills over time', { skip: !RUN }, async () => {
  const name = `rf-${uid()}`, ip = `ip-${uid()}`;
  const limiter = createRateLimiter({ name, windowMs: 60000, max: 1000, capacity: 2, refillPerSec: 5 });
  try {
    assert.equal(allowedCount(await burst(limiter, ip, 10)), 2);
    await new Promise((r) => setTimeout(r, 600)); // ~3 tokens refilled, capped at capacity 2
    const after = allowedCount(await burst(limiter, ip, 10));
    assert.ok(after >= 2 && after <= 3, `expected 2-3 admitted after refill, got ${after}`);
  } finally { await wipe(name, ip); }
});

test.after(async () => { if (RUN) redis.disconnect(); });
