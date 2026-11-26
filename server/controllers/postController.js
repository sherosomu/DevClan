const db = require('../db/pool');
const redis = require('../db/redisClient');

exports.createPost = async (req, res) => {
  const { title, content, tags } = req.body;
  const authorId = req.user?.id || req.body.authorId || 'a0000000-0000-0000-0000-000000000001';

  if (!title || !content) {
    return res.status(400).json({ error: 'Title and content are required' });
  }

  try {
    const insertQuery = `
      INSERT INTO posts (author_id, title, content, tags)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const { rows } = await db.query(insertQuery, [authorId, title, content, tags || []]);
    const post = rows[0];

    // Evict feed caches so new post surfaces immediately
    await redis.del('feed:hot', 'feed:new', 'feed:top').catch((e) => console.error('Redis Invalidation Error:', e));

    return res.status(201).json(post);
  } catch (err) {
    console.error('[Create Post Error]:', err);
    return res.status(500).json({ error: 'Failed to create post' });
  }
};

exports.handleVote = async (req, res) => {
  const { id: postId } = req.params;
  const { direction } = req.body;
  const userId = req.user?.id || req.body.userId || 'a0000000-0000-0000-0000-000000000001';

  if (![-1, 0, 1].includes(direction)) {
    return res.status(400).json({ error: 'Invalid vote direction. Must be -1, 0, or 1' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    let result;

    if (direction === 0) {
      const cancelQuery = `
        WITH deleted_vote AS (
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
        RETURNING id, score, upvotes, downvotes;
      `;
      result = await client.query(cancelQuery, [userId, postId]);
    } else {
      const upsertVoteQuery = `
        WITH old_vote AS (
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
        RETURNING id, score, upvotes, downvotes;
      `;
      result = await client.query(upsertVoteQuery, [userId, postId, direction]);
    }

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Post not found' });
    }

    await client.query('COMMIT');
    await redis.del('feed:hot', 'feed:top').catch((e) => console.error('Redis Invalidation Error:', e));

    return res.json({ success: true, post: result.rows[0], userVote: direction });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Vote Transaction Failed]:', err);
    return res.status(500).json({ error: 'Failed to process vote atomically' });
  } finally {
    client.release();
  }
};
