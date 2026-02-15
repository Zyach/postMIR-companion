import { useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import * as Application from 'expo-application';

import { useAppUpdate, type UseAppUpdateBackgroundArgs } from '@/hooks/use-app-update';
import { UpdateError } from '@/services/app-update';

export type UseUpdatesResult = ReturnType<typeof useUpdates>;

export function useUpdates(manifestUrl: string) {
  const showUpdateInstallError = useCallback((err: unknown) => {
    const message = err instanceof Error && err.message ? err.message : 'Error al descargar/instalar';
    const isSecurityError =
      err instanceof UpdateError &&
      (err.code === 'INTEGRITY_MISMATCH' || err.code === 'MANIFEST_INVALID' || err.code === 'CRYPTO_UNSUPPORTED');
    const addUnknownAppsHint =
      err instanceof UpdateError ? err.code === 'INSTALL_FAILED' || err.code === 'UNKNOWN' : false;

    const details =
      isSecurityError || !addUnknownAppsHint
        ? message
        : `${message}\n\nEn Android, puede que tengas que permitir "Instalar apps desconocidas" para esta app.`;
    Alert.alert('Actualizaciones', details);
  }, []);

  const onBackgroundUpdateAvailable = useCallback(
    ({ manifest, canInstall, install }: UseAppUpdateBackgroundArgs) => {
      Alert.alert(
        'Actualizacion disponible',
        `Hay una nueva version (build ${manifest.versionCode}).`,
        [
          { text: 'Mas tarde', style: 'cancel' },
          ...(canInstall
            ? [
                {
                  text: 'Descargar',
                  onPress: () => {
                    void install().catch(showUpdateInstallError);
                  },
                },
              ]
            : []),
        ]
      );
    },
    [showUpdateInstallError]
  );

  const {
    currentBuildVersionCode,
    currentAppVersion,
    canInstall: canInstallUpdate,
    updateManifest,
    updateAvailable,
    updateError,
    updateBusy,
    updateProgress,
    checkUpdate,
    downloadAndInstallUpdate,
  } = useAppUpdate({
    manifestUrl,
    onBackgroundUpdateAvailable,
  });

  const handleCheckUpdate = useCallback(async () => {
    await checkUpdate({ silent: false, force: true });
  }, [checkUpdate]);

  const handleDownloadAndInstallUpdate = useCallback(async () => {
    if (!updateManifest) {
      Alert.alert('Actualizaciones', 'No hay una actualizacion para descargar.');
      return;
    }
    if (!canInstallUpdate) {
      Alert.alert('Actualizaciones', 'La instalacion de APK solo esta disponible en Android.');
      return;
    }

    try {
      await downloadAndInstallUpdate();
    } catch (err) {
      showUpdateInstallError(err);
    }
  }, [canInstallUpdate, downloadAndInstallUpdate, showUpdateInstallError, updateManifest]);

  const versionLabel = useMemo(() => {
    const build = currentBuildVersionCode !== null ? ` (build ${currentBuildVersionCode})` : '';
    return `${currentAppVersion}${build}`;
  }, [currentAppVersion, currentBuildVersionCode]);

  return {
    currentBuildVersionCode,
    currentAppVersion,
    canInstallUpdate,
    updateManifest,
    updateAvailable,
    updateError,
    updateBusy,
    updateProgress,
    checkUpdate,
    downloadAndInstallUpdate,
    handleCheckUpdate,
    handleDownloadAndInstallUpdate,
    showUpdateInstallError,
    versionLabel,
  };
}
