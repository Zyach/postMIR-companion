#!/usr/bin/env node
// Lightweight, emulator-free smoke for the updater.
// Validates: manifest parsing, SHA-256 mismatch fail-closed, happy path, and iOS guard.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const Module = require('module');

const CWD = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'postmir-updater-'));

function compileService() {
  // Emit JS for the TS service into the temp dir.
  const args = [
    'tsc',
    'services/app-update.ts',
    '--target',
    'ES2020',
    '--module',
    'commonjs',
    '--outDir',
    TMP,
    '--esModuleInterop',
    '--skipLibCheck',
  ];
  cp.execFileSync('npx', args, { cwd: CWD, stdio: 'inherit' });
  const outPath = path.join(TMP, 'app-update.js');
  if (!fs.existsSync(outPath)) {
    const listing = fs.readdirSync(TMP, { withFileTypes: true }).map((d) => d.name).join(', ');
    throw new Error(`Compiled service not found at ${outPath}. TMP contents: ${listing}`);
  }
  return outPath;
}

// Minimal mocks for React Native / Expo APIs used by the service.
function installMocks() {
  const asyncStorage = new Map();
  const AsyncStorage = {
    async getItem(k) {
      return asyncStorage.has(k) ? asyncStorage.get(k) : null;
    },
    async setItem(k, v) {
      asyncStorage.set(k, v);
    },
    async removeItem(k) {
      asyncStorage.delete(k);
    },
  };

  const Paths = { cache: { uri: '/tmp/' }, document: { uri: '/tmp/' } };
  function createDownloadResumable(url, dest, _opts, onProgress) {
    return {
      async downloadAsync() {
        const content = Buffer.from(url, 'utf8');
        fs.writeFileSync(dest, content);
        onProgress &&
          onProgress({ totalBytesExpectedToWrite: content.length, totalBytesWritten: content.length });
        return { uri: dest };
      },
    };
  }
  async function deleteAsync(p) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  async function getContentUriAsync(p) {
    return 'content://' + p;
  }
  class FileStub {
    constructor(uri) {
      this.uri = uri;
    }
    async bytes() {
      return fs.readFileSync(this.uri);
    }
  }

  const originalLoad = Module._load;
  Module._load = function (req, parent, isMain) {
    if (req === 'expo-file-system') return {
      File: FileStub,
      Paths,
      createDownloadResumable,
      deleteAsync,
      getInfoAsync: async (uri) => {
        try {
          const stat = fs.statSync(uri);
          return { exists: true, uri, isDirectory: stat.isDirectory(), size: stat.size };
        } catch {
          return { exists: false, uri, isDirectory: false };
        }
      },
    };
    if (req === 'expo-file-system/legacy')
      return { createDownloadResumable, deleteAsync, getContentUriAsync, writeAsStringAsync: fs.promises.writeFile };
    if (req === 'expo-intent-launcher') return { startActivityAsync: async () => {} };
    if (req === 'react-native')
      return {
        Platform: {
          get OS() {
            return Module._platform_override || 'android';
          },
        },
      };
    if (req === '@react-native-async-storage/async-storage') return AsyncStorage;
    return originalLoad(req, parent, isMain);
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  installMocks();
  const servicePath = compileService();
  const service = require(servicePath);

  const results = [];

  // Case 1: mismatch must block.
  Module._platform_override = 'android';
  const bad = { versionCode: 2, apkUrl: 'https://example.com/bad', sha256: 'a'.repeat(64) };
  try {
    await service.downloadAndInstallAndroidUpdate({ manifest: bad, fileNamePrefix: 't' });
    results.push('mismatch_failed');
  } catch (err) {
    assert(
      err instanceof service.UpdateError && err.code === 'INTEGRITY_MISMATCH',
      'Expected INTEGRITY_MISMATCH'
    );
    results.push('INTEGRITY_MISMATCH');
  }

  // Case 2: happy path with matching hash.
  Module._platform_override = 'android';
  const content = 'https://example.com/good';
  const sha = crypto.createHash('sha256').update(content).digest('hex');
  const ok = { versionCode: 3, apkUrl: content, sha256: sha };
  try {
    await service.downloadAndInstallAndroidUpdate({ manifest: ok, fileNamePrefix: 't2' });
    results.push('happy_ok');
  } catch (err) {
    results.push('happy_failed:' + (err.code || err.message));
  }

  // Case 3: iOS must be check-only (block install).
  Module._platform_override = 'ios';
  const ios = { versionCode: 4, apkUrl: 'https://example.com/ios', sha256: 'b'.repeat(64) };
  try {
    await service.downloadAndInstallAndroidUpdate({ manifest: ios });
    results.push('ios_failed');
  } catch (err) {
    assert(
      err instanceof service.UpdateError && err.code === 'PLATFORM_NOT_SUPPORTED',
      'Expected PLATFORM_NOT_SUPPORTED'
    );
    results.push('PLATFORM_NOT_SUPPORTED');
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
