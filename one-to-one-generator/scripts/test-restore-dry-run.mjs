// Puts .env.local back to the dry-run settings saved when a live test config was made (.env.dry-run.bak).
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bak = join(root, '.env.dry-run.bak');
if (!existsSync(bak)) { console.error('No saved dry-run settings (.env.dry-run.bak) found.'); process.exit(1); }
copyFileSync(bak, join(root, '.env.local'));
console.log('.env.local is back to dry run. Restart the server for it to take effect.');
