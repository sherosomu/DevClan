// Spike-scale voting: hundreds of requests fired at the same instant at one hot post.
// Needs real Postgres (schema from init-schema.sql) and Redis.
//   docker compose up -d && RUN_DB_TESTS=1 npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const RUN = process.env.RUN_DB_TESTS === '1';

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
  const names = Array.from({ length: userCount }, (_, i) => `sp_${tag}_${i}`);
  const { rows } = await pool.query(
    `INSERT INTO users (username, email)
     SELECT n, n || '@test.local' FROM unnest($1::text[]) AS n RETURNING id`, [names]);
  const users = rows.map((r) => r.id);
  const { rows: [post] } = await pool.query(
    'INSERT INTO posts (author_id, title, content) VALUES ($1, $2, $3) RETURNING id', [users[0], 'spike test', 'body']);
  return { users, postId: post.id };
}
const cleanup = (users) => pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);

test('spike: 300 simultaneous votes from 150 users (2 racing requests each) all succeed and stay consistent', { skip: !RUN }, async () => {
  const { users, postId } = await seed(150);
  try {
    const jobs = users.flatMap((u, i) => [vote(u, postId, i % 2 ? 1 : -1), vote(u, postId, 1)]);
    const results = await Promise.all(jobs);
    const failures = results.filter((r) => r.statusCode !== 200);
    assert.equal(failures.length, 0, `${failures.length} requests failed, e.g. ${JSON.stringify(failures[0]?.body)}`);
    await assertCountersMatchVotes(postId);
  } finally { await cleanup(users); }
});

test('spike: 400 mixed up/down/remove requests from 40 users keep counters equal to the votes table', { skip: !RUN }, async () => {
  const { users, postId } = await seed(40);
  try {
    const dirs = [1, -1, 0];
    const jobs = Array.from({ length: 400 }, (_, i) => vote(users[i % users.length], postId, dirs[(i * 7 + (i >> 3)) % 3]));
    const results = await Promise.all(jobs);
    assert.equal(results.filter((r) => r.statusCode !== 200).length, 0);
    await assertCountersMatchVotes(postId);
  } finally { await cleanup(users); }
});

test('spike: 200 identical double-clicks from ONE user count exactly once', { skip: !RUN }, async () => {
  const { users, postId } = await seed(1);
  try {
    const results = await Promise.all(Array.from({ length: 200 }, () => vote(users[0], postId, 1)));
    assert.equal(results.filter((r) => r.statusCode !== 200).length, 0);
    const agg = await assertCountersMatchVotes(postId);
    assert.equal(agg.up, 1);
  } finally { await cleanup(users); }
});

test.after(async () => { if (RUN) { await pool.end(); redis.disconnect(); } });
