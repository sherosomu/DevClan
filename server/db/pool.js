const { Pool } = require('pg');

// One shared pool per process: connections are reused instead of opened per request.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/devclan',
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000, // fail fast (error) instead of queueing forever when the pool is exhausted
});

// An error on an IDLE client (e.g. the DB restarted) must not crash the API.
// pg discards the broken client and creates a new one on demand.
pool.on('error', (err) => {
  console.error('[PostgreSQL Pool] idle client error:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool,
};
