// Needs real Postgres (init-schema.sql) and Redis:  docker compose up -d && RUN_DB_TESTS=1 npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const RUN = process.env.RUN_DB_TESTS === '1';

const mods = RUN
  ? {
      pool: require('../db/pool').pool,
      redis: require('../db/redisClient'),
      feedService: require('../services/feedService'),
      timeline: require('../services/timelineService'),
      posts: require('../controllers/postController'),
      users: require('../controllers/userController'),
    }
  : {};
const { pool, redis, feedService, timeline, posts, users } = mods;

function fakeRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const call = async (handler, req) => { const res = fakeRes(); await handler(req, res); return res; };
const follow = (me, target) => call(users.follow, { params: { id: target }, user: { id: me } });
const unfollow = (me, target) => call(users.unfollow, { params: { id: target }, user: { id: me } });
const followingFeed = (userId, cursor, limit = 50) => feedService.getFeed({ type: 'following', userId, cursor, limit });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seedUsers(n) {
  const tag = Math.random().toString(36).slice(2, 8);
  const ids = [];
  for (let i = 0; i < n; i++) {
    const { rows } = await pool.query(
      'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id', [`tl_${tag}_${i}`, `tl_${tag}_${i}@test.local`]);
    ids.push(rows[0].id);
  }
  return ids;
}
async function cleanup(ids) {
  await redis.del(...ids.flatMap((id) => [timeline.timelineKey(id), timeline.readyKey(id)]));
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]); // cascades to posts, votes, follows
}
async function insertPost(authorId, createdAt) {
  const { rows } = await pool.query(
    `INSERT INTO posts (author_id, title, content, created_at) VALUES ($1, 't', 'c', $2) RETURNING id`, [authorId, createdAt]);
  return rows[0].id;
}
async function waitFor(fn, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) { if (await fn()) return true; await sleep(25); }
  return false;
}

test('fan-out on write: a new post lands in followers\' ZSET timelines, not in non-followers\'', { skip: !RUN }, async () => {
  const [author, follower, stranger] = await seedUsers(3);
  try {
    assert.equal((await follow(follower, author)).body.following, true);
    // Materialize both timelines first, so we are testing the push path, not the cold rebuild.
    await followingFeed(follower);
    await followingFeed(stranger);

    const res = await call(posts.createPost, { body: { title: 'hello', content: 'world', tags: ['x'] }, user: { id: author } });
    assert.equal(res.statusCode, 201);
    const postId = res.body.id;

    // Fan-out runs after the response, so wait for it to land in Redis.
    assert.ok(await waitFor(async () => (await redis.zscore(timeline.timelineKey(follower), postId)) !== null),
      'post should be pushed into the follower\'s ZSET');
    assert.equal(await redis.zscore(timeline.timelineKey(stranger), postId), null);

    assert.deepEqual((await followingFeed(follower)).posts.map((p) => p.id), [postId]);
    assert.deepEqual((await followingFeed(author)).posts.map((p) => p.id), [postId]); // author sees own post
    assert.deepEqual((await followingFeed(stranger)).posts, []);
  } finally { await cleanup([author, follower, stranger]); }
});

test('cursor pagination over the timeline returns every post exactly once, in order', { skip: !RUN }, async () => {
  const [author, follower] = await seedUsers(2);
  try {
    await follow(follower, author);
    const base = Date.now() - 60_000;
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await insertPost(author, new Date(base + i * 1000))); // oldest -> newest
    const expected = [...ids].reverse(); // newest first

    const seen = [];
    let cursor = null;
    for (let guard = 0; guard < 10; guard++) {
      const page = await followingFeed(follower, cursor, 2);
      seen.push(...page.posts.map((p) => p.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    assert.deepEqual(seen, expected);
  } finally { await cleanup([author, follower]); }
});

test('posts with IDENTICAL timestamps are not skipped between pages', { skip: !RUN }, async () => {
  const [author, follower] = await seedUsers(2);
  try {
    await follow(follower, author);
    const sameInstant = new Date(Date.now() - 30_000);
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await insertPost(author, sameInstant));

    const seen = [];
    let cursor = null;
    for (let guard = 0; guard < 10; guard++) {
      const page = await followingFeed(follower, cursor, 2);
      seen.push(...page.posts.map((p) => p.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    assert.equal(seen.length, 5);
    assert.deepEqual([...seen].sort(), [...ids].sort());
  } finally { await cleanup([author, follower]); }
});

test('unfollow removes that author\'s posts from the timeline; refollow restores them', { skip: !RUN }, async () => {
  const [author, follower] = await seedUsers(2);
  try {
    const postId = await insertPost(author, new Date());
    await follow(follower, author);
    assert.deepEqual((await followingFeed(follower)).posts.map((p) => p.id), [postId]);

    await unfollow(follower, author);
    assert.deepEqual((await followingFeed(follower)).posts, []);

    await follow(follower, author);
    assert.deepEqual((await followingFeed(follower)).posts.map((p) => p.id), [postId]);
  } finally { await cleanup([author, follower]); }
});

test('a cold timeline (Redis flushed) is rebuilt from Postgres', { skip: !RUN }, async () => {
  const [author, follower] = await seedUsers(2);
  try {
    const postId = await insertPost(author, new Date());
    await follow(follower, author);
    await followingFeed(follower);
    await redis.del(timeline.timelineKey(follower), timeline.readyKey(follower)); // simulate flush / TTL expiry
    assert.deepEqual((await followingFeed(follower)).posts.map((p) => p.id), [postId]);
  } finally { await cleanup([author, follower]); }
});

test('following feed requires a user', { skip: !RUN }, async () => {
  await assert.rejects(() => feedService.getFeed({ type: 'following', userId: null }), { code: 'AUTH_REQUIRED' });
});

test.after(async () => { if (RUN) { await pool.end(); redis.disconnect(); } });
