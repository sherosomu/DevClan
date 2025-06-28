import express from "express";
import db from "../db.js";

const router = express.Router();

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: "Not Authenticated" });
}

router.get("/", isAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT posts.*, users.username
       FROM posts
       JOIN users ON posts.user_id = users.id
       ORDER BY posts.c_t DESC`
    );
    res.json({ posts: result.rows, currentUser: req.user });
  } catch (err) {
    console.error("Error fetching posts:", err);
    res.status(500).json({ message: "Server Error while fetching posts" });
  }
});

router.get("/following", isAuth, async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await db.query(`
      SELECT posts.*, users.username
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.user_id IN (
        SELECT following_id FROM followers WHERE follower_id = $1
      )
      ORDER BY posts.c_t DESC
      LIMIT 35
    `, [userId]);

    res.json({ posts: result.rows });
  } catch (err) {
    console.error("Error fetching following posts:", err);
    res.status(500).json({ error: "Server error while fetching following posts" });
  }
});

router.get("/popular", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT posts.*, users.username, COUNT(likes.user_id) AS like_count
      FROM posts
      JOIN users ON posts.user_id = users.id
      LEFT JOIN likes ON posts.id = likes.post_id AND likes.c_t >= NOW() - INTERVAL '1 day'
      GROUP BY posts.id, users.id
      ORDER BY like_count DESC, posts.c_t DESC
      LIMIT 35
    `);

    res.json({ posts: result.rows });
  } catch (err) {
    console.error("Error fetching popular posts:", err);
    res.status(500).json({ error: "Server error while fetching popular posts" });
  }
});

router.get("/user/:id", async (req, res) => {
  const userId = parseInt(req.params.id);

  try {
    const result = await db.query(
      `SELECT posts.*, users.username 
       FROM posts 
       JOIN users ON posts.user_id = users.id 
       WHERE posts.user_id = $1
       ORDER BY posts.c_t DESC`,
      [userId]
    );
    res.json({ posts: result.rows });
  } catch (err) {
    console.error("Error fetching user's posts:", err);
    res.status(500).json({ error: "Server error while fetching user's posts" });
  }
});

router.get("/:id", isAuth, async (req, res) => {
  const postId = parseInt(req.params.id);
  if (isNaN(postId)) {
    return res.status(400).json({ error: "Invalid post ID" });
  }
  try {
    const Post = await db.query(
      `SELECT posts.*, users.username
       FROM posts
       JOIN users ON posts.user_id = users.id
       WHERE posts.id = $1`,
      [postId]
    );

    if (Post.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    const commResult = await db.query(
      `SELECT comments.*, users.username
       FROM comments
       JOIN users ON comments.user_id = users.id
       WHERE comments.post_id = $1
       ORDER BY comments.c_t ASC`,
      [postId]
    );

    res.json({
      post: Post.rows[0],
      comments: commResult.rows,
      currentUser: req.user
    });
  } catch (err) {
    console.error("Error fetching post:", err);
    res.status(500).json({ error: "Server error while fetching post" });
  }
});

router.post("/new", isAuth, async (req, res) => {
  const { title, content } = req.body;
  const userId = req.user.id;

  try {
    const result = await db.query(
      `INSERT INTO posts (user_id, title, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, title, content]
    );

    res.status(201).json({ message: "Post created successfully", post: result.rows[0] });
  } catch (err) {
    console.error("Error creating post", err);
    res.status(500).json({ message: "Server Error while creating post" });
  }
});

router.get("/:id/edit", isAuth, async (req, res) => {
  const postId = parseInt(req.params.id);

  try {
    const result = await db.query(
      `SELECT * FROM posts WHERE id = $1`,
      [postId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    const post = result.rows[0];

    if (post.user_id !== req.user.id) {
      return res.status(403).json({ error: "You cannot edit this post" });
    }

    res.json({
      post,
      currentUser: req.user
    });
  } catch (err) {
    console.error("Error loading edit page", err);
    res.status(500).json({ error: "Server Error while loading post data" });
  }
});

router.post("/:id/edit", isAuth, async (req, res) => {
  const postId = parseInt(req.params.id);
  const { title, content } = req.body;

  try {
    const postResult = await db.query(
      `SELECT * FROM posts WHERE id = $1`,
      [postId]
    );

    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (postResult.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: "Not Allowed" });
    }

    await db.query(
      `UPDATE posts SET title = $1, content = $2 WHERE id = $3`,
      [title, content, postId]
    );
    res.json({ message: "Post updated successfully" });
  } catch (err) {
    console.error("Error updating post", err);
    res.status(500).json({ error: "Server Error while updating post" });
  }
});

router.post("/:id/delete", isAuth, async (req, res) => {
  const postId = parseInt(req.params.id);

  try {
    const postResult = await db.query(
      `SELECT * FROM posts WHERE id = $1`,
      [postId]
    );

    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (postResult.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: "Not authorised" });
    }

    await db.query(`DELETE FROM posts WHERE id = $1`, [postId]);
    res.json({ message: "Post deleted successfully" });
  } catch (err) {
    console.error("Error deleting post", err);
    res.status(500).json({ error: "SERVER ERROR while deleting post" });
  }
});

export default router;
