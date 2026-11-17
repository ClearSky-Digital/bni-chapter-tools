import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

/** `secret` marks mail whose body holds a live link; dry run never writes that body to disk. */
export interface Mail { to: string; subject: string; text: string; html?: string; secret?: boolean }
export interface MailConfig { dryRun: boolean; writeSecrets?: boolean; dryRunDir?: string; apiKey?: string; from?: string; fetchFn?: typeof fetch }
export type MailResult = { mode: 'dry-run'; file: string } | { mode: 'sent' };


export async function sendMail(mail: Mail, cfg: MailConfig): Promise<MailResult> {
  if (cfg.dryRun) {
    const dir = cfg.dryRunDir || '.dry-run';
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `email-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}.txt`);
    // Dry-run files are kept 7 days, then removed on the next dry run.
    const cutoff = Date.now() - 7 * 86_400_000;
    for (const f of readdirSync(dir)) {
      try { if (f.startsWith('email-') && statSync(join(dir, f)).mtimeMs < cutoff) unlinkSync(join(dir, f)); } catch { /* already gone */ }
    }
    const body = mail.secret && !cfg.writeSecrets ? '[Sign-in link not saved in dry run. Turn DRY_RUN off to receive it.]' : mail.text;
    writeFileSync(file, `To: ${mail.to}\nSubject: ${mail.subject}\n\n${body}\n`);
    // An .html copy next to the text file, so the layout can be opened in a browser.
    if (mail.html && !mail.secret) writeFileSync(file.replace(/\.txt$/, '.html'), mail.html);
    return { mode: 'dry-run', file };
  }
  if (!cfg.apiKey || !cfg.from || !mail.to) throw new Error('Mail is not configured');
  const res = await (cfg.fetchFn ?? fetch)('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: cfg.from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) throw new Error(`Resend returned ${res.status}`);
  return { mode: 'sent' };
}
