import fs from 'node:fs';

const apkUrl = process.argv[2];
const notes = process.argv.slice(3).join(' ').trim();

if (!apkUrl) {
  console.error('Usage: node scripts/make-update-manifest.mjs <apkUrl> [notes...]');
  process.exit(1);
}

const appJson = JSON.parse(fs.readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
const expo = appJson?.expo;
const versionCode = expo?.android?.versionCode;
const versionName = expo?.version;

if (typeof versionCode !== 'number' || !Number.isFinite(versionCode)) {
  console.error('Error: expo.android.versionCode missing/invalid in app.json');
  process.exit(1);
}
if (typeof versionName !== 'string' || !versionName) {
  console.error('Error: expo.version missing/invalid in app.json');
  process.exit(1);
}

const manifest = {
  versionCode,
  versionName,
  apkUrl,
  publishedAt: new Date().toISOString(),
  ...(notes ? { notes } : {}),
};

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);

