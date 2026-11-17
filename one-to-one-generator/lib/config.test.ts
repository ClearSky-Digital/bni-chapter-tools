import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config.ts';

const base = { CRON_SECRET: 'c'.repeat(20), SESSION_SECRET: 's'.repeat(32), TOOL_URL: 'https://apps.example.test/chaptertools', MATCH_TO: 'chapter@example.test' };

test('defaults are closed: automation off, dry run on, nobody can upload', () => {
  const r = loadConfig({ ...base });
  assert.ok(r.ok);
  assert.equal(r.config.automationEnabled, false);
  assert.equal(r.config.dryRun, true);
  assert.equal(r.config.matchTo, 'chapter@example.test');
  assert.deepEqual(r.config.leadershipEmails, []);
  assert.equal(r.config.roundDays, 14);
  assert.equal(r.config.historyRounds, 4);
});
test('MATCH_TO is required: missing or blank fails closed', () => {
  const noTo: Record<string, string> = { ...base };
  delete noTo.MATCH_TO;
  assert.equal(loadConfig(noTo).ok, false);
  assert.equal(loadConfig({ ...noTo, MATCH_TO: '  ' }).ok, false);
});
test('leadership list is trimmed, lower-cased and validated', () => {
  const r = loadConfig({ ...base, LEADERSHIP_EMAILS: ' A@Example.test, b@example.test ,' });
  assert.ok(r.ok);
  assert.deepEqual(r.config.leadershipEmails, ['a@example.test', 'b@example.test']);
  const bad = loadConfig({ ...base, LEADERSHIP_EMAILS: 'a@example.test, nope' });
  assert.equal(bad.ok, false);
});
test('only true or false are accepted for switches', () => {
  assert.equal(loadConfig({ ...base, AUTOMATION_ENABLED: 'yes' }).ok, false);
  assert.equal(loadConfig({ ...base, DRY_RUN: 'FALSE' }).ok, false);
  const r = loadConfig({ ...base, AUTOMATION_ENABLED: 'true', DRY_RUN: 'false', RESEND_API_KEY: 'k', CONTACT_FORM_SENDER: 'f@example.test' });
  assert.ok(r.ok);
});
test('live sending requires key and sender', () => {
  assert.equal(loadConfig({ ...base, DRY_RUN: 'false' }).ok, false);
});
test('weak or missing secrets fail closed; errors never contain values', () => {
  const r = loadConfig({ CRON_SECRET: 'short', SESSION_SECRET: 'tiny' });
  assert.equal(r.ok, false);
  const text = JSON.stringify(r);
  assert.ok(!text.includes('short') && !text.includes('tiny'));
});
test('numbers and dates are validated', () => {
  assert.equal(loadConfig({ ...base, BNI_ROUND_DAYS: '0' }).ok, false);
  assert.equal(loadConfig({ ...base, HISTORY_ROUNDS: 'x' }).ok, false);
  assert.equal(loadConfig({ ...base, BNI_ANCHOR_DATE: '11/17/2026' }).ok, false);
  assert.equal(loadConfig({ ...base, MATCH_TO: 'nope' }).ok, false);
  assert.equal(loadConfig({ ...base, TOOL_URL: 'ftp://x' }).ok, false);
});

test('TOOL_URL must be https except localhost; sender must look like an address', () => {
  assert.equal(loadConfig({ ...base, TOOL_URL: 'http://apps.example.test' }).ok, false);
  assert.ok(loadConfig({ ...base, TOOL_URL: 'http://localhost:3000/chaptertools' }).ok);
  assert.equal(loadConfig({ ...base, CONTACT_FORM_SENDER: 'not an address' }).ok, false);
  assert.ok(loadConfig({ ...base, CONTACT_FORM_SENDER: 'Chapter Tools <tools@example.test>' }).ok);
});

test('local test switch is refused unless DRY_RUN is true and TOOL_URL is localhost', () => {
  const local = { ...base, TOOL_URL: 'http://localhost:3402/chaptertools' };
  const ok = loadConfig({ ...local, BNI_DEV_LOCAL: 'true', DRY_RUN: 'true' });
  assert.ok(ok.ok && ok.config.devLocal);
  assert.equal(loadConfig({ ...local }).ok && (loadConfig({ ...local }) as { config: { devLocal: boolean } }).config.devLocal, false);
  const live = loadConfig({ ...local, BNI_DEV_LOCAL: 'true', DRY_RUN: 'false', RESEND_API_KEY: 'k', CONTACT_FORM_SENDER: 'a@example.test' });
  assert.ok(!live.ok && live.errors.some((e) => e.includes('BNI_DEV_LOCAL')));
  const prodUrl = loadConfig({ ...base, BNI_DEV_LOCAL: 'true', DRY_RUN: 'true' });
  assert.ok(!prodUrl.ok && prodUrl.errors.some((e) => e.includes('BNI_DEV_LOCAL')));
});

test('BNI_SCHEDULE: default biweekly, three valid values, anything else fails closed', () => {
  const ok = (v?: string) => loadConfig({ ...base, ...(v === undefined ? {} : { BNI_SCHEDULE: v }) });
  const sched = (r: ReturnType<typeof loadConfig>) => (r.ok ? r.config.schedule : null);
  assert.equal(sched(ok()), 'biweekly');
  assert.equal(sched(ok('weekly')), 'weekly');
  assert.equal(sched(ok(' Monthly ')), 'monthly');
  assert.equal(sched(ok('biweekly')), 'biweekly');
  const bad = ok('daily');
  assert.ok(!bad.ok && bad.errors.some((e) => e.includes('BNI_SCHEDULE')));
  assert.ok(!ok('every other').ok);
});
