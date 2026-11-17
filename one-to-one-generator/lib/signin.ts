import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createKeyedLimiter } from './auth.ts';
import type { Mail } from './mailer.ts';
import type { Store } from './store.ts';

const TOKEN_MS = 15 * 60_000;
export const SESSION_MS = 2 * 3600_000;

export interface AuthDeps {
  allowed: string[];
  secret: string;
  toolUrl: string;
  store: Store;
  send: (m: Mail) => Promise<unknown>;
  now?: () => Date;
}

/** Leadership sign-in: emailed one-time link, then a server-side session. Only hashes of tokens and session ids are stored. */
export function createAuth(d: AuthDeps) {
  const now = d.now ?? (() => new Date());
  const h = (label: string, v: string) => createHmac('sha256', d.secret).update(label + v).digest('hex');
  const perAddress = createKeyedLimiter(3, 3600_000, () => now().getTime());
  const perIp = createKeyedLimiter(10, 3600_000, () => now().getTime());
  const perUnknown = createKeyedLimiter(3, 3600_000, () => now().getTime()); // everyone without a readable address shares this
  const allowed = d.allowed.map((e) => e.toLowerCase());
  d.store.endSessionsNotIn(allowed);

  return {
    /** Always returns the same answer, so nobody can tell which addresses are on the list. */
    async requestLink(emailRaw: string, ip: string): Promise<{ ok: true }> {
      const email = emailRaw.trim().toLowerCase().slice(0, 254);
      const okIp = ip === 'unknown' ? perUnknown('ip:unknown') : perIp(`ip:${ip}`);
      const token = randomBytes(32).toString('base64url');
      const tokenHash = h('t', token); // same work whether or not the address is allowed
      // The per-address limit counts only real leadership addresses, so strangers cannot lock a leader out.
      if (okIp && allowed.includes(email) && perAddress(`a:${email}`)) {
        d.store.saveToken(tokenHash, email, new Date(now().getTime() + TOKEN_MS));
        const text = `Use this link to sign in and update the chapter roster. It works once and expires in 15 minutes:\n\n${d.toolUrl}/leadership?token=${token}\n\nIf you did not ask for it, ignore this email.`;
        // Not awaited, so response time does not reveal whether the address is on the list.
        d.send({ to: email, subject: 'Sign in to update the chapter roster', text, secret: true }).catch(() => undefined);
      }
      return { ok: true };
    },
    redeem(token: string): { sessionId: string; email: string; expires: Date } | null {
      if (!token || token.length > 200) return null;
      const email = d.store.consumeToken(h('t', token), now());
      if (!email || !allowed.includes(email)) return null;
      const sessionId = randomBytes(32).toString('base64url');
      const expires = new Date(now().getTime() + SESSION_MS);
      d.store.saveSession(h('s', sessionId), email, expires);
      return { sessionId, email, expires };
    },
    check(sessionId: string | undefined): { email: string; csrf: string } | null {
      if (!sessionId || sessionId.length > 100) return null;
      const email = d.store.getSession(h('s', sessionId), now());
      if (!email || !allowed.includes(email)) return null;
      return { email, csrf: h('c', sessionId) };
    },
    csrfOk(sessionId: string, csrf: string | null | undefined): boolean {
      if (!csrf) return false;
      const want = Buffer.from(h('c', sessionId));
      const got = Buffer.from(csrf);
      return got.length === want.length && timingSafeEqual(got, want);
    },
    signOut(sessionId: string) {
      d.store.deleteSession(h('s', sessionId));
    },
  };
}
export type Auth = ReturnType<typeof createAuth>;
