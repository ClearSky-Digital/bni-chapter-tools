import type { Schedule } from './schedule.ts';

export interface Config {
  automationEnabled: boolean;
  dryRun: boolean;
  matchTo: string;
  leadershipEmails: string[];
  resendApiKey?: string;
  sender?: string;
  cronSecret: string;
  sessionSecret: string;
  stateDir: string;
  dryRunDir: string;
  schedule: Schedule;
  /** Proxies that append to X-Forwarded-For: the visitor is this many entries from the right. */
  trustedProxyHops: number;
  anchorDate: string;
  roundDays: number;
  historyRounds: number;
  staleDays: number;
  toolUrl: string;
  /** Local test switch: sign-in links are written to the dry-run folder and any day counts as a round day. Only allowed with DRY_RUN=true and a localhost TOOL_URL. */
  devLocal: boolean;
}
export type ConfigResult = { ok: true; config: Config } | { ok: false; errors: string[] };

const EMAIL = /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;
type Env = Record<string, string | undefined>;

/** Reads settings from the environment. Anything missing or invalid fails closed. Errors name the setting, never its value. */
export function loadConfig(env: Env = process.env): ConfigResult {
  const errors: string[] = [];
  const bool = (name: string, def: boolean) => {
    const v = env[name];
    if (v === undefined || v === '') return def;
    if (v === 'true') return true;
    if (v === 'false') return false;
    errors.push(`${name} must be true or false`);
    return def;
  };
  const int = (name: string, def: number, min: number, max: number) => {
    const v = env[name];
    if (v === undefined || v === '') return def;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      errors.push(`${name} must be a whole number from ${min} to ${max}`);
      return def;
    }
    return n;
  };
  const secret = (name: string, min: number) => {
    const v = env[name] ?? '';
    if (v.length < min) errors.push(`${name} must be set and at least ${min} characters`);
    return v;
  };

  const automationEnabled = bool('AUTOMATION_ENABLED', false);
  const dryRun = bool('DRY_RUN', true);
  const matchTo = (env.MATCH_TO || '').trim();
  if (!matchTo) errors.push('MATCH_TO is required');
  else if (!EMAIL.test(matchTo)) errors.push('MATCH_TO must be one email address');
  const leadershipEmails = (env.LEADERSHIP_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (leadershipEmails.some((e) => !EMAIL.test(e))) errors.push('LEADERSHIP_EMAILS must be a comma list of email addresses');
  const cronSecret = secret('CRON_SECRET', 16);
  const sessionSecret = secret('SESSION_SECRET', 32);
  const trustedProxyHops = int('TRUSTED_PROXY_HOPS', 1, 1, 5);
  const scheduleRaw = (env.BNI_SCHEDULE ?? 'biweekly').trim().toLowerCase();
  if (!['weekly', 'biweekly', 'monthly'].includes(scheduleRaw)) errors.push('BNI_SCHEDULE must be weekly, biweekly or monthly');
  const schedule = scheduleRaw as Schedule;
  const anchorDate = env.BNI_ANCHOR_DATE || '2026-11-17';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate) || Number.isNaN(Date.parse(`${anchorDate}T00:00:00Z`))) errors.push('BNI_ANCHOR_DATE must be YYYY-MM-DD');
  const roundDays = int('BNI_ROUND_DAYS', 14, 1, 90);
  const historyRounds = int('HISTORY_ROUNDS', 4, 1, 26);
  const staleDays = int('ROSTER_STALE_DAYS', 60, 1, 365);
  const toolUrl = (env.TOOL_URL || 'https://apps.cscloud.digital/chaptertools').replace(/\/+$/, '');
  if (!/^(https:\/\/[^\s]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[^\s]*)?)$/.test(toolUrl)) errors.push('TOOL_URL must be an https address (http only for localhost)');
  const sender = env.CONTACT_FORM_SENDER || undefined;
  const resendApiKey = env.RESEND_API_KEY || undefined;
  if (sender && !/^([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+|[^<>@]+ <[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>)$/.test(sender)) errors.push('CONTACT_FORM_SENDER must be an address or Name <address>');
  const devLocal = bool('BNI_DEV_LOCAL', false);
  if (devLocal && (!dryRun || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(toolUrl))) errors.push('BNI_DEV_LOCAL only works with DRY_RUN=true and a localhost TOOL_URL');
  if (!dryRun && (!resendApiKey || !sender)) errors.push('Live sending needs RESEND_API_KEY and CONTACT_FORM_SENDER');
  const stateDir = env.BNI_STATE_DIR || '.state';
  const dryRunDir = env.DRY_RUN_DIR || `${stateDir}/dry-run`;

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    config: { automationEnabled, dryRun, matchTo, leadershipEmails, resendApiKey, sender, cronSecret, sessionSecret, stateDir, dryRunDir, schedule, trustedProxyHops, anchorDate, roundDays, historyRounds, staleDays, toolUrl, devLocal },
  };
}
