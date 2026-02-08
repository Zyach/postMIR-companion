# Releasing (Android)

Este proyecto publica APKs via **EAS Build (Expo)** y las distribuye via **GitHub Releases**.

La app comprueba actualizaciones con:

- `https://github.com/zyach/postMIR-companion/releases/latest/download/latest.json`

Y el manifest debe apuntar al APK estable:

- `https://github.com/zyach/postMIR-companion/releases/latest/download/postmir-companion.apk`

## Requisitos

- Incrementar `expo.android.versionCode` en `app.json` en cada release.
- Mantener `eas.json` con `appVersionSource: local` para respetar `versionCode`.
- Tener credenciales Android en EAS (remote) para el profile `release`.

## Release manual (sin Actions)

1. Sube `versionCode`

Edita `app.json`:

- `expo.android.versionCode`: +1
- (opcional) `expo.version`

Atajo:

```bash
cd mobile
npm run release:bump -- --dry-run
npm run release:bump
```

2. Lanza build en Expo

```bash
cd mobile
npx -y eas-cli build -p android --profile release --non-interactive
```

3. Descarga el APK de EAS (desde el dashboard) y guardalo como `postmir-companion.apk`.

4. Genera `latest.json`

```bash
cd mobile
npm run make:update-manifest -- \
  "https://github.com/zyach/postMIR-companion/releases/latest/download/postmir-companion.apk" \
  "Notas de la version" \
  > latest.json
```

5. Crea una GitHub Release y sube 2 assets

- `postmir-companion.apk`
- `latest.json`

La URL `releases/latest/download/latest.json` quedara actualizada automaticamente.

## Release con GitHub Actions (recomendado)

Este repo incluye un workflow que:

- Lanza build en EAS (`--profile release`)
- Descarga el APK resultante
- Genera `latest.json`
- Publica una GitHub Release con ambos assets

Configura primero los secrets en GitHub:

- `EXPO_TOKEN`: token de Expo con permisos para EAS.

Luego ejecuta el workflow **Android Release (EAS -> GitHub Releases)** desde la pestaña Actions.
