// Needs real Postgres (schema from init-schema.sql) and Redis.
//   docker compose up -d && RUN_DB_TESTS=1 npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const RUN = process.env.RUN_DB_TESTS === '1';

// Loaded only when RUN_DB_TESTS=1 so a plain `npm test` needs no database or Redis.
const { pool, redis, handleVote } = RUN
  ? {
      pool: require('../db/pool').pool,
      redis: require('../db/redisClient'),
      handleVote: require('../controllers/postController').handleVote,
    }
  : {};

function fakeRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const vote = (userId, postId, direction) => {
  const res = fakeRes();
  return handleVote({ params: { id: postId }, body: { direction }, user: { id: userId } }, res).then(() => res);
};

// The invariant that must always hold: denormalized counters == the votes table.
async function assertCountersMatchVotes(postId) {
  const { rows: [post] } = await pool.query('SELECT score, upvotes, downvotes FROM posts WHERE id = $1', [postId]);
  const { rows: [agg] } = await pool.query(
    `SELECT COALESCE(SUM(direction),0)::int AS score,
            COUNT(*) FILTER (WHERE direction = 1)::int AS up,
            COUNT(*) FILTER (WHERE direction = -1)::int AS down
       FROM votes WHERE post_id = $1`, [postId]);
  assert.deepEqual({ score: post.score, upvotes: post.upvotes, downvotes: post.downvotes },
                   { score: agg.score, upvotes: agg.up, downvotes: agg.down });
  return agg;
}

async function seed(userCount) {
  const tag = Math.random().toString(36).slice(2, 8);
  const users = [];
  for (let i = 0; i < userCount; i++) {
    const { rows } = await pool.query(
      'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id', [`t_${tag}_${i}`, `t_${tag}_${i}@test.local`]);
    users.push(rows[0].id);
  }
  const { rows: [post] } = await pool.query(
    'INSERT INTO posts (author_id, title, content) VALUES ($1, $2, $3) RETURNING id', [users[0], 'concurrency test', 'body']);
  return { users, postId: post.id };
}
const cleanup = (users) => pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]); // cascades to posts/votes

test('50 concurrent identical votes from ONE user count exactly once', { skip: !RUN }, async () => {
  const { users, postId } = await seed(1);
  try {
    const results = await Promise.all(Array.from({ length: 50 }, () => vote(users[0], postId, 1)));
    assert.ok(results.every((r) => r.statusCode === 200));
    const agg = await assertCountersMatchVotes(postId);
    assert.equal(agg.up, 1);
  } finally { await cleanup(users); }
});

test('mixed concurrent votes (up/down/remove) from one user keep counters consistent', { skip: !RUN }, async () => {
  const { users, postId } = await seed(1);
  try {
    const dirs = Array.from({ length: 60 }, (_, i) => [1, -1, 0][i % 3]);
    await Promise.all(dirs.map((d) => vote(users[0], postId, d)));
    await assertCountersMatchVotes(postId);
  } finally { await cleanup(users); }
});

test('50 different users voting at once are all counted', { skip: !RUN }, async () => {
  const { users, postId } = await seed(50);
  try {
    await Promise.all(users.map((u) => vote(u, postId, 1)));
    const agg = await assertCountersMatchVotes(postId);
    assert.equal(agg.up, 50);
  } finally { await cleanup(users); }
});

test.after(async () => { if (RUN) { await pool.end(); redis.disconnect(); } });
