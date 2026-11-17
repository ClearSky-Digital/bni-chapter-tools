export interface RosterMember { name: string; business: string }
export interface CsvLimits { maxBytes: number; maxRows: number }
export type CsvResult = { ok: true; members: RosterMember[]; skipped: number; duplicates: string[]; renamed: { from: string; to: string }[] } | { ok: false; error: string };

const MAX_CELL = 120;

/** Removes control characters and stops spreadsheet formulas by prefixing an apostrophe. Applied to every stored or exported cell. */
export function neutralizeCell(raw: string): string {
  let s = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s.slice(0, MAX_CELL);
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const NAME = ['full name', 'member name', 'name', 'member'];
const FIRST = ['first name', 'first'];
const LAST = ['last name', 'last', 'surname'];
const BUSINESS = ['company name', 'company', 'business name', 'business'];

/** Reads a roster export and keeps only name and business. Other columns are dropped and never returned. */
export function parseRosterCsv(input: string, limits: CsvLimits): CsvResult {
  if (Buffer.byteLength(input) > limits.maxBytes) return { ok: false, error: 'That file is too large.' };
  const text = input.replace(/^﻿/, '');
  if (!text.trim()) return { ok: false, error: 'That file is empty.' };
  const rows = parseRows(text);
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const find = (names: string[]) => head.findIndex((h) => names.includes(h));
  const nameCol = find(NAME);
  const firstCol = find(FIRST);
  const lastCol = find(LAST);
  const bizCol = find(BUSINESS);
  if (nameCol < 0 && firstCol < 0) return { ok: false, error: 'No member name column found. Expected a Name, Full Name, Member Name or First Name column.' };
  const data = rows.slice(1);
  if (data.length > limits.maxRows) return { ok: false, error: `That file has more than ${limits.maxRows} rows.` };

  const clean = (v: string | undefined) => neutralizeCell((v ?? '').replace(/^ +| +$/g, '').replace(/ {2,}/g, ' '));
  const seen = new Set<string>();
  const members: RosterMember[] = [];
  let skipped = 0;
  const duplicates: string[] = [];
  const renamed: { from: string; to: string }[] = [];
  for (const r of data) {
    // First plus last name is the more specific pair, so it wins over a generic Name column.
    let name = firstCol >= 0 ? [clean(r[firstCol]), lastCol >= 0 ? clean(r[lastCol]) : ''].filter(Boolean).join(' ') : clean(r[nameCol]);
    const trimmed = dropRoleTail(name);
    if (trimmed !== name) renamed.push({ from: name, to: trimmed });
    name = trimmed;
    const k = name.toLowerCase();
    if (!name) { skipped++; continue; }
    if (seen.has(k)) { skipped++; duplicates.push(name); continue; }
    seen.add(k);
    members.push({ name, business: bizCol >= 0 ? clean(r[bizCol]) : '' });
  }
  if (members.length === 0) return { ok: false, error: 'No members found in that file.' };
  return { ok: true, members, skipped, duplicates, renamed };
}

const ROLE_WORDS = new Set([
  'licensed', 'agent', 'broker', 'realtor', 'owner', 'president', 'vice', 'secretary', 'treasurer', 'director', 'manager', 'ceo', 'coo', 'cfo',
  'chair', 'chairman', 'coordinator', 'mentor', 'ambassador', 'member', 'guest', 'substitute', 'vacant', 'open', 'tbd', 'none', 'unknown', 'staff',
]);
const TAIL_WORDS = new Set([...ROLE_WORDS, 'real', 'estate', 'realtor', 'salesperson', 'sales', 'associate', 'and', '&']);

/** "Jesse Howes, Licensed agent" becomes "Jesse Howes" when everything after the first comma is a role word. Any other tail stays. */
export function dropRoleTail(name: string): string {
  const i = name.indexOf(',');
  if (i < 1) return name;
  const head = name.slice(0, i).trim();
  const words = name.slice(i + 1).toLowerCase().split(/[\s,.]+/).filter(Boolean);
  const headWords = head.toLowerCase().split(/[\s,.]+/).filter(Boolean);
  if (!words.length || !words.every((w) => TAIL_WORDS.has(w))) return name;
  if (!headWords.length || headWords.every((w) => ROLE_WORDS.has(w))) return name;
  return head;
}

export interface RowCheck { name: string; reasons: string[] }

/** Rows that look wrong, so leadership can look before replacing. A hint only: nothing is blocked or changed. */
export function checkRows(members: RosterMember[], duplicates: string[]): RowCheck[] {
  const out: RowCheck[] = [];
  for (const m of members) {
    const reasons: string[] = [];
    if (!m.business) reasons.push('no business');
    const words = m.name.toLowerCase().split(/[\s,.]+/).filter(Boolean);
    if (words.length < 2) reasons.push('only one word');
    if (m.name.includes(',')) reasons.push('has text after a comma (kept as written)');
    if (words.some((w) => ROLE_WORDS.has(w))) reasons.push('looks like a role or title');
    if (reasons.length) out.push({ name: m.name, reasons });
  }
  for (const d of duplicates) out.push({ name: d, reasons: ['duplicate name in the file (only the first is kept)'] });
  return out;
}
