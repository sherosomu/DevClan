const db = require('../db/pool');
const { invalidateTimeline } = require('../services/timelineService');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

exports.listUsers = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.avatar_url,
              EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = u.id) AS is_following,
              (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id)::int AS follower_count
         FROM users u
        ORDER BY u.username
        LIMIT 50`,
      [req.user.id]
    );
    res.json({ users: rows });
  } catch (err) {
    console.error('[List Users Error]:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
};

exports.follow = async (req, res) => {
  const targetId = req.params.id;
  if (!UUID_RE.test(targetId)) return res.status(400).json({ error: 'Invalid user id' });
  if (targetId === req.user.id) return res.status(400).json({ error: 'You cannot follow yourself' });

  try {
    const { rowCount } = await db.query(
      `INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.user.id, targetId]
    );
    if (rowCount > 0) await invalidateTimeline(req.user.id); // rebuilt from Postgres on next read
    res.json({ following: true });
  } catch (err) {
    if (err.code === '23503') return res.status(404).json({ error: 'User not found' });
    console.error('[Follow Error]:', err);
    res.status(500).json({ error: 'Failed to follow user' });
  }
};

exports.unfollow = async (req, res) => {
  const targetId = req.params.id;
  if (!UUID_RE.test(targetId)) return res.status(400).json({ error: 'Invalid user id' });

  try {
    const { rowCount } = await db.query(
      `DELETE FROM follows WHERE follower_id = $1 AND following_id = $2`,
      [req.user.id, targetId]
    );
    if (rowCount > 0) await invalidateTimeline(req.user.id);
    res.json({ following: false });
  } catch (err) {
    console.error('[Unfollow Error]:', err);
    res.status(500).json({ error: 'Failed to unfollow user' });
  }
};
