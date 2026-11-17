import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { POST as cronPost, GET as cronGet } from '../app/api/cron/reminder/route.ts';
import { POST as signinPost } from '../app/api/leadership/signin/route.ts';
import { POST as verifyPost } from '../app/api/leadership/verify/route.ts';
import { GET as statusGet } from '../app/api/leadership/status/route.ts';
import { POST as rosterPost } from '../app/api/leadership/roster/route.ts';
import { resetServicesForTests, services } from './server.ts';
import { pacificDate } from './schedule.ts';

// Handlers are called directly with Request objects. Mail goes through a mocked fetch, so nothing real is ever sent.
const realFetch = globalThis.fetch;
let sent: { url: string; body: { to: string[]; subject: string; text: string } }[] = [];
let dir = '';
let ipN = 0;
const CRON = 'cron-secret-0123456789';
const BASE = 'http://localhost/chaptertools/api';
const ip = () => `10.0.${Math.floor(++ipN / 250)}.${ipN % 250}`;
const SAMPLE = 'Name,Company\nAda Example,Example Engines\nGrace Sample,Sample Compilers\nLin Made-Up,Made-Up Co\nSam Pretend,Pretend LLC\n';

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'bni-handlers-'));
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response('{"id":"mock"}', { status: 200 });
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  resetServicesForTests();
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  sent = [];
  resetServicesForTests();
  rmSync(dir, { recursive: true, force: true });
  Object.assign(process.env, {
    AUTOMATION_ENABLED: 'true', DRY_RUN: 'false', RESEND_API_KEY: 'test-key-not-real', CONTACT_FORM_SENDER: 'Tools <tools@example.test>',
    CRON_SECRET: CRON, SESSION_SECRET: 's'.repeat(40), LEADERSHIP_EMAILS: 'lead@example.test', MATCH_TO: 'chapter@example.test',
    BNI_STATE_DIR: dir, TOOL_URL: 'https://apps.example.test/chaptertools', BNI_ANCHOR_DATE: pacificDate(new Date()),
  });
  delete process.env.DRY_RUN_DIR;
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${BASE}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip(), ...headers }, body: JSON.stringify(body) });
const cronReq = (token?: string) => new Request(`${BASE}/cron/reminder`, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} });

async function signIn() {
  const s = services()!;
  const r = await signinPost(post('leadership/signin', { email: 'lead@example.test' }));
  assert.equal(r.status, 200);
  await new Promise((res) => setImmediate(res));
  const text = sent.at(-1)!.body.text;
  const token = /token=([\w-]+)/.exec(text)![1];
  const v = await verifyPost(post('leadership/verify', { token }));
  assert.equal(v.status, 200);
  const cookie = v.headers.get('set-cookie')!;
  const cookieHeader = cookie.split(';')[0];
  const st = await statusGet(new Request(`${BASE}/leadership/status`, { headers: { cookie: cookieHeader } }));
  const { csrf } = await st.json();
  return { s, cookie, cookieHeader, csrf, token };
}

// ---- cron ----
test('cron: no token or a wrong token is refused, GET is 404, and nothing is sent', async () => {
  assert.equal((await cronPost(cronReq())).status, 404);
  assert.equal((await cronPost(cronReq('wrong-token-0123456789'))).status, 404);
  assert.equal((await cronGet()).status, 404);
  assert.equal(sent.length, 0);
});
test('cron: an off week skips and sends nothing', async () => {
  process.env.BNI_ANCHOR_DATE = pacificDate(new Date(Date.now() - 7 * 86_400_000));
  resetServicesForTests();
  const r = await cronPost(cronReq(CRON));
  assert.deepEqual(await r.json(), { ok: true, action: 'skipped', reason: 'not a round week' });
  assert.equal(sent.length, 0);
});
test('cron: with automation off nothing is sent', async () => {
  process.env.AUTOMATION_ENABLED = 'false';
  resetServicesForTests();
  const r = await cronPost(cronReq(CRON));
  assert.equal((await r.json()).reason, 'automation off');
  assert.equal(sent.length, 0);
});
test('cron: a round day sends once to MATCH_TO and a second call the same day does not send', async () => {
  const s = services()!;
  s.store.replaceRoster(
    ['Ada', 'Grace', 'Lin', 'Sam'].map((n) => ({ name: `${n} Example`, business: `${n} Co` })),
    'lead@example.test',
    new Date(),
  );
  const first = await (await cronPost(cronReq(CRON))).json();
  assert.equal(first.action, 'match');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://api.resend.com/emails');
  assert.deepEqual(sent[0].body.to, ['chapter@example.test']);
  const second = await (await cronPost(cronReq(CRON))).json();
  assert.equal(second.reason, 'already sent today');
  assert.equal(sent.length, 1);
});
test('cron: bad settings fail closed with 503 and send nothing', async () => {
  process.env.CRON_SECRET = 'short';
  resetServicesForTests();
  assert.equal((await cronPost(cronReq('short'))).status, 503);
  assert.equal(sent.length, 0);
});

// ---- link request ----
test('link request: unknown and allowlisted addresses get identical responses; only the allowlisted one gets mail', async () => {
  const a = await signinPost(post('leadership/signin', { email: 'lead@example.test' }));
  const b = await signinPost(post('leadership/signin', { email: 'stranger@example.test' }));
  assert.equal(a.status, b.status);
  assert.equal(await a.text(), await b.text());
  await new Promise((res) => setImmediate(res));
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].body.to, ['lead@example.test']);
});
test('link request: an empty allowlist means nobody gets mail', async () => {
  process.env.LEADERSHIP_EMAILS = '';
  resetServicesForTests();
  const r = await signinPost(post('leadership/signin', { email: 'lead@example.test' }));
  assert.equal(r.status, 200);
  await new Promise((res) => setImmediate(res));
  assert.equal(sent.length, 0);
});
test('link request: limits apply per address and per IP, with the same response each time', async () => {
  const same = '172.16.0.9';
  const bodies = new Set<string>();
  for (let i = 0; i < 5; i++) {
    const r = await signinPost(post('leadership/signin', { email: 'lead@example.test' }, { 'x-forwarded-for': `1.1.1.${i}` }));
    bodies.add(await r.text());
  }
  await new Promise((res) => setImmediate(res));
  assert.equal(bodies.size, 1);
  assert.equal(sent.length, 3, 'per-address cap of 3 per hour');
  sent = [];
  resetServicesForTests();
  for (let i = 0; i < 14; i++) await signinPost(post('leadership/signin', { email: `x${i}@example.test` }, { 'x-forwarded-for': same }));
  const ok = await signinPost(post('leadership/signin', { email: 'lead@example.test' }, { 'x-forwarded-for': same }));
  assert.equal(ok.status, 200);
  await new Promise((res) => setImmediate(res));
  assert.equal(sent.length, 0, 'per-IP cap reached, so even the leader address gets no mail from that IP');
});
test('link request: a foreign Origin is refused', async () => {
  const r = await signinPost(post('leadership/signin', { email: 'lead@example.test' }, { origin: 'https://evil.test', host: 'apps.example.test' }));
  assert.equal(r.status, 403);
});

// ---- token consume ----
test('token: works once, then a reused token fails', async () => {
  const { token } = await signIn();
  const again = await verifyPost(post('leadership/verify', { token }));
  assert.equal(again.status, 401);
});
test('token: an expired token fails', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  await signinPost(post('leadership/signin', { email: 'lead@example.test' }));
  await new Promise((res) => setImmediate(res));
  const token = /token=([\w-]+)/.exec(sent.at(-1)!.body.text)![1];
  t.mock.timers.tick(16 * 60_000);
  const r = await verifyPost(post('leadership/verify', { token }));
  assert.equal(r.status, 401);
});
test('token: a made-up token and a missing token fail', async () => {
  assert.equal((await verifyPost(post('leadership/verify', { token: 'nope' }))).status, 401);
  assert.equal((await verifyPost(post('leadership/verify', {}))).status, 401);
});
test('token: the session cookie is httpOnly, Secure, SameSite=Lax and scoped to the tool path', async () => {
  const { cookie } = await signIn();
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=lax/i);
  assert.match(cookie, /Path=\/chaptertools/i);
});

// ---- upload ----
test('upload: no session is refused, and a session without a CSRF token is refused', async () => {
  const none = await rosterPost(post('leadership/roster', { csv: SAMPLE }));
  assert.equal(none.status, 401);
  const { cookieHeader } = await signIn();
  const noCsrf = await rosterPost(post('leadership/roster', { csv: SAMPLE, confirm: true }, { cookie: cookieHeader }));
  assert.equal(noCsrf.status, 403);
  const badCsrf = await rosterPost(post('leadership/roster', { csv: SAMPLE, confirm: true }, { cookie: cookieHeader, 'x-csrf-token': 'wrong' }));
  assert.equal(badCsrf.status, 403);
  assert.equal(services()!.store.getRoster().length, 0);
});
test('upload: a foreign Origin is refused even with a valid session and CSRF', async () => {
  const { cookieHeader, csrf } = await signIn();
  const r = await rosterPost(post('leadership/roster', { csv: SAMPLE, confirm: true }, { cookie: cookieHeader, 'x-csrf-token': csrf, origin: 'https://evil.test' }));
  assert.equal(r.status, 403);
  assert.equal(services()!.store.getRoster().length, 0);
});
test('upload: an oversize body is refused and writes nothing', async () => {
  const { cookieHeader, csrf } = await signIn();
  const big = `Name\n${'x'.repeat(400_000)}`;
  const r = await rosterPost(post('leadership/roster', { csv: big, confirm: true }, { cookie: cookieHeader, 'x-csrf-token': csrf }));
  assert.equal(r.status, 400);
  const tooMany = `Name\n${Array.from({ length: 400 }, (_, i) => `P${i}`).join('\n')}`;
  const r2 = await rosterPost(post('leadership/roster', { csv: tooMany, confirm: true }, { cookie: cookieHeader, 'x-csrf-token': csrf }));
  assert.equal(r2.status, 400);
  assert.equal(services()!.store.getRoster().length, 0);
});
test('upload: the preview does not write; confirm writes and logs counts only', async () => {
  const { s, cookieHeader, csrf } = await signIn();
  const h = { cookie: cookieHeader, 'x-csrf-token': csrf };
  const preview = await (await rosterPost(post('leadership/roster', { csv: SAMPLE }, h))).json();
  assert.equal(preview.preview, true);
  assert.equal(preview.added.length, 4);
  assert.equal(s.store.getRoster().length, 0);
  assert.equal(s.store.audit().length, 0);
  const done = await (await rosterPost(post('leadership/roster', { csv: SAMPLE, confirm: true }, h))).json();
  assert.equal(done.added, 4);
  assert.equal(s.store.getRoster().length, 4);
  assert.deepEqual(Object.keys(s.store.audit()[0]).sort(), ['added', 'at', 'email', 'removed', 'unchanged']);
});
test('upload: only allowlisted sign-in can reach it after the address is removed', async () => {
  const { cookieHeader, csrf } = await signIn();
  process.env.LEADERSHIP_EMAILS = 'other@example.test';
  resetServicesForTests();
  const r = await rosterPost(post('leadership/roster', { csv: SAMPLE }, { cookie: cookieHeader, 'x-csrf-token': csrf }));
  assert.equal(r.status, 401);
});

// Last, because it uses up the cron route's failed-attempt allowance.
test('cron: repeated wrong tokens are rate limited', async () => {
  const codes: number[] = [];
  for (let i = 0; i < 12; i++) codes.push((await cronPost(cronReq('guess-0123456789abcdef'))).status);
  assert.ok(codes.includes(429));
  assert.equal(sent.length, 0);
});

// ---- local test switch ----
test('local switch: sign-in link lands in the dry-run folder and any day is a round day', async () => {
  Object.assign(process.env, { DRY_RUN: 'true', BNI_DEV_LOCAL: 'true', TOOL_URL: 'http://localhost:3402/chaptertools', BNI_ANCHOR_DATE: pacificDate(new Date(Date.now() - 7 * 86_400_000)) });
  resetServicesForTests();
  try {
    await signinPost(post('leadership/signin', { email: 'lead@example.test' }));
    await new Promise((res) => setTimeout(res, 50));
    const { readdirSync, readFileSync } = await import('node:fs');
    const d = join(dir, 'dry-run');
    assert.ok(readdirSync(d).map((f) => readFileSync(join(d, f), 'utf8')).some((t) => /token=/.test(t)));
    const r = await (await cronPost(cronReq(CRON))).json();
    assert.notEqual(r.reason, 'not a round week');
    assert.equal(sent.length, 0, 'nothing goes to the real mail API');
  } finally { delete process.env.BNI_DEV_LOCAL; }
});
test('local switch: off without the flag (production-style settings), so the link is not written and off weeks skip', async () => {
  Object.assign(process.env, { DRY_RUN: 'true', TOOL_URL: 'http://localhost:3402/chaptertools', BNI_ANCHOR_DATE: pacificDate(new Date(Date.now() - 7 * 86_400_000)) });
  delete process.env.BNI_DEV_LOCAL;
  resetServicesForTests();
  await signinPost(post('leadership/signin', { email: 'lead@example.test' }));
  await new Promise((res) => setTimeout(res, 50));
  const { readdirSync, readFileSync } = await import('node:fs');
  const d = join(dir, 'dry-run');
  assert.ok(!readdirSync(d).map((f) => readFileSync(join(d, f), 'utf8')).some((t) => /token=/.test(t)));
  assert.equal((await (await cronPost(cronReq(CRON))).json()).reason, 'not a round week');
});
test('local switch: with DRY_RUN=false the services refuse to start', async () => {
  Object.assign(process.env, { DRY_RUN: 'false', BNI_DEV_LOCAL: 'true', TOOL_URL: 'http://localhost:3402/chaptertools' });
  resetServicesForTests();
  try { assert.equal((await cronPost(cronReq(CRON))).status, 503); assert.equal(sent.length, 0); } finally { delete process.env.BNI_DEV_LOCAL; }
});

test('upload: the preview lists rows to check, and replace still works', async () => {
  const { s, cookieHeader, csrf } = await signIn();
  const h = { cookie: cookieHeader, 'x-csrf-token': csrf };
  const csv = 'Name,Company\nAda Example,Example Engines\nLicensed agent,Realty Co\nGrace Sample,\n';
  const preview = await (await rosterPost(post('leadership/roster', { csv }, h))).json();
  assert.deepEqual(preview.check.map((c: { name: string }) => c.name).sort(), ['Grace Sample', 'Licensed agent']);
  const done = await rosterPost(post('leadership/roster', { csv, confirm: true }, h));
  assert.equal(done.status, 200);
  assert.equal(s.store.getRoster().length, 3);
});

test('upload: a cleaned name is saved, shown as renamed, and a re-upload shows no change', async () => {
  const { s, cookieHeader, csrf } = await signIn();
  const h = { cookie: cookieHeader, 'x-csrf-token': csrf };
  const csv = 'Name,Company\nAda Example,Example Engines\n"Jesse Sample, Licensed agent",Sample Realty\n';
  const preview = await (await rosterPost(post('leadership/roster', { csv }, h))).json();
  assert.deepEqual(preview.renamed, [{ from: 'Jesse Sample, Licensed agent', to: 'Jesse Sample' }]);
  assert.ok(preview.added.includes('Jesse Sample'));
  await rosterPost(post('leadership/roster', { csv, confirm: true }, h));
  assert.deepEqual(s.store.getRoster().map((m) => m.name).sort(), ['Ada Example', 'Jesse Sample']);
  const again = await (await rosterPost(post('leadership/roster', { csv }, h))).json();
  assert.equal(again.added.length + again.removed.length, 0);
  assert.equal(again.unchanged.length, 2);
});

test('cron: BNI_SCHEDULE decides the week (monthly skips a non-first Tuesday; an unknown value is refused)', async () => {
  const day = new Date('2026-11-17T16:00:00Z'); // the third Tuesday
  const orig = Date.now;
  Date.now = () => day.getTime();
  try {
    process.env.BNI_SCHEDULE = 'monthly';
    resetServicesForTests();
    assert.equal((await (await cronPost(cronReq(CRON))).json()).reason, 'not a round week');
    process.env.BNI_SCHEDULE = 'daily';
    resetServicesForTests();
    assert.equal((await cronPost(cronReq(CRON))).status, 503);
  } finally { Date.now = orig; delete process.env.BNI_SCHEDULE; }
});

test('link request: visitors behind one proxy edge get separate buckets when hops=2', async () => {
  process.env.TRUSTED_PROXY_HOPS = '2';
  resetServicesForTests();
  try {
    for (let i = 0; i < 12; i++) await signinPost(post('leadership/signin', { email: `x${i}@example.test` }, { 'x-forwarded-for': `198.51.100.7, 203.0.113.9` }));
    await new Promise((res) => setImmediate(res));
    sent = [];
    await signinPost(post('leadership/signin', { email: 'lead@example.test' }, { 'x-forwarded-for': '198.51.100.8, 203.0.113.9' }));
    await new Promise((res) => setImmediate(res));
    assert.equal(sent.length, 1, 'a second visitor behind the same edge is not blocked by the first');
    sent = [];
    await signinPost(post('leadership/signin', { email: 'lead@example.test' }, { 'x-forwarded-for': '198.51.100.7, 203.0.113.9' }));
    await new Promise((res) => setImmediate(res));
    assert.equal(sent.length, 0, 'the visitor who hit the limit stays limited');
  } finally { delete process.env.TRUSTED_PROXY_HOPS; }
});
