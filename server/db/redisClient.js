const Redis = require('ioredis');

const options = {
  maxRetriesPerRequest: 3,
  commandTimeout: 1000, // a stalled Redis must not hold requests open indefinitely
  retryStrategy: (attempts) => Math.min(attempts * 100, 2000), // capped backoff
};

// REDIS_URL (e.g. managed Redis on Render/Upstash) takes priority over host/port.
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, options)
  : new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      ...options,
    });

redis.on('error', (err) => console.error('[redis] connection error:', err.message));

module.exports = redis;
