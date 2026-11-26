const redis = require('../db/redisClient');

const createRateLimiter = ({ windowMs = 60000, max = 60 } = {}) => {
  return async (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    const key = `ratelimit:${ip}:${req.baseUrl || req.path}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    try {
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(key, 0, windowStart);
      pipeline.zcard(key);
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      pipeline.pexpire(key, windowMs);

      const results = await pipeline.exec();
      const currentCount = results[1][1];

      if (currentCount >= max) {
        res.set({
          'X-RateLimit-Limit': max,
          'X-RateLimit-Remaining': 0,
          'Retry-After': Math.ceil(windowMs / 1000),
        });
        return res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Maximum ${max} requests per ${windowMs / 1000}s.`,
        });
      }

      res.set({
        'X-RateLimit-Limit': max,
        'X-RateLimit-Remaining': Math.max(0, max - currentCount - 1),
      });
      next();
    } catch (err) {
      console.error('[RateLimiter Error]:', err);
      next(); // Fail open so cache errors don't disrupt traffic
    }
  };
};

module.exports = createRateLimiter;
