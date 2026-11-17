import { createHash, timingSafeEqual } from 'node:crypto';

const sha = (s: string) => createHash('sha256').update(s).digest();

/** Constant-time check of an `Authorization: Bearer <secret>` header. Secrets under 16 chars never match. */
export function tokenMatches(header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header || !header.startsWith('Bearer ')) return false;
  return timingSafeEqual(sha(header.slice(7)), sha(secret));
}

/** Fixed-window limiter: returns true while under `max` calls per `windowMs`. */
export function createLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  let start = now();
  let count = 0;
  return () => {
    const t = now();
    if (t - start > windowMs) { start = t; count = 0; }
    return ++count <= max;
  };
}

/** Fixed-window limiter per key (address, IP). Old keys are swept so memory stays bounded. */
export function createKeyedLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  const seen = new Map<string, { start: number; count: number }>();
  return (key: string) => {
    const t = now();
    if (seen.size >= 5000) {
      for (const [k, v] of seen) if (t - v.start > windowMs) seen.delete(k);
      // Still full: drop the oldest keys so memory stays bounded.
      for (const k of seen.keys()) { if (seen.size < 5000) break; seen.delete(k); }
    }
    const e = seen.get(key);
    if (!e || t - e.start > windowMs) { seen.set(key, { start: t, count: 1 }); return true; }
    return ++e.count <= max;
  };
}
