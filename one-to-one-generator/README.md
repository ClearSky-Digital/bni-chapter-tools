# BNI 1-to-1 Matcher

A free tool for BNI chapters, made by a member for anyone to use, because givers gain. It is independent and not made or endorsed by BNI.

There are two parts:

1. **The public matcher** (`/chaptertools`). Upload a roster CSV in the browser and get this round's pairs. The roster never leaves the browser; the last four runs are kept in that browser's storage to avoid repeat pairs.
2. **Automated rounds** (optional, off by default). A server-held roster, a scheduled job that emails each round's pairs, and a leadership-only page (`/chaptertools/leadership`) to update the roster.

## Settings

All settings are environment variables. See `.env.example` for placeholders; real values are never committed. Missing or invalid settings fail closed: the leadership pages and the scheduled job answer "not set up" and the public matcher keeps working.

| Setting | Meaning |
| --- | --- |
| `AUTOMATION_ENABLED` | Master switch for the scheduled email. Default `false`. |
| `DRY_RUN` | Default `true`: emails are written to files in `BNI_STATE_DIR/dry-run`, nothing is sent. Only the exact word `false` sends for real (it also needs `RESEND_API_KEY` and `CONTACT_FORM_SENDER`). |
| `MATCH_TO` | Where the pairs are emailed. Required (no default); a missing value stops the leadership tools and the cron route. |
| `LEADERSHIP_EMAILS` | Comma list of addresses that may sign in and update the roster. Empty means nobody can. |
| `RESEND_API_KEY`, `CONTACT_FORM_SENDER` | Email sending, the same setup as the ClearSky contact form. |
| `CRON_SECRET` | At least 16 characters. The scheduled job must send it as a bearer token. |
| `SESSION_SECRET` | At least 32 characters. Protects sign-in links, sessions and form tokens. |
| `BNI_STATE_DIR` | Folder for the SQLite file. In Docker, a named volume is mounted at `/app/state`. |
| `TRUSTED_PROXY_HOPS` | How many proxies append to `X-Forwarded-For` in front of the app (1 to 5, default 1). The visitor address is that many entries from the right; a missing or too-short header puts the caller in one shared, tightly limited bucket. `X-Real-IP` and `CF-Connecting-IP` are not trusted. Behind Cloudflare then Nginx Proxy Manager use 2. |
| `BNI_SCHEDULE` | `weekly` (every Tuesday), `biweekly` (default) or `monthly` (the first Tuesday of the month), by the Pacific calendar. Any other value stops the leadership tools and the cron route (fails closed). |
| `BNI_ANCHOR_DATE`, `BNI_ROUND_DAYS` | Used by `biweekly` only: the first round day (default 2026-11-17) and days between rounds (default 14). `weekly` and `monthly` ignore them. |
| `HISTORY_ROUNDS` | Past rounds that count when avoiding repeats. Default 4. |
| `BNI_DEV_LOCAL` | Local testing only, default false. With `DRY_RUN=true` and a `http://localhost` `TOOL_URL`, sign-in links are written to the dry-run folder and any day counts as a round day. Any other combination refuses to start. `npm run round:local` triggers the round against a local instance. |
| `ROSTER_STALE_DAYS` | A roster older than this triggers a please-update email instead of a match. Default 60. |
| `TOOL_URL` | Public address, used in email links. |

## The scheduled job

`POST /chaptertools/api/cron/reminder` with `Authorization: Bearer $CRON_SECRET`. Run it from VPS cron every Tuesday at the chosen time (for example 8:00 AM Pacific). The app decides whether it is a round day (the anchor date plus every `BNI_ROUND_DAYS`), so off weeks do nothing, and it sends at most once per day.

On a round day it makes the match from the stored roster, avoiding pairs from the last `HISTORY_ROUNDS` rounds (an odd roster gets one group of three), saves the round, and emails the pairs to `MATCH_TO` with the date the roster was last updated and the leadership link. If the roster is empty or older than `ROSTER_STALE_DAYS`, it emails a please-update note instead. In dry-run mode nothing is sent and no history is saved.

## Leadership sign-in and roster update

- A leadership address requests a sign-in link; the answer is the same for every address, so nobody can tell which addresses are allowed. The link is emailed only to an allowlisted address, works once and expires in 15 minutes.
- The link opens a page with a Continue button (so mail scanners cannot use it up) and starts a 2-hour session in an httpOnly, Secure, SameSite=Lax cookie. Every change needs a matching CSRF token.
- Requests for links are limited per address and per IP.
- Upload the roster export (CSV). Only name and business are read. Files over 200 KB or 300 rows are refused, cells are cleaned of control characters, and a cell that starts with `=`, `+`, `-`, `@` or a tab is prefixed with an apostrophe so it cannot run as a spreadsheet formula.
- A preview shows who is added and removed. Confirming replaces the roster.

A sample in the expected shape (made-up names):

```
First Name,Last Name,Company Name
Ada,Example,Example Engines
Grace,Sample,Sample Compilers
```

Accepted name columns: `Name`, `Full Name`, `Member Name`, or `First Name` with `Last Name`. Business column: `Company Name`, `Company` or `Business`.

## Privacy: what is stored

- **Per member:** name and business only. Phone numbers, email addresses and all other columns are dropped before saving.
- **Roster:** kept until leadership replaces it. A member left out of a new upload is removed, and their past pairings are deleted at the same time.
- **Match history:** the pairs from the last `HISTORY_ROUNDS` rounds; older rounds are deleted.
- **Update record:** leadership email, date and counts of members added, removed and unchanged, no names. Deleted after 12 months.
- **Sign-in:** links last 15 minutes; sessions 2 hours. Link and session codes are stored only as hashes, next to the leadership email address they belong to, and are deleted when they expire.
- **Dry run:** emails written in dry-run mode (pairs with names and businesses, update notes) are kept as files in `BNI_STATE_DIR/dry-run` for 7 days and then deleted. Sign-in links are never written to those files.
- **Who can see it:** the leadership addresses in `LEADERSHIP_EMAILS`, and whoever runs the server. The pairs go by email to `MATCH_TO`.
- **Removing someone:** upload a roster without them, or ask chapter leadership to.
- Secrets and roster contents are never written to logs.

The roster file itself (`*.csv`) is ignored by git and must never be committed.

## Running behind a proxy

The per-IP limits use the last address in `X-Forwarded-For`, the one the proxy appends. Run the tool behind a proxy that does that (for example the VPS reverse proxy), and keep the container off public ports. In dry-run mode sign-in emails are not delivered with a usable link, so signing in needs `DRY_RUN=false` and working email settings.

## Development

```
npm install
npm test        # unit and dry-run end-to-end tests (Node 24)
npm run lint
npm run build
```

Node 24 or newer is required (the roster store uses the built-in `node:sqlite`).

## License

MIT, copyright 2026 ClearSky Digital LLC. See the LICENSE file at the repository root.
