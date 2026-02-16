import fs from 'node:fs';

const argv = process.argv.slice(2);

const hasFlag = (flag) => argv.includes(flag);
const getArg = (name) => {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  const value = argv[idx + 1];
  return value && !value.startsWith('--') ? value : null;
};

const usage = () => {
  // Keep it short: this runs in Termux/CI.
  console.log('Usage: node scripts/release-bump.mjs [--dry-run] [--keep-version] [--version X.Y.Z]');
  console.log('');
  console.log('Default behavior:');
  console.log('- Increment expo.android.versionCode by 1');
  console.log('- Increment expo.version patch by 1 (X.Y.Z -> X.Y.(Z+1))');
};

if (hasFlag('--help') || hasFlag('-h')) {
  usage();
  process.exit(0);
}

const dryRun = hasFlag('--dry-run');
const keepVersion = hasFlag('--keep-version');
const explicitVersion = getArg('--version');

const appJsonPath = new URL('../app.json', import.meta.url);
const raw = fs.readFileSync(appJsonPath, 'utf8');
const doc = JSON.parse(raw);

if (!doc?.expo) {
  console.error('Error: app.json missing "expo" root key.');
  process.exit(1);
}
if (!doc.expo.android) {
  console.error('Error: app.json missing "expo.android" key.');
  process.exit(1);
}

const currentVc = doc.expo.android.versionCode;
if (typeof currentVc !== 'number' || !Number.isFinite(currentVc)) {
  console.error('Error: expo.android.versionCode is missing/invalid.');
  process.exit(1);
}

const nextVc = currentVc + 1;
doc.expo.android.versionCode = nextVc;

const currentVersion = doc.expo.version;
let nextVersion = currentVersion;

if (explicitVersion) {
  nextVersion = explicitVersion;
} else if (!keepVersion) {
  const m = typeof currentVersion === 'string' ? currentVersion.match(/^(\d+)\.(\d+)\.(\d+)$/) : null;
  if (m) {
    const major = Number(m[1]);
    const minor = Number(m[2]);
    const patch = Number(m[3]);
    nextVersion = `${major}.${minor}.${patch + 1}`;
  }
}

if (typeof nextVersion === 'string' && nextVersion.length) {
  doc.expo.version = nextVersion;
}

const out = JSON.stringify(doc, null, 2) + '\n';

if (dryRun) {
  console.error(`versionCode: ${currentVc} -> ${nextVc}`);
  if (typeof currentVersion === 'string') {
    console.error(`version: ${currentVersion} -> ${doc.expo.version}`);
  }
  process.exit(0);
}

fs.writeFileSync(appJsonPath, out, 'utf8');
console.error(`Updated app.json: versionCode=${nextVc}, version=${doc.expo.version}`);
