import express from "express";
import db from "../db.js";

const router = express.Router();

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: "Not Authenticated" });
}

router.post("/:id/follow", isAuth, async (req, res) => {
  const followerId = req.user.id;
  const followingId = parseInt(req.params.id);

  if (followerId === followingId) {
    return res.status(400).json({ error: "You cannot follow yourself" });
  }

  try {
    const result = await db.query(
      `SELECT * FROM followers WHERE follower_id = $1 AND following_id = $2`,
      [followerId, followingId]
    );

    if (result.rows.length > 0) {
      return res.status(400).json({ error: "Already following this user" });
    }

    
    await db.query(
      `INSERT INTO followers (follower_id, following_id)
       VALUES ($1, $2)`,
      [followerId, followingId]
    );

   
    await db.query(
      `INSERT INTO notifications (user_id, type, content, c_t)
       VALUES ($1, 'follow', $2, NOW())`,
      [
        followingId,
        `@${req.user.username} started following you`,
      ]
    );

    res.json({ message: "Successfully followed user" });
  } catch (err) {
    console.error("Error following user", err);
    res.status(500).json({ error: "Server error while following user" });
  }
});

router.post("/:id/unfollow", isAuth, async (req, res) => {
  const followerId = req.user.id;
  const followingId = parseInt(req.params.id);

  if (followerId === followingId) {
    return res.status(400).json({ error: "You cannot unfollow yourself" });
  }

  try {
    const existing = await db.query(
      "SELECT * FROM followers WHERE follower_id = $1 AND following_id = $2",
      [followerId, followingId]
    );

    if (existing.rows.length === 0) {
      return res.status(400).json({ error: "You are not following this user" });
    }

    await db.query(
      "DELETE FROM followers WHERE follower_id = $1 AND following_id = $2",
      [followerId, followingId]
    );

    res.json({ message: "Successfully unfollowed user" });
  } catch (err) {
    console.error("Error unfollowing user:", err);
    res.status(500).json({ error: "Server error while unfollowing user" });
  }
});

router.get("/:id/followers", async (req, res) => {
  const userId = parseInt(req.params.id);

  try {
    const result = await db.query(
      `SELECT users.id, users.username FROM followers
       JOIN users ON followers.follower_id = users.id
       WHERE followers.following_id = $1`,
      [userId]
    );

    res.json({ followers: result.rows });
  } catch (err) {
    console.error("Error fetching followers:", err);
    res.status(500).json({ error: "Server error while fetching followers" });
  }
});

router.get("/:id/following", async (req, res) => {
  const userId = parseInt(req.params.id);

  try {
    const result = await db.query(
      `SELECT users.id, users.username FROM followers
       JOIN users ON followers.following_id = users.id
       WHERE followers.follower_id = $1`,
      [userId]
    );

    res.json({ following: result.rows });
  } catch (err) {
    console.error("Error fetching following:", err);
    res.status(500).json({ error: "Server error while fetching following" });
  }
});

router.get("/is-following/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.json({ following: false });
  }

  const followerId = req.user.id;
  const followingId = parseInt(req.params.id);

  try {
    const result = await db.query(
      `SELECT * FROM followers WHERE follower_id = $1 AND following_id = $2`,
      [followerId, followingId]
    );
    res.json({ following: result.rows.length > 0 });
  } catch (err) {
    console.error("Error checking follow status:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/:id/remove-follower", isAuth, async (req, res) => {
  const userId = req.user.id;
  const followerId = parseInt(req.params.id);

  try {
    await db.query(
      "DELETE FROM followers WHERE follower_id = $1 AND following_id = $2",
      [followerId, userId]
    );
    res.json({ message: "Removed follower successfully" });
  } catch (err) {
    console.error("Error removing follower:", err);
    res.status(500).json({ error: "Server error while removing follower" });
  }
});

router.get("/:id/is-follower", isAuth, async (req, res) => {
  const userId = parseInt(req.user.id);
  const otherId = parseInt(req.params.id);

  try {
    const result = await db.query(
      `SELECT * FROM followers WHERE follower_id = $1 AND following_id = $2`,
      [otherId, userId]
    );
    res.json({ followsYou: result.rows.length > 0 });
  } catch (err) {
    console.error("Error checking reverse follow status:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
