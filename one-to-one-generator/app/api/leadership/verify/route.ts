import { NextResponse } from 'next/server.js';
import { createKeyedLimiter } from '../../../../lib/auth.ts';
import { clientIp, COOKIE, json, off, readJson, sameOrigin, services } from '../../../../lib/server.ts';

export const dynamic = 'force-dynamic';
const tries = createKeyedLimiter(20, 15 * 60_000);
const triesUnknown = createKeyedLimiter(5, 15 * 60_000); // callers without a readable address share one tight bucket

/** Trades a one-time link token for a session cookie. A POST, so mail scanners that open links cannot use up the token. */
export async function POST(req: Request) {
  const s = services();
  if (!s) return off();
  if (!sameOrigin(req)) return json({ error: 'Request refused.' }, 403);
  const ip = clientIp(req, s.config.trustedProxyHops);
  if (!(ip === 'unknown' ? triesUnknown('unknown') : tries(ip))) return json({ error: 'Too many tries. Please wait a few minutes.' }, 429);
  const body = await readJson(req);
  const session = typeof body?.token === 'string' ? s.auth.redeem(body.token) : null;
  if (!session) return json({ error: 'That link has expired or was already used. Request a new one.' }, 401);
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set(COOKIE, session.sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/chaptertools',
    expires: session.expires,
  });
  return res;
}
