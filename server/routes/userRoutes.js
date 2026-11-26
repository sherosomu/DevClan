const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const createRateLimiter = require('../middleware/rateLimiter');

const readLimiter = createRateLimiter({ name: 'user-read', windowMs: 60000, max: 120, capacity: 30, refillPerSec: 2 });
const writeLimiter = createRateLimiter({ name: 'follow-write', windowMs: 60000, max: 30, capacity: 10, refillPerSec: 0.5 });

router.get('/', readLimiter, userController.listUsers);
router.post('/:id/follow', writeLimiter, userController.follow);
router.delete('/:id/follow', writeLimiter, userController.unfollow);

module.exports = router;
