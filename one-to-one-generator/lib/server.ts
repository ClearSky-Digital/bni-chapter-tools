import { NextResponse } from 'next/server.js';
import { createAuth, type Auth } from './signin.ts';
import { loadConfig, type Config } from './config.ts';
import { sendMail, type Mail, type MailConfig } from './mailer.ts';
import { openStore, type Store } from './store.ts';

export const COOKIE = 'bni_session';
export const MAX_BODY = 300_000;

export interface Services { config: Config; store: Store; auth: Auth; send: (m: Mail) => Promise<{ mode: string }> }

let cached: Services | null = null;
let failed = false;

/** Builds config, store and sign-in once. Returns null (and logs setting names only) when the config is missing or invalid. */
export function services(): Services | null {
  if (cached) return cached;
  if (failed) return null;
  const r = loadConfig();
  if (!r.ok) {
    failed = true;
    console.error('Leadership tools are off: invalid settings:', r.errors.join('; '));
    return null;
  }
  const c = r.config;
  const store = openStore(`${c.stateDir}/bni.sqlite`);
  const mailCfg: MailConfig = { dryRun: c.dryRun, dryRunDir: c.dryRunDir, writeSecrets: c.devLocal, apiKey: c.resendApiKey, from: c.sender };
  const send = (m: Mail) => sendMail(m, mailCfg);
  const auth = createAuth({ allowed: c.leadershipEmails, secret: c.sessionSecret, toolUrl: c.toolUrl, store, send });
  cached = { config: c, store, auth, send };
  return cached;
}

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export const off = () => json({ error: 'Leadership tools are not set up.' }, 503);

/**
 * The visitor address, taken `hops` entries from the right of X-Forwarded-For (each trusted proxy appends one entry, so
 * entries further left can be forged by the caller). No header, or fewer entries than hops, gives the shared "unknown" bucket.
 * X-Real-IP and CF-Connecting-IP are not used.
 */
export function clientIp(req: Request, hops = 1): string {
  const parts = (req.headers.get('x-forwarded-for') || '').split(',').map((p) => p.trim());
  if (parts.length < hops) return 'unknown';
  return parts[parts.length - hops].slice(0, 64) || 'unknown';
}

/** Browsers send Origin on POSTs; when present it must be this site. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get('x-forwarded-host') || req.headers.get('host'));
  } catch {
    return false;
  }
}

export function cookieValue(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

/** Reads a small JSON body. Returns null when it is too large or not an object. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY || !req.body) return null;
  // Read in chunks and stop at the cap, so a body with no declared length cannot fill memory.
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Session plus same-origin plus CSRF check for a leadership POST. */
export function requireLeader(req: Request, s: Services): { email: string; sessionId: string; csrf: string } | NextResponse {
  const sessionId = cookieValue(req, COOKIE);
  const who = sessionId ? s.auth.check(sessionId) : null;
  if (!sessionId || !who) return json({ error: 'Please sign in.' }, 401);
  if (req.method !== 'GET') {
    if (!sameOrigin(req) || !s.auth.csrfOk(sessionId, req.headers.get('x-csrf-token'))) return json({ error: 'Request refused.' }, 403);
  }
  return { ...who, sessionId };
}

/** Test hook: forget the cached services so a test can change settings. */
export function resetServicesForTests() {
  cached?.store.close();
  cached = null;
  failed = false;
}
