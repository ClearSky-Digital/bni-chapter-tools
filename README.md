# BNI Chapter Tools

Built and maintained by [ClearSky Digital](https://cscloud.digital).

A free 1-to-1 matcher for BNI chapters. It pairs members for their one-to-one meetings, avoids repeating recent pairs, and can email each round's pairings to your chapter on a schedule. It is independent and is not made or endorsed by BNI.

## What it does

- **Public matcher.** Open the page, choose your roster file, and get this round's pairs. The roster stays in your browser.
- **Leadership roster.** Chapter leaders you name can sign in with an emailed link and upload the current roster. The preview flags rows that need a look, such as a blank business name or a job title in the name column, before anything is saved.
- **Scheduled match email.** On the days you choose, the tool emails the new pairs to one address, for example the person who sends them to the chapter. If the roster is out of date, it sends a "please update the roster" note instead.

## Features

- Weekly, biweekly or monthly rounds (first Tuesday of the month)
- Avoids repeating pairs from the last few rounds, and handles an odd number of members with one group of three
- Match emails with a clean card layout, plus a plain-text version
- Dry-run mode that writes emails to files so you can look before anything is sent
- Leadership sign-in by one-time emailed link, no passwords
- Settings live in environment variables, and a setting that is blank or wrong turns the automation off

## Quick start

You need Docker and Node 24 or newer (only if you build from source).

1. Build the image from this folder:

   ```
   docker build -f one-to-one-generator/DockerFile -t bni-chapter-tools one-to-one-generator
   ```

2. In `docker-compose.yaml`, set `image:` to `bni-chapter-tools`. The file expects an existing Docker network named `publictools`; create it with `docker network create publictools` or change the name to match yours.
3. Copy `one-to-one-generator/.env.example` to `.env` next to `docker-compose.yaml` and fill in your own values.
4. Start it:

   ```
   docker compose up -d
   ```

Leave `DRY_RUN=true` until you have looked at a sample email, then set it to `false` to send for real.

## Settings

Everything is configured with environment variables. These are placeholders; use your own.

| Setting | Example | What it is |
| --- | --- | --- |
| `AUTOMATION_ENABLED` | `true` | Turns the scheduled email on (off by default) |
| `DRY_RUN` | `true` | Writes emails to files instead of sending |
| `MATCH_TO` | `chapter@example.org` | Where the pairs are emailed (required) |
| `LEADERSHIP_EMAILS` | `leader@example.org` | Who may sign in and upload the roster |
| `BNI_SCHEDULE` | `biweekly` | `weekly`, `biweekly` or `monthly` |
| `TOOL_URL` | `https://example.org/chaptertools` | Public address used in email links |
| `RESEND_API_KEY`, `CONTACT_FORM_SENDER` | your own | Email sending through Resend |
| `CRON_SECRET`, `SESSION_SECRET` | long random strings | Protect the scheduled job and sign-in |
| `TRUSTED_PROXY_HOPS` | `1` | How many proxies sit in front of the app |

The full list, the scheduled job, and the details of each setting are in [one-to-one-generator/README.md](one-to-one-generator/README.md).

## Privacy

Member names and emails are stored only in the container's state volume on your server. They are never committed to this repository, and the roster file you upload is not kept anywhere else. Past pairings are kept for a few rounds so pairs do not repeat, and you can remove a person by uploading a roster without them.

## License

MIT, copyright 2026 [ClearSky Digital LLC](https://cscloud.digital). See the [LICENSE](LICENSE) file.
