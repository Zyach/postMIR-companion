import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

export const UPDATE_LAST_CHECK_KEY = 'postmir_update_last_check_v1';
export const UPDATE_LAST_NOTIFIED_KEY = 'postmir_update_last_notified_v1';
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

const ANDROID_INTENT_FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;
const ANDROID_INTENT_FLAG_ACTIVITY_NEW_TASK = 0x10000000;

const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/i;
const SIGNATURE_BASE64ISH_REGEX = /^[0-9a-z+/=_-]+$/i;
const SIGNATURE_MAX_CHARS = 4096;
const SIGNATURE_ALG_MAX_CHARS = 128;

export type UpdateManifest = {
  versionCode: number;
  versionName?: string;
  apkUrl: string;
  sha256: string;
  signature?: string;
  signatureAlg?: string;
  notes?: string;
  publishedAt?: string;
};

export type UpdateCheckResult = {
  manifest: UpdateManifest;
  available: boolean;
};

export type UpdateErrorCode =
  | 'MANIFEST_INVALID'
  | 'HTTP_ERROR'
  | 'PLATFORM_NOT_SUPPORTED'
  | 'WRITE_DIR_UNAVAILABLE'
  | 'DOWNLOAD_INCOMPLETE'
  | 'CRYPTO_UNSUPPORTED'
  | 'FILE_TOO_LARGE'
  | 'INTEGRITY_MISMATCH'
  | 'INSTALL_FAILED'
  | 'UNKNOWN';

export class UpdateError extends Error {
  code: UpdateErrorCode;

  constructor(code: UpdateErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function toMessage(err: unknown) {
  if (err instanceof Error && err.message) return err.message;
  return 'Error desconocido';
}

function normalizeSha256(value: string) {
  return value.trim().toLowerCase();
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function parseUpdateManifest(raw: unknown): UpdateManifest {
  if (!raw || typeof raw !== 'object') {
    throw new UpdateError('MANIFEST_INVALID', 'Manifest de actualizacion invalido: JSON vacio o malformado.');
  }

  const json = raw as Record<string, unknown>;
  const versionCode = Number(json.versionCode);
  if (!Number.isFinite(versionCode) || versionCode <= 0 || !Number.isInteger(versionCode)) {
    throw new UpdateError(
      'MANIFEST_INVALID',
      'Manifest de actualizacion invalido: versionCode ausente o invalido.'
    );
  }

  if (typeof json.apkUrl !== 'string' || !json.apkUrl.trim()) {
    throw new UpdateError('MANIFEST_INVALID', 'Manifest de actualizacion invalido: apkUrl ausente.');
  }

  let apkUrl: string;
  try {
    const parsedUrl = new URL(json.apkUrl);
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('non-https');
    }
    apkUrl = parsedUrl.toString();
  } catch {
    throw new UpdateError(
      'MANIFEST_INVALID',
      'Manifest de actualizacion invalido: apkUrl debe ser una URL HTTPS valida.'
    );
  }

  if (typeof json.sha256 !== 'string') {
    throw new UpdateError('MANIFEST_INVALID', 'Manifest de actualizacion invalido: sha256 ausente.');
  }
  const sha256 = normalizeSha256(json.sha256);
  if (!SHA256_HEX_REGEX.test(sha256)) {
    throw new UpdateError(
      'MANIFEST_INVALID',
      'Manifest de actualizacion invalido: sha256 debe tener 64 caracteres hexadecimales.'
    );
  }

  const signature = normalizeOptionalText(json.signature);
  if (signature) {
    if (signature.length > SIGNATURE_MAX_CHARS) {
      throw new UpdateError(
        'MANIFEST_INVALID',
        `Manifest de actualizacion invalido: signature demasiado larga (max ${SIGNATURE_MAX_CHARS}).`
      );
    }
    if (!SIGNATURE_BASE64ISH_REGEX.test(signature)) {
      throw new UpdateError(
        'MANIFEST_INVALID',
        'Manifest de actualizacion invalido: signature debe ser base64 (o base64url).'
      );
    }
  }

  const signatureAlg = normalizeOptionalText(json.signatureAlg);
  if (signatureAlg && signatureAlg.length > SIGNATURE_ALG_MAX_CHARS) {
    throw new UpdateError(
      'MANIFEST_INVALID',
      `Manifest de actualizacion invalido: signatureAlg demasiado largo (max ${SIGNATURE_ALG_MAX_CHARS}).`
    );
  }

  const publishedAt = normalizeOptionalText(json.publishedAt);
  const publishedAtSafe = publishedAt && Number.isFinite(Date.parse(publishedAt)) ? publishedAt : undefined;

  return {
    versionCode,
    apkUrl,
    sha256,
    signature,
    signatureAlg,
    versionName: normalizeOptionalText(json.versionName),
    notes: normalizeOptionalText(json.notes),
    publishedAt: publishedAtSafe,
  };
}

export async function shouldAutoCheckUpdates() {
  const raw = await AsyncStorage.getItem(UPDATE_LAST_CHECK_KEY);
  if (!raw) return true;
  const ts = Number(raw);
  if (!Number.isFinite(ts) || ts <= 0) return true;
  return Date.now() - ts > UPDATE_CHECK_INTERVAL_MS;
}

export async function markUpdateCheckedNow() {
  await AsyncStorage.setItem(UPDATE_LAST_CHECK_KEY, String(Date.now()));
}

export async function getLastNotifiedVersion() {
  const raw = await AsyncStorage.getItem(UPDATE_LAST_NOTIFIED_KEY);
  if (!raw) return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
}

export async function setLastNotifiedVersion(versionCode: number) {
  await AsyncStorage.setItem(UPDATE_LAST_NOTIFIED_KEY, String(versionCode));
}

export async function fetchUpdateManifest(manifestUrl: string): Promise<UpdateManifest> {
  let res: Response;
  try {
    res = await fetch(manifestUrl, {
      headers: {
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    throw new UpdateError('HTTP_ERROR', toMessage(err));
  }
  if (!res.ok) {
    throw new UpdateError('HTTP_ERROR', `HTTP ${res.status}`);
  }

  const json = await res.json();
  return parseUpdateManifest(json);
}

export async function checkForUpdate(args: {
  manifestUrl: string;
  currentBuildVersionCode: number | null;
}): Promise<UpdateCheckResult> {
  const manifest = await fetchUpdateManifest(args.manifestUrl);
  const available =
    args.currentBuildVersionCode !== null && manifest.versionCode > args.currentBuildVersionCode;
  return { manifest, available };
}

export async function computeFileSha256(fileUri: string) {
  const subtle =
    (globalThis as {
      crypto?: {
        subtle?: { digest: (algorithm: string, data: ArrayBuffer) => Promise<ArrayBuffer> };
      };
    }).crypto?.subtle;

  const info = await FileSystem.getInfoAsync(fileUri);
  const MAX_BYTES = 200 * 1024 * 1024; // 200 MB guardrail
  if (info?.exists && 'size' in info && (info as { size: number }).size > MAX_BYTES) {
    throw new UpdateError(
      'FILE_TOO_LARGE',
      'El APK es demasiado grande para verificar en memoria. Usa descarga manual o divide el paquete.'
    );
  }

  const file = new FileSystem.File(fileUri);
  const bytes = await file.bytes();
  const data =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (subtle?.digest) {
    const digest = await subtle.digest('SHA-256', data);
    const hashBytes = new Uint8Array(digest);
    return Array.from(hashBytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  return sha256Bytes(bytes);
}

function sha256Bytes(bytes: Uint8Array) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
    0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
    0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
    0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
    0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
  ];
  const H = [
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ];

  const words: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    words[i >> 2] |= bytes[i] << ((3 - (i & 3)) * 8);
  }
  const bitLen = bytes.length * 8;
  words[bitLen >> 5] |= 0x80 << (24 - (bitLen % 32));
  words[(((bitLen + 64) >> 9) << 4) + 15] = bitLen;

  const W = new Array<number>(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let i = 0; i < words.length; i += 16) {
    let a = H[0];
    let b = H[1];
    let c = H[2];
    let d = H[3];
    let e = H[4];
    let f = H[5];
    let g = H[6];
    let h = H[7];

    for (let t = 0; t < 64; t++) {
      if (t < 16) {
        W[t] = words[i + t] | 0;
      } else {
        const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
        const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }

      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
    H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0;
    H[7] = (H[7] + h) | 0;
  }

  return H.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

function ensureDirSuffix(uri: string) {
  return uri.endsWith('/') ? uri : `${uri}/`;
}

export async function downloadAndInstallAndroidUpdate(args: {
  manifest: UpdateManifest;
  fileNamePrefix?: string;
  onProgress?: (progress01: number) => void;
}) {
  if (Platform.OS !== 'android') {
    throw new UpdateError(
      'PLATFORM_NOT_SUPPORTED',
      'La instalacion de APK solo esta disponible en Android.'
    );
  }

  const manifest = parseUpdateManifest(args.manifest);
  const baseDir = FileSystem.Paths.cache.uri || FileSystem.Paths.document.uri;
  if (!baseDir) {
    throw new UpdateError('WRITE_DIR_UNAVAILABLE', 'Sin directorio con escritura');
  }

  const prefix = args.fileNamePrefix || 'postmir_companion';
  const localUri = `${ensureDirSuffix(baseDir)}${prefix}_${manifest.versionCode}.apk`;
  let downloadedUri: string | null = null;
  try {
    const download = LegacyFileSystem.createDownloadResumable(
      manifest.apkUrl,
      localUri,
      {},
      (progress) => {
        if (progress.totalBytesExpectedToWrite > 0) {
          args.onProgress?.(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
        }
      }
    );
    const result = await download.downloadAsync();
    if (!result?.uri) {
      throw new UpdateError('DOWNLOAD_INCOMPLETE', 'Descarga incompleta');
    }
    downloadedUri = result.uri;

    const downloadedSha256 = await computeFileSha256(result.uri);
    if (downloadedSha256 !== manifest.sha256) {
      try {
        await LegacyFileSystem.deleteAsync(result.uri, { idempotent: true });
      } catch {
        // Ignore cleanup errors after integrity mismatch.
      }
      throw new UpdateError(
        'INTEGRITY_MISMATCH',
        'Integridad no valida: el APK descargado no coincide con el SHA-256 publicado. Se bloqueo la instalacion por seguridad.'
      );
    }

    const contentUri = await LegacyFileSystem.getContentUriAsync(result.uri);
    const flags =
      ANDROID_INTENT_FLAG_ACTIVITY_NEW_TASK | ANDROID_INTENT_FLAG_GRANT_READ_URI_PERMISSION;

    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags,
        type: 'application/vnd.android.package-archive',
      });
    } catch (err) {
      throw new UpdateError('INSTALL_FAILED', toMessage(err));
    }
  } catch (err) {
    const isSecurityError =
      err instanceof UpdateError &&
      (err.code === 'MANIFEST_INVALID' || err.code === 'INTEGRITY_MISMATCH' || err.code === 'CRYPTO_UNSUPPORTED');

    if (!isSecurityError && downloadedUri) {
      try {
        await LegacyFileSystem.deleteAsync(downloadedUri, { idempotent: true });
      } catch {
        // Ignore cleanup errors.
      }
    }

    if (err instanceof UpdateError) throw err;
    throw new UpdateError('UNKNOWN', toMessage(err));
  }
}
