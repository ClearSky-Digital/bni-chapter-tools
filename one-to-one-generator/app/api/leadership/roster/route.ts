import { createKeyedLimiter } from '../../../../lib/auth.ts';
import { checkRows, parseRosterCsv } from '../../../../lib/csv.ts';
import { json, off, readJson, requireLeader, services } from '../../../../lib/server.ts';
import { diffRoster } from '../../../../lib/store.ts';

export const dynamic = 'force-dynamic';
const uploads = createKeyedLimiter(30, 3600_000);

/** Leadership roster update. Without confirm it only previews the change; with confirm it replaces the roster. */
export async function POST(req: Request) {
  const s = services();
  if (!s) return off();
  const who = requireLeader(req, s);
  if ('status' in who) return who;
  if (!uploads(who.email)) return json({ error: 'Too many uploads. Please wait.' }, 429);
  const body = await readJson(req);
  if (!body || typeof body.csv !== 'string') return json({ error: 'That upload was not readable.' }, 400);
  const parsed = parseRosterCsv(body.csv, { maxBytes: 200_000, maxRows: 300 });
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const diff = diffRoster(s.store.getRoster(), parsed.members);
  if (body.confirm !== true) {
    return json({ ok: true, preview: true, total: parsed.members.length, skipped: parsed.skipped, check: checkRows(parsed.members, parsed.duplicates), renamed: parsed.renamed, ...diff });
  }
  const done = s.store.replaceRoster(parsed.members, who.email, new Date());
  return json({ ok: true, preview: false, total: parsed.members.length, added: done.added.length, removed: done.removed.length, unchanged: done.unchanged.length });
}
