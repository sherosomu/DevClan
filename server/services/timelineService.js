const db = require('../db/pool');
const redis = require('../db/redisClient');

// Personalized "Following" timelines: fan-out on write into per-user Redis sorted sets.
//
//   timeline:<userId>        ZSET  member = post id, score = post created_at (ms)
//   timeline:<userId>:ready  STRING  'building' | 'ready'  (marks the ZSET as materialized)
//
// Writes:  creating a post pushes its id into the timeline of every follower (and the
//          author) whose timeline is materialized -> ZADD timeline:<id> <ms> <postId>.
// Reads:   ZREVRANGEBYSCORE with a cursor (see feedService) -> no SQL OFFSET, no per-request
//          join + sort across everyone the viewer follows.
// Cold:    a timeline that doesn't exist yet (new user, TTL expiry, Redis flush, follow/unfollow)
//          is rebuilt from Postgres, which stays the source of truth. Redis only holds
//          rebuildable derived state.
//
// Why a marker key instead of "does the ZSET exist"? An empty timeline has no ZSET, and a
// fan-out into an absent key would create a ZSET holding ONE post, which a reader would then
// mistake for a complete timeline. The marker removes that ambiguity.

const TIMELINE_MAX = 1000;                    // newest posts kept per timeline
const TIMELINE_TTL_SECONDS = 7 * 24 * 3600;   // idle timelines expire and are rebuilt on demand
const FANOUT_BATCH = 1000;                    // followers processed per Redis round trip

const timelineKey = (userId) => `timeline:${userId}`;
const readyKey = (userId) => `timeline:${userId}:ready`;

// Only touches timelines that are already materialized (marker exists).
// KEYS = [timeline1, ready1, timeline2, ready2, ...]; ARGV = score, member, max, ttl
const FANOUT_SCRIPT = `
local written = 0
for i = 1, #KEYS, 2 do
  if redis.call('EXISTS', KEYS[i + 1]) == 1 then
    redis.call('ZADD', KEYS[i], ARGV[1], ARGV[2])
    redis.call('ZREMRANGEBYRANK', KEYS[i], 0, -(tonumber(ARGV[3]) + 1))
    redis.call('EXPIRE', KEYS[i], tonumber(ARGV[4]))
    redis.call('EXPIRE', KEYS[i + 1], tonumber(ARGV[4]))
    written = written + 1
  end
end
return written
`;

async function pushToTimelines(userIds, postId, scoreMs) {
  const keys = [];
  for (const id of userIds) keys.push(timelineKey(id), readyKey(id));
  return redis.eval(FANOUT_SCRIPT, keys.length, ...keys, scoreMs, postId, TIMELINE_MAX, TIMELINE_TTL_SECONDS);
}

// Called after a post is committed. Followers are read from Postgres in keyset-paginated
// batches (follower_id > last), which walks idx_follows_following instead of using OFFSET.
// Cost grows with follower count; that is the known trade-off of fan-out on write.
async function fanoutPost(post) {
  const scoreMs = new Date(post.created_at).getTime();
  let written = await pushToTimelines([post.author_id], post.id, scoreMs); // author sees own posts
  let lastId = null;

  for (;;) {
    const { rows } = await db.query(
      `SELECT follower_id FROM follows
        WHERE following_id = $1 AND ($2::uuid IS NULL OR follower_id > $2)
        ORDER BY follower_id
        LIMIT $3`,
      [post.author_id, lastId, FANOUT_BATCH]
    );
    if (rows.length === 0) break;
    const ids = rows.map((r) => r.follower_id);
    written += await pushToTimelines(ids, post.id, scoreMs);
    lastId = ids[ids.length - 1];
    if (rows.length < FANOUT_BATCH) break;
  }
  return written;
}

async function rebuildTimeline(userId) {
  // Mark first, THEN read Postgres. A post committed after our read starts its fan-out
  // after the marker exists, so it is written directly; a post committed before our read
  // is picked up by the query. Either way it can't be missed. ZADD is idempotent, so
  // overlapping writes are harmless.
  await redis.set(readyKey(userId), 'building', 'EX', TIMELINE_TTL_SECONDS);

  const { rows } = await db.query(
    `SELECT p.id, p.created_at
       FROM posts p
      WHERE p.author_id IN (SELECT following_id FROM follows WHERE follower_id = $1
                            UNION SELECT $1::uuid)
      ORDER BY p.created_at DESC
      LIMIT $2`,
    [userId, TIMELINE_MAX]
  );

  const multi = redis.multi();
  if (rows.length > 0) {
    const args = [];
    for (const r of rows) args.push(new Date(r.created_at).getTime(), r.id);
    multi.zadd(timelineKey(userId), ...args).expire(timelineKey(userId), TIMELINE_TTL_SECONDS);
  }
  multi.set(readyKey(userId), 'ready', 'EX', TIMELINE_TTL_SECONDS);
  const results = await multi.exec();
  const failed = results.find(([err]) => err);
  if (failed) throw failed[0];
}

const inflight = new Map(); // one rebuild per user per process at a time
async function ensureTimeline(userId) {
  if ((await redis.get(readyKey(userId))) === 'ready') return;
  if (!inflight.has(userId)) {
    inflight.set(userId, rebuildTimeline(userId).finally(() => inflight.delete(userId)));
  }
  await inflight.get(userId);
}

// Follow graph changed -> drop the follower's timeline; the next read rebuilds it from Postgres.
async function invalidateTimeline(userId) {
  await redis.del(timelineKey(userId), readyKey(userId));
}

module.exports = { timelineKey, readyKey, fanoutPost, ensureTimeline, invalidateTimeline, TIMELINE_MAX };
