import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from './config.ts';
import { parseRosterCsv } from './csv.ts';
import { sendMail } from './mailer.ts';
import { runRound } from './round.ts';
import { createAuth } from './signin.ts';
import { openStore } from './store.ts';

// Made-up sample in the export shape. Phones and emails are present in the file and must never be stored or emailed.
const SAMPLE = [
  'First Name,Last Name,Company Name,Phone,Email',
  ...Array.from({ length: 9 }, (_, i) => `Person${i + 1},Sample${i + 1},Business ${i + 1},555-01${i}0,p${i + 1}@example.test`),
].join('\n');

test('dry run end to end: sign in, upload a sample, run a round, read the email file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bni-e2e-'));
  try {
    const c = loadConfig({
      CRON_SECRET: 'c'.repeat(20), SESSION_SECRET: 's'.repeat(40), AUTOMATION_ENABLED: 'true', DRY_RUN: 'true',
      LEADERSHIP_EMAILS: 'lead@example.test', MATCH_TO: 'chapter@example.test', BNI_STATE_DIR: dir, BNI_ANCHOR_DATE: '2026-11-17',
    });
    assert.ok(c.ok);
    const config = c.config;
    const store = openStore(join(dir, 'bni.sqlite'));
    const send = (m: Parameters<typeof sendMail>[0]) => sendMail(m, { dryRun: true, dryRunDir: config.dryRunDir });
    let linkText = '';
    const auth = createAuth({
      allowed: config.leadershipEmails, secret: config.sessionSecret, toolUrl: config.toolUrl, store,
      send: async (m) => { linkText = m.text; return send(m); },
    });

    // Leadership asks for a link. In dry run the file must not hold the live link.
    await auth.requestLink('lead@example.test', '127.0.0.1');
    await new Promise((r) => setTimeout(r, 50));
    const saved = readdirSync(config.dryRunDir).map((f) => readFileSync(join(config.dryRunDir, f), 'utf8'))[0];
    assert.ok(!/token=/.test(saved), 'dry-run file holds no live link');
    const token = /token=([\w-]+)/.exec(linkText)![1];
    const session = auth.redeem(token)!;
    assert.equal(auth.check(session.sessionId)?.email, 'lead@example.test');

    // Upload.
    const parsed = parseRosterCsv(SAMPLE, { maxBytes: 200_000, maxRows: 300 });
    assert.ok(parsed.ok);
    store.replaceRoster(parsed.members, 'lead@example.test', new Date('2026-11-16T12:00:00Z'));

    // Round day.
    const r = await runRound({ config, store, send, now: new Date('2026-11-17T16:00:00Z') });
    assert.deepEqual(r, { action: 'match', mode: 'dry-run' });
    const files = readdirSync(config.dryRunDir).filter((f) => f.startsWith('email-') && f.endsWith('.txt'));
    const body = files.map((f) => readFileSync(join(config.dryRunDir, f), 'utf8')).find((t) => t.includes('1-to-1 pairs'))!;
    assert.ok(readdirSync(config.dryRunDir).some((f) => f.endsWith('.html')), 'an html copy is written next to the text file');
    assert.match(body, /^To: chapter@example\.test/);
    assert.match(body, /group of three/);
    assert.match(body, /Roster last updated November 16, 2026/);
    assert.ok(!/555-01|@example\.test\n|p\d@example/.test(body.split('\n').slice(3).join('\n')), 'no phone or email addresses of members in the pairs');
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
