import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as Application from 'expo-application';

import {
  checkForUpdate,
  downloadAndInstallAndroidUpdate,
  getLastNotifiedVersion,
  markUpdateCheckedNow,
  setLastNotifiedVersion,
  shouldAutoCheckUpdates,
  type UpdateCheckResult,
  type UpdateManifest,
} from '@/services/app-update';

export type UseAppUpdateBackgroundArgs = {
  manifest: UpdateManifest;
  canInstall: boolean;
  install: () => Promise<void>;
};

export type UseAppUpdateOptions = {
  manifestUrl: string;
  onBackgroundUpdateAvailable?: (args: UseAppUpdateBackgroundArgs) => void;
};

function toMessage(err: unknown) {
  if (err instanceof Error && err.message) return err.message;
  return 'Error desconocido';
}

export function useAppUpdate(opts: UseAppUpdateOptions) {
  const { manifestUrl, onBackgroundUpdateAvailable } = opts;

  const currentBuildVersionCode = useMemo(() => {
    const raw = Application.nativeBuildVersion;
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }, []);

  const currentAppVersion = Application.nativeApplicationVersion || '1.0.0';
  const canInstall = Platform.OS === 'android';

  const [updateManifest, setUpdateManifest] = useState<UpdateManifest | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);

  const checkUpdate = useCallback(
    async (args?: { silent?: boolean; force?: boolean }): Promise<UpdateCheckResult | null> => {
      const silent = !!args?.silent;
      const force = !!args?.force;

      if (!force) {
        const should = await shouldAutoCheckUpdates();
        if (!should) return null;
      }

      if (!silent) {
        setUpdateError(null);
        setUpdateManifest(null);
        setUpdateAvailable(false);
        setUpdateProgress(null);
        setUpdateBusy(true);
      }

      try {
        const result = await checkForUpdate({
          manifestUrl,
          currentBuildVersionCode,
        });
        setUpdateManifest(result.manifest);
        setUpdateAvailable(result.available);

        await markUpdateCheckedNow();
        return result;
      } catch (err) {
        setUpdateManifest(null);
        setUpdateAvailable(false);
        if (!silent) {
          setUpdateError(toMessage(err));
        }
        return null;
      } finally {
        if (!silent) setUpdateBusy(false);
      }
    },
    [currentBuildVersionCode, manifestUrl]
  );

  const downloadAndInstallUpdate = useCallback(
    async (manifestOverride?: UpdateManifest) => {
      const manifest = manifestOverride || updateManifest;
      if (!manifest) {
        throw new Error('No hay una actualizacion para descargar.');
      }

      setUpdateError(null);
      setUpdateBusy(true);
      setUpdateProgress(0);
      try {
        await downloadAndInstallAndroidUpdate({
          manifest,
          fileNamePrefix: 'postmir_companion',
          onProgress: (p) => setUpdateProgress(p),
        });
      } catch (err) {
        setUpdateError(toMessage(err));
        throw err;
      } finally {
        setUpdateBusy(false);
        setUpdateProgress(null);
      }
    },
    [updateManifest]
  );

  useEffect(() => {
    const run = async () => {
      const result = await checkUpdate({ silent: true, force: false });
      if (!result?.available || !result.manifest) return;

      const lastNotified = await getLastNotifiedVersion();
      if (lastNotified !== null && result.manifest.versionCode <= lastNotified) return;
      await setLastNotifiedVersion(result.manifest.versionCode);

      onBackgroundUpdateAvailable?.({
        manifest: result.manifest,
        canInstall,
        install: () => downloadAndInstallUpdate(result.manifest),
      });
    };

    run();
  }, [canInstall, checkUpdate, currentBuildVersionCode, downloadAndInstallUpdate, onBackgroundUpdateAvailable]);

  return {
    currentBuildVersionCode,
    currentAppVersion,
    canInstall,
    updateManifest,
    updateAvailable,
    updateError,
    updateBusy,
    updateProgress,
    checkUpdate,
    downloadAndInstallUpdate,
  };
}
