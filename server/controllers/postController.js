const db = require('../db/pool');
const redis = require('../db/redisClient');
const { fanoutPost } = require('../services/timelineService');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

exports.createPost = async (req, res) => {
  const { title, content, tags } = req.body;
  const authorId = req.user.id; // identity comes from auth middleware, never from the request body

  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO posts (author_id, title, content, tags)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [authorId, title, content, Array.isArray(tags) ? tags.slice(0, 10) : []]
    );

    // Evict cached orderings so the new post can surface.
    await redis.del('feed:hot', 'feed:new', 'feed:top').catch((e) => console.error('Redis invalidation error:', e.message));

    // Fan-out on write: push the post id into each follower's timeline ZSET. Started after
    // the INSERT has committed, and not awaited, so the author isn't blocked on N Redis writes.
    // If it fails, followers' timelines are rebuilt from Postgres when they expire.
    fanoutPost(rows[0]).catch((e) => console.error('[Fan-out Error]:', e.message));

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Create Post Error]:', err);
    return res.status(500).json({ error: 'Failed to create post' });
  }
};

// direction: 1 = upvote, -1 = downvote, 0 = remove vote.
//
// Two concurrency concerns, two different mechanisms:
//
//  1. Different users voting on the same post: the final UPDATE posts ... uses
//     RELATIVE increments (score = score + delta), and Postgres row-locks the
//     post row, so these serialize correctly.
//
//  2. The SAME user voting on the same post twice at once (double click, retry):
//     the CTE reads the previous vote and then writes a delta based on it. Two
//     concurrent runs could both read "no previous vote" and both add +1 even
//     though only one votes row exists -> counters drift from the votes table.
//     (It's a read-modify-write, like updating a shared variable without a
//     mutex.) Fix: a transaction-scoped advisory lock keyed on (user, post)
//     makes those requests run one at a time. It is released automatically on
//     COMMIT/ROLLBACK and does not block votes by other users.
exports.handleVote = async (req, res) => {
  const { id: postId } = req.params;
  const { direction } = req.body;
  const userId = req.user.id;

  if (!UUID_RE.test(postId)) {
    return res.status(400).json({ error: 'Invalid post id' });
  }
  if (![-1, 0, 1].includes(direction)) {
    return res.status(400).json({ error: 'Invalid vote direction. Must be -1, 0, or 1' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text, 0))`, [userId, postId]);

    let result;

    if (direction === 0) {
      result = await client.query(
        `WITH deleted_vote AS (
           DELETE FROM votes
           WHERE user_id = $1 AND post_id = $2
           RETURNING direction
         )
         UPDATE posts
         SET
           score = score - COALESCE((SELECT direction FROM deleted_vote), 0),
           upvotes = upvotes - CASE WHEN (SELECT direction FROM deleted_vote) = 1 THEN 1 ELSE 0 END,
           downvotes = downvotes - CASE WHEN (SELECT direction FROM deleted_vote) = -1 THEN 1 ELSE 0 END
         WHERE id = $2
         RETURNING id, score, upvotes, downvotes;`,
        [userId, postId]
      );
    } else {
      result = await client.query(
        `WITH old_vote AS (
           SELECT direction FROM votes WHERE user_id = $1 AND post_id = $2
         ),
         upserted_vote AS (
           INSERT INTO votes (user_id, post_id, direction)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, post_id)
           DO UPDATE SET direction = EXCLUDED.direction
           RETURNING direction, (SELECT direction FROM old_vote) AS prev_direction
         )
         UPDATE posts
         SET
           score = score + ($3 - COALESCE((SELECT prev_direction FROM upserted_vote), 0)),
           upvotes = upvotes + CASE
             WHEN (SELECT prev_direction FROM upserted_vote) IS NULL AND $3 = 1 THEN 1
             WHEN (SELECT prev_direction FROM upserted_vote) = -1 AND $3 = 1 THEN 1
             WHEN (SELECT prev_direction FROM upserted_vote) = 1 AND $3 = -1 THEN -1
             ELSE 0 END,
           downvotes = downvotes + CASE
             WHEN (SELECT prev_direction FROM upserted_vote) IS NULL AND $3 = -1 THEN 1
             WHEN (SELECT prev_direction FROM upserted_vote) = 1 AND $3 = -1 THEN 1
             WHEN (SELECT prev_direction FROM upserted_vote) = -1 AND $3 = 1 THEN -1
             ELSE 0 END
         WHERE id = $2
         RETURNING id, score, upvotes, downvotes;`,
        [userId, postId, direction]
      );
    }

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Post not found' });
    }

    await client.query('COMMIT');
    await redis.del('feed:hot', 'feed:top').catch((e) => console.error('Redis invalidation error:', e.message));

    return res.json({ success: true, post: result.rows[0], userVote: direction });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Post not found' }); // FK violation: post doesn't exist
    }
    console.error('[Vote Transaction Failed]:', err);
    return res.status(500).json({ error: 'Failed to process vote' });
  } finally {
    client.release();
  }
};
