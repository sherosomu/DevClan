// Redis-outage behaviour of the rate limiter. Needs NO real Redis: the Redis client is stubbed.
// (Each test file runs in its own process under `node --test`, so the stub can't leak.)
const test = require('node:test');
const assert = require('node:assert/strict');

const stub = { status: 'ready', evalCalls: 0, eval: async () => { stub.evalCalls++; throw new Error('boom'); } };
const redisPath = require.resolve('../db/redisClient');
require.cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, exports: stub };

const createRateLimiter = require('../middleware/rateLimiter');
console.error = () => {}; // the limiter logs on fallback; keep test output clean

async function burst(limiter, ip, n) {
  return Promise.all(Array.from({ length: n }, () => new Promise((resolve) => {
    const res = {
      headers: {},
      set(h, v) { if (typeof h === 'object') Object.assign(this.headers, h); else this.headers[h] = v; return this; },
      status(c) { this.code = c; return this; },
      json() { resolve({ allowed: false, res: this }); return this; },
    };
    limiter({ ip }, res, () => resolve({ allowed: true, res }));
  })));
}
const allowedCount = (o) => o.filter((x) => x.allowed).length;

test('Redis known down: limits are still enforced, and Redis is not even tried', async () => {
  stub.status = 'reconnecting';
  stub.evalCalls = 0;
  const limiter = createRateLimiter({ name: 'down', windowMs: 60000, max: 1000, capacity: 10, refillPerSec: 0.001 });
  const outcomes = await burst(limiter, 'ip-1', 60);
  assert.equal(allowedCount(outcomes), 10);
  assert.equal(stub.evalCalls, 0);
  const rejected = outcomes.find((o) => !o.allowed);
  assert.equal(rejected.res.code, 429);
  assert.ok(Number(rejected.res.headers['Retry-After']) >= 1);
});

test('Redis "ready" but the script errors: falls back to the in-process limiter, not fail-open', async () => {
  stub.status = 'ready';
  stub.evalCalls = 0;
  const limiter = createRateLimiter({ name: 'err', windowMs: 60000, max: 5, capacity: 1000, refillPerSec: 1000 });
  const outcomes = await burst(limiter, 'ip-2', 40);
  assert.equal(allowedCount(outcomes), 5);
  assert.ok(stub.evalCalls > 0, 'should have tried Redis first');
});

test('fallback keeps clients and limiter names independent', async () => {
  stub.status = 'end';
  const a = createRateLimiter({ name: 'fa', windowMs: 60000, max: 2, capacity: 100, refillPerSec: 100 });
  const b = createRateLimiter({ name: 'fb', windowMs: 60000, max: 2, capacity: 100, refillPerSec: 100 });
  assert.equal(allowedCount(await burst(a, 'ip-3', 10)), 2);
  assert.equal(allowedCount(await burst(a, 'ip-4', 10)), 2);
  assert.equal(allowedCount(await burst(b, 'ip-3', 10)), 2);
});
