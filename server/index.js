require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const postRoutes = require('./routes/postRoutes');
const userRoutes = require('./routes/userRoutes');
const createRateLimiter = require('./middleware/rateLimiter');
const demoAuth = require('./middleware/auth');
const db = require('./db/pool');
const redis = require('./db/redisClient');

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 5000;

// Behind a reverse proxy (Render, Railway, nginx) req.ip would otherwise be the
// proxy's address and every client would share one rate-limit bucket.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

// First line of defence: a per-IP limit on EVERYTHING (including /health and unknown routes),
// applied before CORS, body parsing and auth so a flood is rejected before it can cost a
// Postgres lookup. The per-route limiters below are tighter budgets on top of this one.
app.use(createRateLimiter({ name: 'global', windowMs: 60000, max: 600, capacity: 100, refillPerSec: 20 }));

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '100kb' }));

// DEMO AUTH: every request acts as one seeded demo user (see middleware/auth.js).
// Replace with real session/JWT auth before treating this as multi-user.
app.use(demoAuth);

app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);

app.get('/health', async (req, res) => {
  const [pg, rd] = await Promise.allSettled([db.query('SELECT 1'), redis.ping()]);
  const ok = pg.status === 'fulfilled' && rd.status === 'fulfilled';
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    postgres: pg.status === 'fulfilled' ? 'up' : 'down',
    redis: rd.status === 'fulfilled' ? 'up' : 'down',
  });
});

app.use((err, req, res, next) => {
  console.error('[Unhandled Error]:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Slow-client (slowloris-style) defence: don't let a connection sit half-open for minutes.
// connectionsCheckingInterval matters: Node only enforces these timeouts when it sweeps
// connections, and the default sweep runs every 30s.
function createServer() {
  const server = http.createServer({ connectionsCheckingInterval: 5000 }, app);
  server.headersTimeout = 10000;   // time allowed to receive the full request headers
  server.requestTimeout = 20000;   // time allowed to receive the full request (headers + body)
  server.keepAliveTimeout = 5000;  // idle keep-alive sockets are closed
  server.maxRequestsPerSocket = 1000;
  return server;
}

if (require.main === module) {
  createServer().listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

app.createServer = createServer;

module.exports = app;
