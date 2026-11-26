const db = require('../db/pool');
const redis = require('../db/redisClient');
const { hotScore, formatCursor, parseCursor, dropServed } = require('../lib/feedCursor');
const { timelineKey, ensureTimeline } = require('./timelineService');

const VALID_TYPES = ['hot', 'new', 'top', 'following'];
const CACHE_TTL_SECONDS = 300;
const CANDIDATE_LIMIT = 500; // each cached feed holds at most this many posts

// Each feed ranks a bounded candidate set chosen with an indexed query,
// so no query ever scores the whole posts table.
//   hot -> 500 newest posts (idx_posts_created), decay score computed below.
//          Older posts age out of "hot" by design.
//   new -> 500 newest posts
//   top -> 500 highest-scored posts (idx_posts_score_created)
const CANDIDATE_QUERIES = {
  hot: 'SELECT id, score, created_at FROM posts ORDER BY created_at DESC LIMIT $1',
  new: 'SELECT id, score, created_at FROM posts ORDER BY created_at DESC LIMIT $1',
  top: 'SELECT id, score, created_at FROM posts ORDER BY score DESC, created_at DESC LIMIT $1',
};

const cacheKey = (type) => `feed:${type}`;

function memberScore(type, post, now) {
  if (type === 'hot') return hotScore(post.score, post.created_at, now);
  if (type === 'new') return new Date(post.created_at).getTime();
  return post.score;
}

// Build the ZSET under a temporary key, then RENAME it over the live key inside
// MULTI, so readers never see a half-built or empty feed.
async function rebuildFeedCache(type) {
  const { rows } = await db.query(CANDIDATE_QUERIES[type], [CANDIDATE_LIMIT]);
  const key = cacheKey(type);

  if (rows.length === 0) {
    await redis.del(key);
    return;
  }

  const now = Date.now();
  const args = [];
  for (const post of rows) args.push(memberScore(type, post, now), post.id);

  const tmp = `${key}:building:${process.pid}:${now}`;
  const results = await redis.multi().zadd(tmp, ...args).expire(tmp, CACHE_TTL_SECONDS).rename(tmp, key).exec();
  const failed = results.find(([err]) => err);
  if (failed) throw failed[0];
}

// If many requests arrive while the cache is cold, share one rebuild per
// process instead of running N identical queries (cache stampede).
const inflight = new Map();
function ensureCache(type) {
  if (!inflight.has(type)) {
    const p = rebuildFeedCache(type).finally(() => inflight.delete(type));
    inflight.set(type, p);
  }
  return inflight.get(type);
}

// Shared by the global feeds and the per-user Following timeline: both are Redis sorted
// sets paged with the same tie-safe cursor.
async function readZsetPage({ key, parsedCursor, pageSize, userId }) {
  // Cursor pagination: jump straight to the cursor score in the skip list.
  // The tied group at that score is re-read inclusively (ZCOUNT tells us how
  // large it is) and already-served members are dropped, so equal scores are
  // never skipped.
  let fetchCount = pageSize;
  if (parsedCursor) {
    fetchCount += await redis.zcount(key, parsedCursor.score, parsedCursor.score);
  }
  const raw = await redis.zrevrangebyscore(
    key,
    parsedCursor ? parsedCursor.score : '+inf',
    '-inf',
    'WITHSCORES',
    'LIMIT',
    0,
    fetchCount
  );

  let entries = [];
  for (let i = 0; i < raw.length; i += 2) entries.push({ id: raw[i], score: raw[i + 1] });
  entries = dropServed(entries, parsedCursor).slice(0, pageSize);

  if (entries.length === 0) return { posts: [], nextCursor: null };

  const postIds = entries.map((e) => e.id);
  const last = entries[entries.length - 1];
  const nextCursor = entries.length === pageSize ? formatCursor(last.score, last.id) : null;

  // Hydrate from Postgres with a primary-key lookup. Counts and the viewer's
  // vote are always read fresh from the DB; only the *ordering* is cached.
  const { rows } = await db.query(
    `SELECT p.*, u.username AS author_name, u.avatar_url AS author_avatar,
            COALESCE(v.direction, 0) AS user_vote
       FROM posts p
       JOIN users u ON p.author_id = u.id
       LEFT JOIN votes v ON p.id = v.post_id AND v.user_id = $2
      WHERE p.id = ANY($1::uuid[])`,
    [postIds, userId]
  );
  const byId = new Map(rows.map((p) => [p.id, p]));
  return { posts: postIds.map((id) => byId.get(id)).filter(Boolean), nextCursor };
}

exports.getFeed = async ({ type = 'hot', cursor = null, limit = 20, userId = null }) => {
  const feedType = VALID_TYPES.includes(type) ? type : 'hot';
  const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
  const parsedCursor = parseCursor(cursor); // throws BAD_CURSOR -> route returns 400

  if (feedType === 'following' && !userId) {
    const err = new Error('Login required');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  try {
    // Redis known to be down: go straight to the Postgres fallback instead of queueing commands.
    if (['reconnecting', 'close', 'end'].includes(redis.status)) throw new Error(`redis ${redis.status}`);

    let key;
    if (feedType === 'following') {
      await ensureTimeline(userId);          // rebuilt from Postgres only when cold
      key = timelineKey(userId);
    } else {
      key = cacheKey(feedType);
      if (!(await redis.exists(key))) await ensureCache(feedType);
    }
    return await readZsetPage({ key, parsedCursor, pageSize, userId });
  } catch (err) {
    console.error('[Feed Service] Redis path failed, falling back to Postgres:', err.message);
    const following = feedType === 'following';
    const { rows } = await db.query(
      `SELECT p.*, u.username AS author_name, u.avatar_url AS author_avatar,
              COALESCE(v.direction, 0) AS user_vote
         FROM posts p
         JOIN users u ON p.author_id = u.id
         LEFT JOIN votes v ON p.id = v.post_id AND v.user_id = $2
        WHERE ($3::boolean = false
               OR p.author_id IN (SELECT following_id FROM follows WHERE follower_id = $2
                                  UNION SELECT $2::uuid))
        ORDER BY p.created_at DESC LIMIT $1`,
      [pageSize, userId, following]
    );
    return { posts: rows, nextCursor: null }; // degraded mode: first page only
  }
};
