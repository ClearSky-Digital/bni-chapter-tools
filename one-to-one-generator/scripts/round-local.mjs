// Local test helper: triggers the cron route of a locally running instance and prints where the email file landed.
// Reads CRON_SECRET, TOOL_URL and BNI_STATE_DIR from .env.local next to this app. Never prints the secret.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of readFileSync(join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = (env.TOOL_URL || 'http://localhost:3402/chaptertools').replace(/\/+$/, '');
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(url)) { console.error('Refusing: TOOL_URL is not a localhost address.'); process.exit(1); }
const dir = resolve(root, env.DRY_RUN_DIR || join(env.BNI_STATE_DIR || '.state', 'dry-run'));
const before = new Set(safeList(dir));
const res = await fetch(`${url}/api/cron/reminder`, { method: 'POST', headers: { Authorization: `Bearer ${env.CRON_SECRET}` } });
console.log(`Server answered ${res.status}:`, await res.text());
const fresh = safeList(dir).filter((f) => !before.has(f));
if (fresh.length) fresh.forEach((f) => console.log(`Email file: ${join(dir, f)}`));
else if (env.DRY_RUN === 'false') console.log('Live mode: no file is written. The email was sent to MATCH_TO if the answer above says action match.');
else console.log('No new email file (roster missing, or the run was skipped).');

function safeList(d) {
  try { return readdirSync(d).filter((f) => f.startsWith('email-')).sort((a, b) => statSync(join(d, a)).mtimeMs - statSync(join(d, b)).mtimeMs); } catch { return []; }
}
