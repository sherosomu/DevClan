// Pure helpers (no Redis / Postgres) so the pagination logic can be unit tested.
//
// Why a composite cursor? A ZSET can hold many members with the SAME score
// (e.g. two posts both at score 3 on the "top" feed). A cursor of just the last
// score with an exclusive bound "(3" would skip every other post with score 3.
// Instead the cursor is "<score>|<lastMemberId>": we re-read the tied group
// inclusively and drop the members that were already served.

const GRAVITY = 1.8;

function hotScore(netScore, createdAt, now = Date.now(), gravity = GRAVITY) {
  const hoursElapsed = Math.max(0, (now - new Date(createdAt).getTime()) / 3_600_000);
  return netScore / Math.pow(hoursElapsed + 2, gravity);
}

function formatCursor(score, id) {
  return `${score}|${id}`;
}

// null / '' / '+inf'  -> first page (returns null)
// '<score>|<id>'      -> { score, id }
// anything else       -> throws an error with code BAD_CURSOR
function parseCursor(raw) {
  if (raw === undefined || raw === null || raw === '' || raw === '+inf') return null;
  const sep = String(raw).indexOf('|');
  if (sep <= 0) throw badCursor();
  const score = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!id || Number.isNaN(Number(score))) throw badCursor();
  return { score, id };
}

function badCursor() {
  const err = new Error('Invalid cursor');
  err.code = 'BAD_CURSOR';
  return err;
}

// entries: [{ id, score }] in Redis ZREVRANGEBYSCORE order (score desc, and for
// equal scores member id desc, because Redis orders equal scores lexicographically).
// Members of the tied group that were already served on earlier pages have
// id >= cursor.id, so they are dropped.
function dropServed(entries, cursor) {
  if (!cursor) return entries;
  const cursorScore = Number(cursor.score);
  return entries.filter((e) => !(Number(e.score) === cursorScore && e.id >= cursor.id));
}

module.exports = { hotScore, formatCursor, parseCursor, dropServed, GRAVITY };
