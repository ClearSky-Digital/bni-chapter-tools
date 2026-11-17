import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore, diffRoster } from './store.ts';

const m = (...n: string[]) => n.map((name) => ({ name, business: `${name} Co` }));

test('diffRoster reports added, removed, unchanged and changed business', () => {
  const d = diffRoster([{ name: 'A', business: 'x' }, { name: 'B', business: 'y' }], [{ name: 'B', business: 'z' }, { name: 'C', business: 'w' }]);
  assert.deepEqual(d.added, ['C']);
  assert.deepEqual(d.removed, ['A']);
  assert.deepEqual(d.unchanged, ['B']);
  assert.deepEqual(d.updated, ['B']);
});
test('replace stores name and business, stamps the update, writes an audit line without names', () => {
  const s = openStore(':memory:');
  s.replaceRoster(m('Ada', 'Grace'), 'lead@example.test', new Date('2026-11-17T12:00:00Z'));
  assert.deepEqual(s.getRoster().map((r) => r.name), ['Ada', 'Grace']);
  assert.equal(s.rosterUpdatedAt()?.toISOString(), '2026-11-17T12:00:00.000Z');
  const a = s.audit();
  assert.equal(a.length, 1);
  assert.equal(a[0].email, 'lead@example.test');
  assert.deepEqual([a[0].added, a[0].removed, a[0].unchanged], [2, 0, 0]);
  assert.ok(!JSON.stringify(a).includes('Ada'));
});
test('removing a member purges their history pairs', () => {
  const s = openStore(':memory:');
  s.replaceRoster(m('A', 'B', 'C', 'D'), 'l@example.test', new Date());
  s.saveRound([['A', 'B'], ['C', 'D']], new Date());
  s.replaceRoster(m('A', 'C', 'D'), 'l@example.test', new Date());
  const h = s.getHistory(4);
  assert.deepEqual(h[0].pairs, [['C', 'D']]);
});
test('history is returned newest first, limited to N, and older rounds are pruned', () => {
  const s = openStore(':memory:');
  for (let i = 1; i <= 6; i++) s.saveRound([[`a${i}`, `b${i}`]], new Date(2026, 0, i));
  const h = s.getHistory(4);
  assert.equal(h.length, 4);
  assert.deepEqual(h[0].pairs, [['a6', 'b6']]);
  s.pruneHistory(4);
  assert.equal(s.getHistory(10).length, 4);
});
test('one-time tokens: single use, expiry, stored only as hashes', () => {
  const s = openStore(':memory:');
  const now = new Date('2026-11-17T12:00:00Z');
  s.saveToken('hash1', 'l@example.test', new Date(now.getTime() + 15 * 60_000));
  assert.equal(s.consumeToken('hash1', now), 'l@example.test');
  assert.equal(s.consumeToken('hash1', now), null);
  s.saveToken('hash2', 'l@example.test', new Date(now.getTime() + 15 * 60_000));
  assert.equal(s.consumeToken('hash2', new Date(now.getTime() + 16 * 60_000)), null);
  assert.equal(s.consumeToken('missing', now), null);
});
test('sessions look up by hash until they expire and can be deleted', () => {
  const s = openStore(':memory:');
  const now = new Date('2026-11-17T12:00:00Z');
  s.saveSession('sh', 'l@example.test', new Date(now.getTime() + 3600_000));
  assert.equal(s.getSession('sh', now), 'l@example.test');
  assert.equal(s.getSession('sh', new Date(now.getTime() + 3601_000)), null);
  s.saveSession('sh2', 'l@example.test', new Date(now.getTime() + 3600_000));
  s.deleteSession('sh2');
  assert.equal(s.getSession('sh2', now), null);
});
test('removing a leadership address ends its sessions', () => {
  const s = openStore(':memory:');
  const now = new Date();
  s.saveSession('x', 'gone@example.test', new Date(now.getTime() + 3600_000));
  s.endSessionsNotIn(['other@example.test']);
  assert.equal(s.getSession('x', now), null);
});

test('audit lines older than a year are dropped on the next update', () => {
  const s = openStore(':memory:');
  s.replaceRoster(m('A'), 'l@example.test', new Date('2025-01-01T00:00:00Z'));
  s.replaceRoster(m('A', 'B'), 'l@example.test', new Date('2026-11-17T00:00:00Z'));
  assert.equal(s.audit().length, 1);
});

test('a claim can be taken once and released', () => {
  const s = openStore(':memory:');
  assert.equal(s.claim('sent:2026-11-17', 'x'), true);
  assert.equal(s.claim('sent:2026-11-17', 'y'), false);
  s.release('sent:2026-11-17');
  assert.equal(s.claim('sent:2026-11-17', 'z'), true);
});
