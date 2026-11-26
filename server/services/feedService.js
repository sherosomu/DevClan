const db = require('../db/pool');
const redis = require('../db/redisClient');

const calculateHotScore = (netScore, createdAt, gravity = 1.8) => {
  const hoursElapsed = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  return netScore / Math.pow(hoursElapsed + 2, gravity);
};

const rebuildFeedCache = async (type = 'hot') => {
  const query = `
    SELECT id, score, created_at
    FROM posts
    ORDER BY created_at DESC
    LIMIT 100;
  `;
  const { rows } = await db.query(query);
  if (!rows || rows.length === 0) return;

  const cacheKey = `feed:${type}`;
  const pipeline = redis.pipeline();
  pipeline.del(cacheKey);

  rows.forEach((post) => {
    let scoreVal = 0;
    if (type === 'hot') {
      scoreVal = calculateHotScore(post.score, post.created_at);
    } else if (type === 'new') {
      scoreVal = new Date(post.created_at).getTime();
    } else {
      scoreVal = post.score;
    }
    pipeline.zadd(cacheKey, scoreVal, post.id);
  });

  pipeline.expire(cacheKey, 300);
  await pipeline.exec();
};

exports.getFeed = async ({ type = 'hot', cursor = '+inf', limit = 20, userId = null }) => {
  const validTypes = ['hot', 'new', 'top'];
  const feedType = validTypes.includes(type) ? type : 'hot';
  const cacheKey = `feed:${feedType}`;
  const parsedLimit = Math.min(parseInt(limit, 10) || 20, 50);

  try {
    const exists = await redis.exists(cacheKey);
    if (!exists) {
      await rebuildFeedCache(feedType);
    }

    const minScore = '-inf';
    const maxScore = cursor === '+inf' ? '+inf' : `(${cursor}`;

    const rawResults = await redis.zrevrangebyscore(
      cacheKey,
      maxScore,
      minScore,
      'WITHSCORES',
      'LIMIT',
      0,
      parsedLimit
    );

    if (!rawResults || rawResults.length === 0) {
      return { posts: [], nextCursor: null };
    }

    const postIds = [];
    let nextCursor = null;

    for (let i = 0; i < rawResults.length; i += 2) {
      postIds.push(rawResults[i]);
      nextCursor = rawResults[i + 1];
    }

    const hydrateQuery = `
      SELECT
        p.*,
        u.username AS author_name,
        u.avatar_url AS author_avatar,
        COALESCE(v.direction, 0) AS user_vote
      FROM posts p
      JOIN users u ON p.author_id = u.id
      LEFT JOIN votes v ON p.id = v.post_id AND v.user_id = $2
      WHERE p.id = ANY($1::uuid[])
    `;

    const { rows } = await db.query(hydrateQuery, [postIds, userId]);
    const postMap = new Map(rows.map((p) => [p.id, p]));
    const sortedPosts = postIds.map((id) => postMap.get(id)).filter(Boolean);

    return { posts: sortedPosts, nextCursor };
  } catch (err) {
    console.error('[Feed Service Cache Fallback]:', err);
    // Direct DB fallback
    const fallbackQuery = `
      SELECT
        p.*,
        u.username AS author_name,
        u.avatar_url AS author_avatar,
        0 AS user_vote
      FROM posts p
      JOIN users u ON p.author_id = u.id
      ORDER BY p.created_at DESC
      LIMIT $1;
    `;
    const { rows } = await db.query(fallbackQuery, [parsedLimit]);
    return { posts: rows, nextCursor: null };
  }
};
