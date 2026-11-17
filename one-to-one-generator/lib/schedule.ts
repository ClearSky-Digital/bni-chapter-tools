const DAY = 86_400_000;

function pacificDay(d: Date): number {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return Date.parse(`${p}T00:00:00Z`);
}

/** True on the anchor date and every `everyDays` days after it, by the Pacific calendar date. */
export function isRoundDay(now: Date, anchor: string, everyDays = 14): boolean {
  const diff = Math.round((pacificDay(now) - Date.parse(`${anchor}T00:00:00Z`)) / DAY);
  return diff >= 0 && diff % everyDays === 0;
}

export type Schedule = 'weekly' | 'biweekly' | 'monthly';

/** Weekly: every Tuesday. Biweekly: the anchor date and every `roundDays` after it. Monthly: the first Tuesday of the month. All by the Pacific calendar date. */
export function isScheduledDay(now: Date, o: { schedule: Schedule; anchorDate: string; roundDays: number }): boolean {
  if (o.schedule === 'biweekly') return isRoundDay(now, o.anchorDate, o.roundDays);
  const day = new Date(pacificDay(now));
  if (day.getUTCDay() !== 2) return false;
  return o.schedule === 'weekly' ? true : day.getUTCDate() <= 7;
}

export const validAnchor = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** YYYY-MM-DD in Pacific time. */
export function pacificDate(d: Date): string {
  return new Date(pacificDay(d)).toISOString().slice(0, 10);
}
