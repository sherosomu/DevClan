const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const feedService = require('../services/feedService');
const createRateLimiter = require('../middleware/rateLimiter');

const readLimiter = createRateLimiter({ name: 'feed-read', windowMs: 60000, max: 120, capacity: 30, refillPerSec: 2 });
const writeLimiter = createRateLimiter({ name: 'post-write', windowMs: 60000, max: 20, capacity: 10, refillPerSec: 0.5 });

router.get('/feed', readLimiter, async (req, res) => {
  try {
    const feed = await feedService.getFeed({
      type: req.query.type,
      cursor: req.query.cursor,
      limit: req.query.limit,
      userId: req.user?.id ?? null,
    });
    res.json(feed);
  } catch (err) {
    if (err.code === 'AUTH_REQUIRED') return res.status(401).json({ error: 'Login required' });
    if (err.code === 'BAD_CURSOR') return res.status(400).json({ error: 'Invalid cursor' });
    console.error('[Feed Route Error]:', err);
    res.status(500).json({ error: 'Failed to retrieve feed' });
  }
});

router.post('/', writeLimiter, postController.createPost);
router.post('/:id/vote', writeLimiter, postController.handleVote);

module.exports = router;
