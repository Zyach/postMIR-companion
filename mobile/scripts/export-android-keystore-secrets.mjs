import fs from 'node:fs';
import path from 'node:path';

const repoRoot = new URL('..', import.meta.url);

const srcCredentials = process.argv[2];
const srcKeystore = process.argv[3];

if (!srcCredentials || !srcKeystore) {
  console.error(
    'Usage: node mobile/scripts/export-android-keystore-secrets.mjs <path/to/credentials.json> <path/to/keystore.jks>'
  );
  process.exit(1);
}

const creds = JSON.parse(fs.readFileSync(srcCredentials, 'utf8'));
const ks = creds?.android?.keystore;
if (!ks?.keystorePassword || !ks?.keyAlias || !ks?.keyPassword) {
  console.error('Invalid credentials.json (android.keystore.* missing)');
  process.exit(1);
}

const keystoreBuf = fs.readFileSync(srcKeystore);
const keystoreB64 = keystoreBuf.toString('base64');

const outDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '.secrets');
fs.mkdirSync(outDir, { recursive: true });

const outPath = path.join(outDir, 'github-actions-android.env');
const lines = [
  `ANDROID_KEYSTORE_BASE64=${keystoreB64}`,
  `ANDROID_KEYSTORE_PASSWORD=${ks.keystorePassword}`,
  `ANDROID_KEY_ALIAS=${ks.keyAlias}`,
  `ANDROID_KEY_PASSWORD=${ks.keyPassword}`,
  '',
];
fs.writeFileSync(outPath, lines.join('\n'), { mode: 0o600 });

console.log(`Wrote ${outPath}`);
console.log('Add these as GitHub Actions secrets (exact names):');
console.log('- ANDROID_KEYSTORE_BASE64');
console.log('- ANDROID_KEYSTORE_PASSWORD');
console.log('- ANDROID_KEY_ALIAS');
console.log('- ANDROID_KEY_PASSWORD');

