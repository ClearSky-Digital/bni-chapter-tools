// HTML versions of the round emails. Tables for layout and inline styles only, so Gmail and Outlook render them. No images.
export interface Person { name: string; business: string }

const RED = '#CF2030';
const DARK = '#0f172a';
const SLATE = '#475569';
const LINE = '#e2e8f0';
const FONT = 'font-family:Arial,Helvetica,sans-serif;';
const NOT_OFFICIAL = 'This is an independent tool made by a member for anyone to use, because givers gain. It is not made or endorsed by BNI.';

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const safeUrl = (u: string) => (/^https?:\/\/[^\s"'<>]+$/.test(u) ? u : '');

function shell(title: string, bodyRows: string, footerRows: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;"><tr><td align="center" style="padding:16px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${LINE};">
<tr><td style="background:${RED};padding:16px 20px;${FONT}color:#ffffff;font-size:18px;font-weight:bold;">${esc(title)}</td></tr>
${bodyRows}
<tr><td style="padding:16px 20px;background:#f1f5f9;${FONT}font-size:13px;line-height:1.5;color:${SLATE};">${footerRows}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function personCell(p: Person, maxWidth: number): string {
  return `<div style="display:inline-block;width:100%;max-width:${maxWidth}px;vertical-align:top;" data-person="1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:6px 10px;${FONT}font-size:15px;line-height:1.4;color:${DARK};"><strong style="color:${DARK};">${esc(p.name)}</strong>${p.business ? `<br><span style="font-size:13px;color:${SLATE};">${esc(p.business)}</span>` : ''}</td></tr></table>
</div>`;
}

function footer(link: string, extra: string): string {
  const u = safeUrl(link);
  return `${extra}<p style="margin:0 0 8px 0;">${u ? `Leadership can update the roster <a href="${esc(u)}" style="color:#A61926;">here</a>.` : ''}</p><p style="margin:0;">${esc(NOT_OFFICIAL)}</p>`;
}

export function matchEmailHtml(d: { dateLabel: string; rosterLabel: string; link: string; groups: Person[][]; repeats: number }): string {
  const rows = d.groups.map((g) => {
    const trio = g.length === 3;
    const w = trio ? 176 : 270;
    return `<tr><td data-row="group" style="padding:8px 10px;border-top:1px solid ${LINE};">${trio ? `<div style="${FONT}font-size:12px;font-weight:bold;color:#A61926;padding:0 10px 2px 10px;">Group of three</div>` : ''}${g.map((p) => personCell(p, w)).join('')}</td></tr>`;
  }).join('\n');
  const intro = `<tr><td style="padding:16px 20px 8px 20px;${FONT}font-size:15px;line-height:1.5;color:${DARK};">Here are this round's 1-to-1 pairs for ${esc(d.dateLabel)}.</td></tr>`;
  const note = d.repeats ? `<p style="margin:0 0 8px 0;">${d.repeats} of these pairs met in a recent round; the chapter is too small to avoid every repeat.</p>` : '';
  return shell(`1-to-1 pairs: ${d.dateLabel}`, `${intro}\n${rows}`, footer(d.link, `${note}<p style="margin:0 0 8px 0;">Roster last updated ${esc(d.rosterLabel)}.</p>`));
}

export function updateEmailHtml(d: { link: string; reason: string }): string {
  const body = `<tr><td style="padding:16px 20px;${FONT}font-size:15px;line-height:1.5;color:${DARK};">This round's 1-to-1 match could not be made because ${esc(d.reason)}.<br><br>The match will be made on the next round day after the roster is updated.</td></tr>`;
  return shell('Please update the chapter roster', body, footer(d.link, ''));
}
