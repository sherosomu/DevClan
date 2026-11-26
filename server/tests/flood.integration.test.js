// End-to-end flood test against the real Express app (real Redis + Postgres).
//   docker compose up -d && RUN_DB_TESTS=1 npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const RUN = process.env.RUN_DB_TESTS === '1';

const mods = RUN
  ? { db: require('../db/pool'), redis: require('../db/redisClient'), app: require('../index') }
  : {};
const { db, redis, app } = mods;

const DEMO_USER = 'a0000000-0000-0000-0000-000000000002'; // seeded 'alice': makes demo auth do a DB lookup

function get(port, path) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path, headers: { 'x-demo-user': DEMO_USER }, agent: false }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', () => resolve('ERR'));
  });
}
const tally = (codes) => codes.reduce((m, c) => ((m[c] = (m[c] || 0) + 1), m), {});

async function withServer(fn) {
  const server = app.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try { return await fn(server.address().port, server); }
  finally { await new Promise((r) => { server.close(r); server.closeAllConnections?.(); }); }
}
const resetBuckets = async () => {
  const keys = await redis.keys('ratelimit:*:127.0.0.1:*');
  if (keys.length) await redis.del(...keys);
};

test('a flood of unknown-route requests is cut off BEFORE auth touches Postgres', { skip: !RUN }, async () => {
  await resetBuckets();
  const realQuery = db.query;
  let authLookups = 0;
  db.query = (text, params) => { if (/FROM users WHERE id = \$1/.test(text)) authLookups++; return realQuery(text, params); };
  try {
    await withServer(async (port) => {
      const codes = await Promise.all(Array.from({ length: 600 }, () => get(port, '/no-such-route')));
      const t = tally(codes);
      assert.ok(t[429] >= 400, `expected most of the flood rejected, got ${JSON.stringify(t)}`);
      assert.ok(t[404] <= 150, `too many requests got past the limiter: ${JSON.stringify(t)}`);
      assert.equal(authLookups, t[404], 'every DB auth lookup must correspond to an admitted request');
      assert.ok(authLookups <= 150);
    });
  } finally { db.query = realQuery; await resetBuckets(); }
});

test('/health is rate limited too (it hits Postgres and Redis on every call)', { skip: !RUN }, async () => {
  await resetBuckets();
  try {
    await withServer(async (port) => {
      const t = tally(await Promise.all(Array.from({ length: 600 }, () => get(port, '/health'))));
      assert.ok(t[429] >= 400, JSON.stringify(t));
      assert.ok(t[200] >= 1, 'legitimate requests are still served');
    });
  } finally { await resetBuckets(); }
});

test('a connection that never finishes its headers is closed by the server', { skip: !RUN }, async () => {
  await withServer(async (port, server) => {
    assert.equal(server.headersTimeout, 10000);
    assert.equal(server.requestTimeout, 20000);
    const closedAfterMs = await new Promise((resolve) => {
      const t0 = Date.now();
      const s = net.connect(port, '127.0.0.1', () => s.write('GET /health HTTP/1.1\r\nHost: x\r\nX-Slow: '));
      const drip = setInterval(() => { try { s.write('a'); } catch { /* closed */ } }, 1000);
      s.on('data', () => {});
      s.on('close', () => { clearInterval(drip); resolve(Date.now() - t0); });
    });
    assert.ok(closedAfterMs < 20000, `slow connection lingered ${closedAfterMs}ms`);
  });
});

test.after(async () => { if (RUN) { await db.pool.end(); redis.disconnect(); } });
