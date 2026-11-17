import type { Config } from './config.ts';
import type { Mail } from './mailer.ts';
import { matchRound, roundPairs } from './match.ts';
import { matchEmailHtml, updateEmailHtml } from './emailHtml.ts';
import { isScheduledDay, pacificDate } from './schedule.ts';
import type { Store } from './store.ts';

export type RoundResult =
  | { action: 'skipped'; reason: string }
  | { action: 'match' | 'stale'; mode: string };

export interface RoundDeps {
  config: Config;
  store: Store;
  send: (m: Mail) => Promise<{ mode: string }>;
  now?: Date;
  rng?: () => number;
}

const longDate = (d: Date) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'long', day: 'numeric' }).format(d);

/** One scheduled run. Makes the match from the stored roster and emails it, or asks leadership to update a missing or old roster. */
export async function runRound(d: RoundDeps): Promise<RoundResult> {
  const { config: c, store } = d;
  const now = d.now ?? new Date();
  if (!c.automationEnabled) return { action: 'skipped', reason: 'automation off' };
  if (!c.devLocal && !isScheduledDay(now, c)) return { action: 'skipped', reason: 'not a round week' };
  const today = pacificDate(now);
  const claimKey = `sent:${today}`;
  if (!store.claim(claimKey, now.toISOString())) return { action: 'skipped', reason: 'already sent today' };

  const roster = store.getRoster();
  const updated = store.rosterUpdatedAt();
  const link = `${c.toolUrl}/leadership`;
  const ageDays = updated ? (now.getTime() - updated.getTime()) / 86_400_000 : Infinity;

  let mail: Mail;
  let action: 'match' | 'stale';
  let pairsToSave: [string, string][] = [];
  if (roster.length < 2 || ageDays > c.staleDays) {
    action = 'stale';
    const reason = roster.length < 2 ? 'the roster is empty' : `the roster was last updated ${longDate(updated!)}`;
    mail = {
      to: c.matchTo,
      subject: 'Please update the chapter roster',
      html: updateEmailHtml({ link, reason }),
      text: `This round's 1-to-1 match could not be made because the roster ${roster.length < 2 ? 'is empty' : `was last updated ${longDate(updated!)}`}.\n\nChapter leadership can update it here: ${link}\n\nThe match will be made on the next round day after the roster is updated.`,
    };
  } else {
    action = 'match';
    const biz = new Map(roster.map((m) => [m.name, m.business]));
    const label = (n: string) => (biz.get(n) ? `${n} (${biz.get(n)})` : n);
    const r = matchRound(roster.map((m) => m.name), store.getHistory(c.historyRounds), { rounds: c.historyRounds, rng: d.rng });
    pairsToSave = roundPairs(r);
    const lines = r.pairs.map(([a, b]) => `${label(a)} with ${label(b)}`);
    if (r.trio) lines.push(`${label(r.trio[0])}, ${label(r.trio[1])} and ${label(r.trio[2])} meet as a group of three`);
    const note = r.repeats ? `\n\n${r.repeats} of these pairs met in a recent round; the chapter is too small to avoid every repeat.` : '';
    mail = {
      to: c.matchTo,
      subject: `1-to-1 pairs for the round of ${longDate(now)}`,
      html: matchEmailHtml({
        dateLabel: longDate(now), rosterLabel: longDate(updated!), link, repeats: r.repeats,
        groups: [...r.pairs, ...(r.trio ? [r.trio] : [])].map((g) => g.map((n) => ({ name: n, business: biz.get(n) ?? '' }))),
      }),
      text: `Here are this round's 1-to-1 pairs:\n\n${lines.map((l) => `- ${l}`).join('\n')}${note}\n\nRoster last updated ${longDate(updated!)}. Leadership can update it here: ${link}`,
    };
  }

  let sent: { mode: string };
  try {
    sent = await d.send(mail);
  } catch (e) {
    store.release(claimKey);
    throw e;
  }
  if (sent.mode === 'sent') {
    if (action === 'match') {
      store.saveRound(pairsToSave, now);
      store.pruneHistory(c.historyRounds);
    }
  } else store.release(claimKey); // dry runs can repeat
  return { action, mode: sent.mode };
}
