import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sendMail } from './mailer.ts';

const msg = { to: 'a@example.test', subject: 'Subject', text: 'Body text' };

test('dry run writes the email to a file and calls nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bni-dry-'));
  let called = false;
  const r = await sendMail(msg, { dryRun: true, dryRunDir: dir, fetchFn: (async () => { called = true; return new Response('{}'); }) as typeof fetch });
  assert.equal(r.mode, 'dry-run');
  assert.equal(called, false);
  const files = readdirSync(dir);
  assert.equal(files.length, 1);
  assert.match(readFileSync(join(dir, files[0]), 'utf8'), /Body text/);
  rmSync(dir, { recursive: true });
});
test('live mode needs key, sender and recipient', async () => {
  await assert.rejects(sendMail(msg, { dryRun: false, apiKey: undefined, from: 'x@example.test' }), /not configured/);
});
test('live mode posts to Resend with a bearer key and surfaces errors without the key', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const ok = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response('{"id":"1"}', { status: 200 }); }) as unknown as typeof fetch;
  const r = await sendMail(msg, { dryRun: false, apiKey: 'KEY123', from: 'f@example.test', fetchFn: ok });
  assert.equal(r.mode, 'sent');
  assert.equal(seen!.url, 'https://api.resend.com/emails');
  assert.equal((seen!.init.headers as Record<string, string>).Authorization, 'Bearer KEY123');
  const bad = (async () => new Response('nope', { status: 422 })) as unknown as typeof fetch;
  await assert.rejects(sendMail(msg, { dryRun: false, apiKey: 'KEY123', from: 'f@example.test', fetchFn: bad }), (e: Error) => /422/.test(e.message) && !e.message.includes('KEY123'));
});

test('dry run never writes the body of a secret mail', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bni-dry-'));
  await sendMail({ ...msg, text: 'https://x.test/leadership?token=LIVE', secret: true }, { dryRun: true, dryRunDir: dir });
  const f = readdirSync(dir)[0];
  assert.ok(!readFileSync(join(dir, f), 'utf8').includes('LIVE'));
  rmSync(dir, { recursive: true });
});

test('dry run writes the live link only when writeSecrets is set', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bni-dry-'));
  const r = await sendMail({ ...msg, text: 'https://x.test/leadership?token=LIVE', secret: true }, { dryRun: true, dryRunDir: dir, writeSecrets: true });
  assert.ok(r.mode === 'dry-run' && readFileSync(r.file, 'utf8').includes('LIVE'));
  rmSync(dir, { recursive: true });
});

test('dry run writes an .html file next to the text file when the mail has html', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bni-dry-'));
  const r = await sendMail({ ...msg, html: '<p>hi</p>' }, { dryRun: true, dryRunDir: dir });
  assert.ok(r.mode === 'dry-run');
  assert.equal(readFileSync(r.file.replace(/\.txt$/, '.html'), 'utf8'), '<p>hi</p>');
  rmSync(dir, { recursive: true });
});
