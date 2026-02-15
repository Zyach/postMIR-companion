import fs from 'node:fs';

const apkUrl = process.argv[2];
const sha256 = process.argv[3];
const notes = process.argv.slice(4).join(' ').trim();
const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/i;
const SIGNATURE_BASE64ISH_REGEX = /^[0-9a-z+/=_-]+$/i;
const SIGNATURE_MAX_CHARS = 4096;
const SIGNATURE_ALG_MAX_CHARS = 128;

if (!apkUrl || !sha256) {
  console.error('Usage: node scripts/make-update-manifest.mjs <apkUrl> <sha256> [notes...]');
  process.exit(1);
}
if (!SHA256_HEX_REGEX.test(sha256)) {
  console.error('Error: sha256 must be a 64-char hex string');
  process.exit(1);
}

const signature = (process.env.UPDATE_SIGNATURE || '').trim();
const signatureAlg = (process.env.UPDATE_SIGNATURE_ALG || '').trim();

if (signature) {
  if (signature.length > SIGNATURE_MAX_CHARS) {
    console.error(`Error: UPDATE_SIGNATURE too long (max ${SIGNATURE_MAX_CHARS})`);
    process.exit(1);
  }
  if (!SIGNATURE_BASE64ISH_REGEX.test(signature)) {
    console.error('Error: UPDATE_SIGNATURE must be base64 (or base64url)');
    process.exit(1);
  }
}

if (signatureAlg && signatureAlg.length > SIGNATURE_ALG_MAX_CHARS) {
  console.error(`Error: UPDATE_SIGNATURE_ALG too long (max ${SIGNATURE_ALG_MAX_CHARS})`);
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
  sha256: sha256.toLowerCase(),
  ...(signature ? { signature } : {}),
  ...(signatureAlg ? { signatureAlg } : {}),
  publishedAt: new Date().toISOString(),
  ...(notes ? { notes } : {}),
};

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
