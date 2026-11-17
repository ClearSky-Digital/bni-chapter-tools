import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRound } from './round.ts';
import { openStore } from './store.ts';
import type { Config } from './config.ts';
import type { Mail } from './mailer.ts';

const cfg = (over: Partial<Config> = {}): Config => ({
  automationEnabled: true, dryRun: false, matchTo: 'chapter@example.test', leadershipEmails: ['l@example.test'],
  cronSecret: 'c'.repeat(20), sessionSecret: 's'.repeat(32), stateDir: '.state-test', dryRunDir: '.state-test/dry',
  schedule: 'biweekly', trustedProxyHops: 1, anchorDate: '2026-11-17', roundDays: 14, historyRounds: 4, staleDays: 60, toolUrl: 'https://apps.example.test/chaptertools', devLocal: false, ...over,
});
const members = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Member ${i + 1}`, business: `Business ${i + 1}` }));
let seed = 7;
const lcg = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const DAY = new Date('2026-11-17T16:00:00Z');

function setup(n = 8, over: Partial<Config> = {}) {
  const store = openStore(':memory:');
  if (n) store.replaceRoster(members(n), 'l@example.test', new Date('2026-11-10T12:00:00Z'));
  const mails: Mail[] = [];
  const run = (now = DAY, c = cfg(over)) => runRound({ config: c, store, send: async (m) => { mails.push(m); return { mode: c.dryRun ? ('dry-run' as const) : ('sent' as const), file: 'x' } as never; }, now, rng: lcg });
  return { store, mails, run };
}

test('automation off sends nothing', async () => {
  const { mails, run } = setup(8, { automationEnabled: false });
  assert.deepEqual(await run(), { action: 'skipped', reason: 'automation off' });
  assert.equal(mails.length, 0);
});
test('off weeks send nothing', async () => {
  const { mails, run } = setup();
  const r = await run(new Date('2026-11-24T16:00:00Z'));
  assert.equal(r.action, 'skipped');
  assert.equal(mails.length, 0);
});
test('a round day emails every member once to MATCH_TO, with the roster date and upload link', async () => {
  const { mails, run } = setup(8);
  const r = await run();
  assert.equal(r.action, 'match');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'chapter@example.test');
  for (let i = 1; i <= 8; i++) assert.equal(mails[0].text.split(`Member ${i} `).length, 2, `Member ${i} appears once`);
  assert.match(mails[0].text, /Roster last updated November 10, 2026/);
  assert.match(mails[0].text, /apps\.example\.test\/chaptertools\/leadership/);
});
test('real sends save history and are not repeated the same day', async () => {
  const { store, mails, run } = setup(8);
  await run();
  assert.equal(store.getHistory(4).length, 1);
  const again = await run();
  assert.deepEqual(again, { action: 'skipped', reason: 'already sent today' });
  assert.equal(mails.length, 1);
});
test('dry run writes the email but saves no history and does not block a real run', async () => {
  const { store, mails, run } = setup(8, { dryRun: true });
  await run();
  assert.equal(store.getHistory(4).length, 0);
  assert.equal(mails.length, 1);
  await run();
  assert.equal(mails.length, 2);
});
test('the next round avoids the last round pairs', async () => {
  const { store, mails, run } = setup(10);
  await run(DAY);
  const r = await run(new Date('2026-12-01T16:00:00Z'));
  assert.equal(r.action, 'match');
  assert.equal(store.getHistory(4).length, 2);
  assert.ok(!/repeat/i.test(mails[1].text));
});
test('an empty roster sends a please-update email, not a match', async () => {
  const { mails, run } = setup(0);
  const r = await run();
  assert.equal(r.action, 'stale');
  assert.match(mails[0].subject, /update the chapter roster/i);
  assert.match(mails[0].text, /leadership/);
});
test('a stale roster sends a please-update email', async () => {
  const { mails, run } = setup(8, { staleDays: 5 });
  const r = await run();
  assert.equal(r.action, 'stale');
  assert.equal(mails.length, 1);
  assert.ok(!/Member 1 /.test(mails[0].text));
});
test('a failed send leaves history and the daily marker untouched', async () => {
  const store = openStore(':memory:');
  store.replaceRoster(members(8), 'l@example.test', new Date('2026-11-10T12:00:00Z'));
  await assert.rejects(runRound({ config: cfg(), store, send: async () => { throw new Error('boom'); }, now: DAY }));
  assert.equal(store.getHistory(4).length, 0);
  assert.equal(store.getMeta('sent:2026-11-17'), null);
});
test('an odd roster puts one trio in the email', async () => {
  const { mails, run } = setup(7);
  await run();
  assert.match(mails[0].text, /group of three/i);
});

test('the match and please-update emails carry an html part with every pair and the roster date', async () => {
  const a = setup(8);
  await a.run();
  const html = a.mails[0].html!;
  assert.match(html, /Roster last updated November 10, 2026/);
  for (let i = 1; i <= 8; i++) assert.equal(html.split(`Member ${i}</strong>`).length, 2);
  const b = setup(0);
  await b.run();
  assert.match(b.mails[0].html!, /Please update the chapter roster/);
});
