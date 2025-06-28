import express from "express";
import db from "../db.js";

const router = express.Router();

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: "Not Authenticated" });
}

router.post("/:postId/like", isAuth, async (req, res) => {
  const postId = parseInt(req.params.postId);
  const userId = req.user.id;

  try {
    await db.query(
      `INSERT INTO likes (user_id, post_id, c_t)
       VALUES ($1, $2, NOW())
       ON CONFLICT DO NOTHING`,
      [userId, postId]
    );

    const postRes = await db.query(
      `SELECT user_id FROM posts WHERE id = $1`,
      [postId]
    );

    if (postRes.rows.length > 0) {
      const postOwnerId = postRes.rows[0].user_id;

      if (postOwnerId !== userId) {
        await db.query(
          `INSERT INTO notifications (user_id, type, content, c_t)
           VALUES ($1, 'like', $2, NOW())`,
          [
            postOwnerId,
            `@${req.user.username} liked your post`,
          ]
        );
      }
    }

    res.status(200).json({ message: "Post liked and notification sent" });
  } catch (err) {
    console.error("Error liking post:", err);
    res.status(500).json({ error: "Server error while liking post" });
  }
});

router.post("/:postId/unlike", isAuth, async (req, res) => {
  const postId = parseInt(req.params.postId);
  const userId = req.user.id;

  try {
    await db.query(
      `DELETE FROM likes WHERE user_id = $1 AND post_id = $2`,
      [userId, postId]
    );
    res.status(200).json({ message: "Post unliked successfully" });
  } catch (err) {
    console.error("Error unliking post:", err);
    res.status(500).json({ error: "Server error while unliking post" });
  }
});

router.get("/:postId", async (req, res) => {
  const postId = parseInt(req.params.postId);
  const userId = req.user?.id;

  try {
    const countRes = await db.query(
      `SELECT COUNT(*) FROM likes WHERE post_id = $1`,
      [postId]
    );

    let liked = false;
    if (userId) {
      const likedRes = await db.query(
        `SELECT 1 FROM likes WHERE post_id = $1 AND user_id = $2`,
        [postId, userId]
      );
      liked = likedRes.rowCount > 0;
    }

    res.json({
      count: parseInt(countRes.rows[0].count),
      liked,
    });
  } catch (err) {
    console.error("Error fetching like info:", err);
    res.status(500).json({ error: "Server error while getting like info" });
  }
});

router.get("/:postId/users", async (req, res) => {
  const postId = parseInt(req.params.postId);

  try {
    const result = await db.query(`
      SELECT users.id, users.username 
      FROM likes 
      JOIN users ON likes.user_id = users.id
      WHERE likes.post_id = $1
    `, [postId]);

    res.json({ users: result.rows });
  } catch (err) {
    console.error("Error fetching liked users:", err);
    res.status(500).json({ error: "Server error fetching liked users" });
  }
});

export default router;
