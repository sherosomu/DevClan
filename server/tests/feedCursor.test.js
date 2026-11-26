const test = require('node:test');
const assert = require('node:assert/strict');
const { hotScore, parseCursor, formatCursor, dropServed } = require('../lib/feedCursor');

test('hotScore decays with age and rewards net votes', () => {
  const now = Date.parse('2026-01-02T00:00:00Z');
  const fresh = hotScore(10, '2026-01-01T23:00:00Z', now); // 1h old
  const old = hotScore(10, '2026-01-01T00:00:00Z', now);   // 24h old
  assert.ok(fresh > old);
  assert.ok(hotScore(20, '2026-01-01T23:00:00Z', now) > fresh);
  assert.ok(hotScore(-5, '2026-01-01T23:00:00Z', now) < 0);
});

test('parseCursor: first page, valid, and invalid cursors', () => {
  assert.equal(parseCursor(undefined), null);
  assert.equal(parseCursor('+inf'), null);
  assert.deepEqual(parseCursor('3|abc'), { score: '3', id: 'abc' });
  assert.deepEqual(parseCursor(formatCursor('1.5e-05', 'x-y')), { score: '1.5e-05', id: 'x-y' });
  for (const bad of ['garbage', '|abc', 'nan|abc', '3|']) {
    assert.throws(() => parseCursor(bad), { code: 'BAD_CURSOR' });
  }
});

// Simulates what Redis returns for ZREVRANGEBYSCORE: score desc, ties by id desc.
function redisOrder(items) {
  return [...items].sort((a, b) => b.score - a.score || (a.id < b.id ? 1 : -1));
}

test('paging through tied scores never skips or repeats a post', () => {
  const items = [
    { id: 'a', score: 5 }, { id: 'b', score: 3 }, { id: 'c', score: 3 }, { id: 'd', score: 3 },
    { id: 'e', score: 3 }, { id: 'f', score: 1 }, { id: 'g', score: 1 },
  ];
  const ordered = redisOrder(items);
  const pageSize = 2;
  const seen = [];
  let cursor = null;

  for (let guard = 0; guard < 20; guard++) {
    const parsed = cursor ? parseCursor(cursor) : null;
    const maxScore = parsed ? Number(parsed.score) : Infinity;
    const ties = parsed ? ordered.filter((e) => e.score === maxScore).length : 0;
    // ZREVRANGEBYSCORE max(inclusive) -inf LIMIT 0 (pageSize + ties)
    const raw = ordered.filter((e) => e.score <= maxScore).slice(0, pageSize + ties)
      .map((e) => ({ id: e.id, score: String(e.score) }));
    const page = dropServed(raw, parsed).slice(0, pageSize);
    if (page.length === 0) break;
    seen.push(...page.map((e) => e.id));
    const last = page[page.length - 1];
    cursor = page.length === pageSize ? formatCursor(last.score, last.id) : null;
    if (!cursor) break;
  }

  assert.deepEqual(seen, ordered.map((e) => e.id)); // every post exactly once, in order
});

test('old exclusive-score cursor WOULD have skipped tied posts (regression guard)', () => {
  const ordered = redisOrder([
    { id: 'a', score: 3 }, { id: 'b', score: 3 }, { id: 'c', score: 3 },
  ]);
  const page1 = ordered.slice(0, 1);                 // serves 'c'
  const naiveNext = ordered.filter((e) => e.score < 3); // "(3" exclusive bound
  assert.equal(page1.length + naiveNext.length, 1);  // 'a' and 'b' lost
});
