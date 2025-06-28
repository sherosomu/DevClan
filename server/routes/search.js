import express from "express";
import db from "../db.js";

const router = express.Router();

router.get("/users", async (req, res) => {
  const { q } = req.query;

  if (!q) return res.status(400).json({ error: "Query parameter 'q' is required" });

  try {
    const result = await db.query(
      `SELECT id, username, bio FROM users WHERE username ILIKE $1`,
      [`%${q}%`]
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error("ERROR searching users:", err.message); 
    res.status(500).json({ error: "Server Error while searching users" });
  }
});

router.get("/posts", async (req, res) => {
  const { q } = req.query;

  if (!q) return res.status(400).json({ error: "Query parameter 'q' is required" });

  try {
    const result = await db.query(
      `SELECT posts.*, users.username 
       FROM posts 
       JOIN users ON posts.user_id = users.id 
       WHERE posts.title ILIKE $1 OR posts.content ILIKE $1
       ORDER BY posts.c_t DESC`,
      [`%${q}%`]
    );
    res.json({ posts: result.rows });
  } catch (err) {
    console.error("ERROR searching posts:", err.message);
    res.status(500).json({ error: "Server Error while searching posts" });
  }
});

export default router;
