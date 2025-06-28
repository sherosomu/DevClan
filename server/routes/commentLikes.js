import express from "express";
import db from "../db.js";

const router = express.Router();

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: "Not Authenticated" });
}

router.post("/:commentId/like", isAuth, async (req, res) => {
  const commentId = parseInt(req.params.commentId);
  const userId = req.user.id;

  try {
    await db.query(
      `INSERT INTO comment_likes (user_id, comment_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, commentId]
    );

    res.status(200).json({ message: "Comment liked successfully" });
  } catch (err) {
    console.error("Error liking comment:", err);
    res.status(500).json({ error: "Server error while liking comment" });
  }
});

router.post("/:commentId/unlike", isAuth, async (req, res) => {
  const commentId = parseInt(req.params.commentId);
  const userId = req.user.id;

  try {
    await db.query(
      `DELETE FROM comment_likes
       WHERE user_id = $1 AND comment_id = $2`,
      [userId, commentId]
    );

    res.status(200).json({ message: "Comment unliked successfully" });
  } catch (err) {
    console.error("Error unliking comment:", err);
    res.status(500).json({ error: "Server error while unliking comment" });
  }
});

router.get("/:commentId", async (req, res) => {
  const commentId = parseInt(req.params.commentId);
  const userId = req.user?.id;

  try {
    const countRes = await db.query(
      `SELECT COUNT(*) FROM comment_likes WHERE comment_id = $1`,
      [commentId]
    );

    let liked = false;
    if (userId) {
      const likedRes = await db.query(
        `SELECT 1 FROM comment_likes WHERE comment_id = $1 AND user_id = $2`,
        [commentId, userId]
      );
      liked = likedRes.rowCount > 0;
    }

    res.json({
      count: parseInt(countRes.rows[0].count),
      liked,
    });
  } catch (err) {
    console.error("Error fetching comment like info:", err);
    res.status(500).json({ error: "Server error while getting like info" });
  }
});

export default router;
