// Unit tests for the in-process fallback limiter. No Redis / Postgres needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const createLocalLimiter = require('../lib/localLimiter');

// Deterministic clock so refill / window behaviour can be tested without sleeping.
function setup(opts = {}) {
  let t = 1_000_000;
  const lim = createLocalLimiter({ now: () => t, ...opts });
  return { lim, advance: (ms) => { t += ms; }, run: (key, cfg, n) => Array.from({ length: n }, () => lim.check(key, cfg)) };
}
const allowed = (rs) => rs.filter((r) => r.allowed).length;

test('token bucket: a simultaneous burst is capped at `capacity`', () => {
  const { run } = setup();
  const rs = run('ip', { windowMs: 60000, max: 1000, capacity: 10, refillPerSec: 0.001 }, 60);
  assert.equal(allowed(rs), 10);
  assert.ok(rs.find((r) => !r.allowed).retryMs > 0);
});

test('sliding window: at most `max` per window even with a huge bucket', () => {
  const { run } = setup();
  assert.equal(allowed(run('ip', { windowMs: 60000, max: 5, capacity: 1000, refillPerSec: 1000 }, 40)), 5);
});

test('window slides: capacity returns once the oldest hits leave the window', () => {
  const { run, advance } = setup();
  const cfg = { windowMs: 1000, max: 3, capacity: 1000, refillPerSec: 1000 };
  assert.equal(allowed(run('ip', cfg, 10)), 3);
  advance(999);
  assert.equal(allowed(run('ip', cfg, 10)), 0);   // hits are still inside the window
  advance(2);
  assert.equal(allowed(run('ip', cfg, 10)), 3);   // they have aged out
});

test('rejected requests consume nothing (they do not extend the lockout)', () => {
  const { run, advance } = setup();
  const cfg = { windowMs: 1000, max: 2, capacity: 1000, refillPerSec: 1000 };
  run('ip', cfg, 2);
  for (let i = 0; i < 50; i++) { advance(10); run('ip', cfg, 5); }   // hammer while blocked
  advance(1000);
  assert.equal(allowed(run('ip', cfg, 5)), 2);
});

test('the bucket refills over time, capped at capacity', () => {
  const { run, advance } = setup();
  const cfg = { windowMs: 60000, max: 1000, capacity: 2, refillPerSec: 5 };
  assert.equal(allowed(run('ip', cfg, 10)), 2);
  advance(600);                                   // 3 tokens' worth, capped at 2
  assert.equal(allowed(run('ip', cfg, 10)), 2);
});

test('clients have independent budgets', () => {
  const { run } = setup();
  const cfg = { windowMs: 60000, max: 2, capacity: 100, refillPerSec: 100 };
  assert.equal(allowed(run('a', cfg, 10)), 2);
  assert.equal(allowed(run('b', cfg, 10)), 2);
});

test('retryMs reports how long until the binding limit frees up', () => {
  const { lim, advance } = setup();
  const cfg = { windowMs: 10000, max: 1, capacity: 1000, refillPerSec: 1000 };
  lim.check('ip', cfg);
  advance(4000);
  const r = lim.check('ip', cfg);
  assert.equal(r.allowed, false);
  assert.equal(r.retryMs, 6000);
});

test('sweep drops idle clients; maxKeys bounds memory', () => {
  const { lim, advance } = setup({ maxKeys: 100 });
  const cfg = { windowMs: 1000, max: 5, capacity: 5, refillPerSec: 5 };
  for (let i = 0; i < 1000; i++) lim.check(`ip-${i}`, cfg);
  assert.ok(lim.size() <= 100, `size ${lim.size()} exceeded maxKeys`);
  advance(60_000);
  lim.sweep();
  assert.equal(lim.size(), 0);
});
