// DEMO AUTH ONLY. There is no login flow. By default every request acts as the seeded
// demo user; to try the Following feed, the UI sends `X-Demo-User: <uuid>` to act as one
// of the other seeded users (alice, bob, carol, dave). Real session/JWT auth is a known
// TODO (the original DevClan on `main` uses Passport sessions).
const db = require('../db/pool');

const DEMO_USER = { id: 'a0000000-0000-0000-0000-000000000001', username: 'demo_user' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async (req, res, next) => {
  try {
    const asUser = req.get('x-demo-user');
    if (!asUser) {
      req.user = DEMO_USER;
      return next();
    }
    if (!UUID_RE.test(asUser)) return res.status(400).json({ error: 'Invalid X-Demo-User' });
    const { rows } = await db.query('SELECT id, username FROM users WHERE id = $1', [asUser]);
    if (rows.length === 0) return res.status(401).json({ error: 'Unknown user' });
    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
};
