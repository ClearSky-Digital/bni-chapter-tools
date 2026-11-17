import { NextResponse } from 'next/server.js';
import { COOKIE, off, requireLeader, services } from '../../../../lib/server.ts';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const s = services();
  if (!s) return off();
  const who = requireLeader(req, s);
  if ('status' in who) return who;
  s.auth.signOut(who.sessionId);
  const res = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set(COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/chaptertools', maxAge: 0 });
  return res;
}
