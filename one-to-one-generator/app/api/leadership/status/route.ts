import { json, off, requireLeader, services } from '../../../../lib/server.ts';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const s = services();
  if (!s) return off();
  const who = requireLeader(req, s);
  if ('status' in who) return who;
  const updated = s.store.rosterUpdatedAt();
  return json({
    email: who.email,
    csrf: who.csrf,
    rosterCount: s.store.getRoster().length,
    rosterUpdated: updated ? updated.toISOString() : null,
    historyRounds: s.config.historyRounds,
    audit: s.store.audit().slice(0, 5),
  });
}
