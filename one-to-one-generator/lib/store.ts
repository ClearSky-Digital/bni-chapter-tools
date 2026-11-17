import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RosterMember } from './csv.ts';
import type { Pair, Round } from './match.ts';

export interface RosterDiff { added: string[]; removed: string[]; unchanged: string[]; updated: string[] }
export interface AuditLine { at: string; email: string; added: number; removed: number; unchanged: number }
export interface HistoryRound extends Round { id: number; at: string }

export function diffRoster(current: RosterMember[], next: RosterMember[]): RosterDiff {
  const cur = new Map(current.map((m) => [m.name, m.business]));
  const nxt = new Map(next.map((m) => [m.name, m.business]));
  return {
    added: [...nxt.keys()].filter((n) => !cur.has(n)),
    removed: [...cur.keys()].filter((n) => !nxt.has(n)),
    unchanged: [...nxt.keys()].filter((n) => cur.has(n)),
    updated: [...nxt.keys()].filter((n) => cur.has(n) && cur.get(n) !== nxt.get(n)),
  };
}

/** SQLite store: roster (name and business), recent match history, sign-in tokens and sessions (hashes only), and an audit log with counts only. */
export function openStore(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout = 5000');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS roster (name TEXT PRIMARY KEY, business TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rounds (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pairs (round_id INTEGER NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, email TEXT NOT NULL, added INTEGER NOT NULL, removed INTEGER NOT NULL, unchanged INTEGER NOT NULL);
  `);
  const tx = <T>(fn: () => T): T => {
    db.exec('BEGIN');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };
  const getRoster = (): RosterMember[] => db.prepare('SELECT name, business FROM roster ORDER BY name').all() as unknown as RosterMember[];

  return {
    close: () => db.close(),
    getMeta(k: string): string | null {
      const r = db.prepare('SELECT v FROM meta WHERE k = ?').get(k) as { v: string } | undefined;
      return r ? r.v : null;
    },
    /** Takes a named claim once; returns false if it is already held. Used so two overlapping cron calls cannot both send. */
    claim(k: string, v: string): boolean {
      return Number(db.prepare('INSERT OR IGNORE INTO meta (k, v) VALUES (?, ?)').run(k, v).changes) === 1;
    },
    release(k: string) {
      db.prepare('DELETE FROM meta WHERE k = ?').run(k);
    },
    setMeta(k: string, v: string) {
      db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, v);
    },
    getRoster,
    rosterUpdatedAt(): Date | null {
      const r = db.prepare("SELECT v FROM meta WHERE k = 'roster_updated'").get() as { v: string } | undefined;
      return r ? new Date(r.v) : null;
    },
    replaceRoster(next: RosterMember[], email: string, now: Date): RosterDiff {
      return tx(() => {
        const diff = diffRoster(getRoster(), next);
        db.exec('DELETE FROM roster');
        const ins = db.prepare('INSERT INTO roster (name, business) VALUES (?, ?)');
        for (const m of next) ins.run(m.name, m.business);
        const del = db.prepare('DELETE FROM pairs WHERE a = ? OR b = ?');
        for (const n of diff.removed) del.run(n, n);
        db.exec('DELETE FROM rounds WHERE id NOT IN (SELECT DISTINCT round_id FROM pairs)');
        db.prepare("INSERT INTO meta (k, v) VALUES ('roster_updated', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(now.toISOString());
        db.prepare('DELETE FROM audit WHERE at < ?').run(new Date(now.getTime() - 365 * 86_400_000).toISOString());
        db.prepare('INSERT INTO audit (at, email, added, removed, unchanged) VALUES (?, ?, ?, ?, ?)').run(now.toISOString(), email, diff.added.length, diff.removed.length, diff.unchanged.length);
        return diff;
      });
    },
    audit(): AuditLine[] {
      return db.prepare('SELECT at, email, added, removed, unchanged FROM audit ORDER BY id DESC LIMIT 50').all() as unknown as AuditLine[];
    },
    saveRound(pairs: Pair[], at: Date) {
      tx(() => {
        const id = Number(db.prepare('INSERT INTO rounds (at) VALUES (?)').run(at.toISOString()).lastInsertRowid);
        const ins = db.prepare('INSERT INTO pairs (round_id, a, b) VALUES (?, ?, ?)');
        for (const [a, b] of pairs) ins.run(id, a, b);
      });
    },
    getHistory(n: number): HistoryRound[] {
      const rounds = db.prepare('SELECT id, at FROM rounds ORDER BY at DESC, id DESC LIMIT ?').all(n) as unknown as { id: number; at: string }[];
      const q = db.prepare('SELECT a, b FROM pairs WHERE round_id = ? ORDER BY rowid');
      return rounds.map((r) => ({ ...r, pairs: (q.all(r.id) as unknown as { a: string; b: string }[]).map((p) => [p.a, p.b] as Pair) }));
    },
    pruneHistory(keep: number) {
      tx(() => {
        const keepIds = 'SELECT id FROM (SELECT id FROM rounds ORDER BY at DESC, id DESC LIMIT ?)';
        db.prepare(`DELETE FROM pairs WHERE round_id NOT IN (${keepIds})`).run(keep);
        db.prepare(`DELETE FROM rounds WHERE id NOT IN (${keepIds})`).run(keep);
      });
    },
    saveToken(hash: string, email: string, expires: Date) {
      db.prepare('DELETE FROM tokens WHERE expires < ?').run(new Date().toISOString());
      db.prepare('INSERT INTO tokens (hash, email, expires) VALUES (?, ?, ?)').run(hash, email, expires.toISOString());
    },
    /** Returns the email once, then forgets the token. */
    consumeToken(hash: string, now: Date): string | null {
      return tx(() => {
        const r = db.prepare('SELECT email, expires FROM tokens WHERE hash = ?').get(hash) as { email: string; expires: string } | undefined;
        if (!r) return null;
        db.prepare('DELETE FROM tokens WHERE hash = ?').run(hash);
        return r.expires >= now.toISOString() ? r.email : null;
      });
    },
    saveSession(hash: string, email: string, expires: Date) {
      db.prepare('DELETE FROM sessions WHERE expires < ?').run(new Date().toISOString());
      db.prepare('INSERT INTO sessions (hash, email, expires) VALUES (?, ?, ?)').run(hash, email, expires.toISOString());
    },
    getSession(hash: string, now: Date): string | null {
      const r = db.prepare('SELECT email, expires FROM sessions WHERE hash = ?').get(hash) as { email: string; expires: string } | undefined;
      return r && r.expires >= now.toISOString() ? r.email : null;
    },
    deleteSession(hash: string) {
      db.prepare('DELETE FROM sessions WHERE hash = ?').run(hash);
    },
    /** Sessions of an address that is no longer on the allowlist end at once. */
    endSessionsNotIn(allowed: string[]) {
      const rows = db.prepare('SELECT hash, email FROM sessions').all() as unknown as { hash: string; email: string }[];
      for (const r of rows) if (!allowed.includes(r.email)) db.prepare('DELETE FROM sessions WHERE hash = ?').run(r.hash);
    },
  };
}
export type Store = ReturnType<typeof openStore>;
