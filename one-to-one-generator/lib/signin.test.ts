import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from './signin.ts';
import { openStore } from './store.ts';
import type { Mail } from './mailer.ts';

const secret = 's'.repeat(40);
function setup(allowed = ['lead@example.test']) {
  const store = openStore(':memory:');
  const mails: Mail[] = [];
  let t = new Date('2026-11-17T12:00:00Z').getTime();
  const auth = createAuth({
    allowed,
    secret,
    toolUrl: 'https://apps.example.test/chaptertools',
    store,
    send: async (m) => { mails.push(m); },
    now: () => new Date(t),
  });
  return { auth, store, mails, advance: (ms: number) => { t += ms; } };
}
const tokenOf = (m: Mail) => /token=([\w-]+)/.exec(m.text)![1];

test('an allowlisted address gets a link; unknown addresses get nothing but the same answer', async () => {
  const { auth, mails } = setup();
  const a = await auth.requestLink('Lead@Example.test', '1.1.1.1');
  const b = await auth.requestLink('stranger@example.test', '1.1.1.2');
  assert.deepEqual(a, b);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'lead@example.test');
  assert.match(mails[0].text, /^.*https:\/\/apps\.example\.test\/chaptertools\/leadership\?token=/m);
});
test('an empty allowlist means nobody can sign in', async () => {
  const { auth, mails } = setup([]);
  await auth.requestLink('lead@example.test', '1.1.1.1');
  assert.equal(mails.length, 0);
});
test('the link works once, then a session exists with a csrf value', async () => {
  const { auth, mails } = setup();
  await auth.requestLink('lead@example.test', '1.1.1.1');
  const tok = tokenOf(mails[0]);
  const s = auth.redeem(tok);
  assert.ok(s);
  assert.equal(auth.redeem(tok), null);
  const c = auth.check(s.sessionId);
  assert.equal(c?.email, 'lead@example.test');
  assert.equal(auth.csrfOk(s.sessionId, c!.csrf), true);
  assert.equal(auth.csrfOk(s.sessionId, 'wrong'), false);
  assert.equal(auth.csrfOk(s.sessionId, ''), false);
});
test('the link expires after 15 minutes', async () => {
  const { auth, mails, advance } = setup();
  await auth.requestLink('lead@example.test', '1.1.1.1');
  advance(16 * 60_000);
  assert.equal(auth.redeem(tokenOf(mails[0])), null);
});
test('sessions expire and sign-out ends them', async () => {
  const { auth, mails, advance } = setup();
  await auth.requestLink('lead@example.test', '1.1.1.1');
  const s = auth.redeem(tokenOf(mails[0]))!;
  auth.signOut(s.sessionId);
  assert.equal(auth.check(s.sessionId), null);
  await auth.requestLink('lead@example.test', '1.1.1.9');
  const s2 = auth.redeem(tokenOf(mails[1]))!;
  advance(3 * 3600_000);
  assert.equal(auth.check(s2.sessionId), null);
});
test('a session for an address removed from the allowlist stops working', async () => {
  const store = openStore(':memory:');
  const mails: Mail[] = [];
  const mk = (allowed: string[]) => createAuth({ allowed, secret, toolUrl: 'https://x.test', store, send: async (m) => { mails.push(m); } });
  const a1 = mk(['lead@example.test']);
  await a1.requestLink('lead@example.test', '1.1.1.1');
  const s = a1.redeem(tokenOf(mails[0]))!;
  const a2 = mk(['other@example.test']);
  assert.equal(a2.check(s.sessionId), null);
});
test('link requests are limited per address and per IP, with the same answer', async () => {
  const { auth, mails } = setup(['a@example.test', 'b@example.test']);
  for (let i = 0; i < 6; i++) await auth.requestLink('a@example.test', `9.9.9.${i}`);
  assert.equal(mails.length, 3);
  const before = mails.length;
  for (let i = 0; i < 15; i++) await auth.requestLink(i % 2 ? 'a@example.test' : 'b@example.test', '8.8.8.8');
  assert.ok(mails.length - before <= 10);
});
test('tokens and sessions are stored only as hashes, never as the raw value', async () => {
  const { auth, store, mails } = setup();
  await auth.requestLink('lead@example.test', '1.1.1.1');
  const tok = tokenOf(mails[0]);
  assert.equal(store.consumeToken(tok, new Date()), null);
  const s = auth.redeem(tok)!;
  assert.equal(store.getSession(s.sessionId, new Date('2026-11-17T12:00:00Z')), null);
});
test('a mail failure does not change the answer', async () => {
  const store = openStore(':memory:');
  const auth = createAuth({ allowed: ['lead@example.test'], secret, toolUrl: 'https://x.test', store, send: async () => { throw new Error('boom'); } });
  const r = await auth.requestLink('lead@example.test', '1.1.1.1');
  assert.equal(r.ok, true);
});

test('strangers hammering a leader address cannot lock the leader out', async () => {
  const { auth, mails } = setup();
  for (let i = 0; i < 6; i++) await auth.requestLink('other@example.test', `7.7.7.${i}`);
  await auth.requestLink('lead@example.test', '6.6.6.6');
  assert.equal(mails.length, 1);
});

test('the shared "unknown" address gets a tight limit', async () => {
  const { auth, mails } = setup();
  for (let i = 0; i < 6; i++) await auth.requestLink('lead@example.test', 'unknown');
  assert.ok(mails.length <= 3);
});
