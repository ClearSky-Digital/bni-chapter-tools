import { NextResponse } from 'next/server.js';
import { createLimiter, tokenMatches } from '../../../../lib/auth.ts';
import { runRound } from '../../../../lib/round.ts';
import { off, services } from '../../../../lib/server.ts';

export const dynamic = 'force-dynamic';

// Only failed sign-ins count, so guessing is slowed without letting strangers block the real cron.
const failedAttempt = createLimiter(10, 60_000);

/** Called by VPS cron every Tuesday. On a round day it emails the pairs (or a please-update note) to MATCH_TO. POST with `Authorization: Bearer $CRON_SECRET`. */
export async function POST(req: Request) {
  const s = services();
  if (!s) return off();
  if (!tokenMatches(req.headers.get('authorization'), s.config.cronSecret)) {
    if (!failedAttempt()) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const r = await runRound({ config: s.config, store: s.store, send: s.send });
    return NextResponse.json({ ok: true, ...r });
  } catch {
    return NextResponse.json({ ok: false, error: 'Send failed' }, { status: 502 });
  }
}

export function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
