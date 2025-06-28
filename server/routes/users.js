import express from "express";
import db from "../db.js";

const router = express.Router();

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: "Not authenticated" });
}

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    const result = await db.query(
      `SELECT id, username, email, bio, skills, social_links, c_t
       FROM users WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User NOT found" });
    }

    const user = result.rows[0];
    res.json({ user, currentUser: req.user });
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ error: "Server Error while fetching profile" });
  }
});

router.get("/:id/edit", isAuth, async (req, res) => {
  const id = parseInt(req.params.id);

  if (req.user.id !== id) {
    return res.status(403).json({ error: "Forbidden: You can't edit this profile" });
  }

  try {
    const result = await db.query(
      `SELECT id, username, email, bio, skills, social_links, c_t
       FROM users WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User NOT found" });
    }

    const user = result.rows[0];
    res.json({ user });
  } catch (err) {
    console.error("Error fetching profile for edit:", err);
    res.status(500).json({ error: "Server Error while fetching profile for edit" });
  }
});

router.put("/:id", isAuth, async (req, res) => {
  const userId = parseInt(req.params.id);

  if (req.user.id !== userId) {
    return res.status(403).json({ error: "Forbidden: You can't edit this profile" });
  }

  const { bio, skills, social_links } = req.body;

  try {
    await db.query(
      `UPDATE users
       SET bio = $1, skills = $2, social_links = $3
       WHERE id = $4`,
      [bio, skills, social_links, userId]
    );

    res.json({ message: "Profile updated successfully", userId });
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).json({ error: "Server error while updating profile" });
  }
});

export default router;
