import { clientIp, json, off, readJson, sameOrigin, services } from '../../../../lib/server.ts';

export const dynamic = 'force-dynamic';

/** Asks for a sign-in link. The answer is the same for every address. */
export async function POST(req: Request) {
  const s = services();
  if (!s) return off();
  if (!sameOrigin(req)) return json({ error: 'Request refused.' }, 403);
  const body = await readJson(req);
  const email = typeof body?.email === 'string' ? body.email : '';
  if (email) await s.auth.requestLink(email, clientIp(req, s.config.trustedProxyHops));
  return json({ ok: true, message: 'If that address is on the leadership list, a sign-in link is on its way.' });
}
