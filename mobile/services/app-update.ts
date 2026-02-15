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
  if (!subtle?.digest) {
    throw new UpdateError(
      'CRYPTO_UNSUPPORTED',
      'Este dispositivo no soporta verificacion SHA-256 para actualizaciones.'
    );
  }

  const info = await FileSystem.getInfoAsync(fileUri);
  const MAX_BYTES = 200 * 1024 * 1024; // 200 MB guardrail
  if (info?.size && info.size > MAX_BYTES) {
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
  const digest = await subtle.digest('SHA-256', data);
  const hashBytes = new Uint8Array(digest);
  return Array.from(hashBytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
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
