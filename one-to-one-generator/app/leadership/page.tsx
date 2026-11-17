'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Footer from '../Footer';

const BASE = '/chaptertools';

interface Status {
  email: string;
  csrf: string;
  rosterCount: number;
  rosterUpdated: string | null;
  historyRounds: number;
  audit: { at: string; email: string; added: number; removed: number; unchanged: number }[];
}
interface Preview { total: number; skipped: number; added: string[]; removed: string[]; unchanged: string[]; updated: string[]; check?: { name: string; reasons: string[] }[]; renamed?: { from: string; to: string }[] }

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#A61926]';
const btn = `inline-flex items-center px-4 py-2 rounded-lg font-bold text-sm bg-[#CF2030] text-white hover:bg-[#A61926] disabled:opacity-60 ${ring}`;
const btnGhost = `inline-flex items-center px-4 py-2 rounded-lg font-bold text-sm bg-white text-[#A61926] border border-[#A61926] hover:bg-red-50 ${ring}`;
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'never');

export default function LeadershipPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [inputKey, setInputKey] = useState(0);

  const load = useCallback(async () => {
    const r = await fetch(`${BASE}/api/leadership/status`, { cache: 'no-store' });
    setStatus(r.ok ? await r.json() : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    // Take the one-time token out of the address bar and history right away.
    if (t) window.history.replaceState(null, '', `${BASE}/leadership`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(t || '');
    load();
  }, [load]);

  async function post(path: string, body: unknown, csrf?: string) {
    const r = await fetch(`${BASE}/api/leadership/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': csrf } : {}) },
      body: JSON.stringify(body),
    });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  }

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await post('signin', { email });
    setMessage(r.data.message || r.data.error || 'Something went wrong.');
    setBusy(false);
  }
  async function useLink() {
    setBusy(true);
    const r = await post('verify', { token });
    setBusy(false);
    if (r.ok) { setToken(''); setMessage(''); await load(); } else setMessage(r.data.error || 'That link did not work.');
  }
  function clearFile() {
    setPreview(null);
    setCsv('');
    setFileName('');
    setInputKey((k) => k + 1);
  }
  async function readFile(f: File | undefined) {
    setPreview(null);
    setMessage('');
    setFileName(f ? f.name : '');
    if (!f) return;
    if (f.size > 200_000) { setMessage('That file is too large.'); clearFile(); return; }
    const text = await f.text();
    setCsv(text);
    setBusy(true);
    const r = await post('roster', { csv: text }, status?.csrf);
    setBusy(false);
    if (r.ok) setPreview(r.data); else setMessage(r.data.error || 'That file could not be read.');
  }
  async function confirm() {
    setBusy(true);
    const r = await post('roster', { csv, confirm: true }, status?.csrf);
    setBusy(false);
    if (r.ok) { clearFile(); setMessage(`Roster updated: ${r.data.total} members.`); await load(); }
    else setMessage(r.data.error || 'The update did not go through.');
  }
  async function signOut() {
    await post('signout', {}, status?.csrf);
    setStatus(null);
    setPreview(null);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 pb-16">
      <header className="bg-[#CF2030] text-white shadow-lg py-4 px-6 mb-8">
        <div className="max-w-3xl mx-auto">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-white">Chapter leadership</p>
          <h1 className="text-xl font-black tracking-tight">Roster update for the 1-to-1 match</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 grid gap-6">
        <p className="text-sm text-slate-700">
          This is an independent tool made by a member for anyone to use, because givers gain. It is not made or endorsed by BNI.
        </p>

        {loading ? (
          <p className="text-slate-700">Loading…</p>
        ) : status ? (
          <section className="bg-white rounded-xl shadow p-5 grid gap-4" aria-label="Roster">
            <p className="text-sm text-slate-700">
              Signed in as <strong>{status.email}</strong>. The roster has <strong>{status.rosterCount}</strong> members and was last updated{' '}
              <strong>{fmt(status.rosterUpdated)}</strong>.
            </p>
            <div>
              <label htmlFor="roster-file" className="block text-sm font-bold text-slate-900 mb-1">Upload the roster export (CSV)</label>
              <div className="flex flex-wrap items-center gap-3">
                <input key={inputKey} id="roster-file" type="file" accept=".csv,text/csv" onChange={(e) => readFile(e.target.files?.[0])} className="peer sr-only" />
                <label htmlFor="roster-file" className={`${btn} cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-[#A61926]`}>Choose roster file</label>
                <span className="text-sm text-slate-700 break-all" aria-live="polite">{fileName || 'No file chosen'}</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">Only the name and business columns are kept. Everything else in the file is ignored.</p>
            </div>
            {preview && (
              <div className="border border-slate-300 rounded-lg p-4 grid gap-2 text-sm" role="region" aria-label="Preview of the change">
                <p className="font-bold text-slate-900">Preview: {preview.total} members after this update</p>
                <p>Added {preview.added.length}, removed {preview.removed.length}, unchanged {preview.unchanged.length}{preview.skipped ? `, ${preview.skipped} rows skipped (blank or duplicate)` : ''}.</p>
                {preview.check && preview.check.length > 0 && (
                  <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-[#7F1D1D]" role="note">
                    <p className="font-bold">Check these rows before you replace the roster</p>
                    <ul className="list-disc pl-5">
                      {preview.check.map((c, i) => <li key={`${c.name}-${i}`}>{c.name}: {c.reasons.join(', ')}</li>)}
                    </ul>
                    <p className="text-xs mt-1">These are hints only. You can still replace the roster.</p>
                  </div>
                )}
                {preview.renamed && preview.renamed.length > 0 && (
                  <div>
                    <p className="font-bold text-slate-900">Names cleaned up (a title after a comma is dropped)</p>
                    <ul className="list-disc pl-5">
                      {preview.renamed.map((n, i) => <li key={`${n.from}-${i}`}>{n.from}: will be saved as <strong>{n.to}</strong></li>)}
                    </ul>
                  </div>
                )}
                {preview.added.length > 0 && <p><strong>Added:</strong> {preview.added.join(', ')}</p>}
                {preview.removed.length > 0 && <p><strong>Removed (their past pairings are deleted too):</strong> {preview.removed.join(', ')}</p>}
                <div className="flex gap-2 pt-1">
                  <button className={btn} onClick={confirm} disabled={busy}>Replace the roster</button>
                  <button className={btnGhost} onClick={clearFile}>Cancel</button>
                </div>
              </div>
            )}
            {status.audit.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-slate-900">Recent updates</h2>
                <ul className="text-sm text-slate-700 list-disc pl-5">
                  {status.audit.map((a) => (
                    <li key={a.at}>{fmt(a.at)}, {a.email}: {a.added} added, {a.removed} removed, {a.unchanged} unchanged</li>
                  ))}
                </ul>
              </div>
            )}
            <div><button className={btnGhost} onClick={signOut}>Sign out</button></div>
          </section>
        ) : token ? (
          <section className="bg-white rounded-xl shadow p-5 grid gap-3" aria-label="Finish signing in">
            <p className="text-sm text-slate-700">Your sign-in link is ready. It works once.</p>
            <div><button className={btn} onClick={useLink} disabled={busy}>Continue to the roster</button></div>
          </section>
        ) : (
          <section className="bg-white rounded-xl shadow p-5" aria-label="Sign in">
            <form onSubmit={requestLink} className="grid gap-3">
              <label htmlFor="leader-email" className="text-sm font-bold text-slate-900">Leadership email address</label>
              <input id="leader-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="border border-slate-400 rounded-lg px-3 py-2 text-sm" autoComplete="email" />
              <div><button className={btn} disabled={busy}>Email me a sign-in link</button></div>
            </form>
          </section>
        )}

        {message && <p role="status" className="text-sm font-semibold text-[#7F1D1D]">{message}</p>}

        <section className="bg-white rounded-xl shadow p-5 text-sm text-slate-700 grid gap-2" aria-label="Privacy">
          <h2 className="font-bold text-slate-900">What is stored, and for how long</h2>
          <ul className="list-disc pl-5 grid gap-1">
            <li>For each member: name and business only. Phone numbers, email addresses and every other column in the export are dropped before saving.</li>
            <li>The roster stays until leadership replaces it. A member left out of a new upload is removed, and their past pairings are deleted at the same time.</li>
            <li>The pairings from the last {status?.historyRounds ?? 4} rounds are kept, to avoid repeat matches. Older rounds are deleted.</li>
            <li>A record of each update keeps the leadership email, the date and the counts of members added, removed and unchanged, with no names. It is deleted after 12 months.</li>
            <li>Sign-in links last 15 minutes and work once. A signed-in session lasts 2 hours. Both are stored only as hashes, next to the leadership email address they belong to, and deleted when they expire.</li>
            <li>When the tool runs in test mode, its emails are saved as files for 7 days and then deleted.</li>
          </ul>
          <p>Only the leadership addresses set up for this tool can see the roster. The pairs go by email to the chapter address. To have someone removed, ask chapter leadership to upload a roster without them.</p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
