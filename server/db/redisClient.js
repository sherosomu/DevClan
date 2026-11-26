// server/db/redisClient.js
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryStrategy: (attempts) => Math.min(attempts * 100, 2000), // capped exponential backoff
});

redis.on('error', (err) => console.error('[redis] connection error:', err.message));

module.exports = redis;
