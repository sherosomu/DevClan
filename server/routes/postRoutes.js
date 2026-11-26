const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const feedService = require('../services/feedService');
const createRateLimiter = require('../middleware/rateLimiter');

// Read Feed Endpoint (Protected with general read rate limiter: 120 req / min)
router.get('/feed', createRateLimiter({ windowMs: 60000, max: 120 }), async (req, res) => {
  try {
    const feed = await feedService.getFeed({
      type: req.query.type,
      cursor: req.query.cursor,
      limit: req.query.limit,
      userId: req.query.userId,
    });
    res.json(feed);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve feed' });
  }
});

// Strict Rate Limiter for Mutation Endpoints (20 req / min to prevent spam)
const mutationLimiter = createRateLimiter({ windowMs: 60000, max: 20 });

router.post('/', mutationLimiter, postController.createPost);
router.post('/:id/vote', mutationLimiter, postController.handleVote);

module.exports = router;
