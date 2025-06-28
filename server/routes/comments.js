import express from "express";
import db from "../db.js";

const router = express.Router();

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Not Authenticated" });
}


router.post("/:postId/new", isAuth, async (req, res) => {
  const postId = parseInt(req.params.postId);
  const userId = req.user.id;
  const { content } = req.body;

  try {
    
    await db.query(
      `INSERT INTO comments (user_id, post_id, content, c_t)
       VALUES ($1, $2, $3, NOW())`,
      [userId, postId, content]
    );

    
    const postResult = await db.query(
      `SELECT user_id FROM posts WHERE id = $1`,
      [postId]
    );

    if (postResult.rows.length > 0) {
      const postOwnerId = postResult.rows[0].user_id;

     
      if (postOwnerId !== userId) {
        await db.query(
          `INSERT INTO notifications (user_id, type, content, c_t)
           VALUES ($1, 'comment', $2, NOW())`,
          [
            postOwnerId,
            `@${req.user.username} commented on your post`,
          ]
        );
      }
    }

    res.status(201).json({ message: "Comment added successfully" });
  } catch (err) {
    console.error("Error adding comment:", err);
    res.status(500).json({ error: "Server error while adding comment" });
  }
});

router.post("/:commentId/edit", isAuth, async (req, res) => {
  const commentId = parseInt(req.params.commentId);
  const { content } = req.body;
  const userId = req.user.id;

  try {
    const result = await db.query(
      `SELECT * FROM comments WHERE id = $1`,
      [commentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Comment not found" });
    }

    if (result.rows[0].user_id !== userId) {
      return res.status(403).json({ error: "Not allowed to edit this comment" });
    }

    await db.query(
      `UPDATE comments SET content = $1 WHERE id = $2`,
      [content, commentId]
    );
    res.json({ message: "Comment updated successfully" });
  } catch (err) {
    console.error("Error updating comment:", err);
    res.status(500).json({ error: "Server error while updating comment" });
  }
});

router.post("/:commentId/delete", isAuth, async (req, res) => {
  const commentId = parseInt(req.params.commentId);
  const userId = req.user.id;

  try {
    const result = await db.query(
      `SELECT * FROM comments WHERE id = $1`,
      [commentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Comment Not found" });
    }

    if (result.rows[0].user_id !== userId) {
      return res.status(403).json({ error: "Not allowed to delete this comment" });
    }

    await db.query(
      `DELETE FROM comments WHERE id = $1`,
      [commentId]
    );
    res.json({ message: "Comment deleted successfully" });
  } catch (err) {
    console.error("Error deleting comment:", err);
    res.status(500).json({ error: "Server error while deleting comment" });
  }
});

router.get("/post/:postId", async (req, res) => {
  const postId = parseInt(req.params.postId);

  try {
    const result = await db.query(
      `SELECT comments.*, users.username
       FROM comments
       JOIN users ON comments.user_id = users.id
       WHERE comments.post_id = $1
       ORDER BY comments.c_t ASC`,
      [postId]
    );

    res.json({ comments: result.rows });
  } catch (err) {
    console.error("Error fetching comments:", err);
    res.status(500).json({ error: "Server error while fetching comments" });
  }
});

export default router;
