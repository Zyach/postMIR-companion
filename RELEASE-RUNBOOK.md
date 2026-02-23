# Release Runbook (Android APK)

> Nota: `latest.json` está ignorado por git; no se comprometen artefactos. Evita subir logs que contengan secretos. `.code/` esta ignorado para prevenir filtraciones locales.

## Prechecks
1) Cargar credenciales (no imprimir valores):
```bash
set -a; source ~/github-actions-android.env; set +a
for v in EXPO_TOKEN ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
  [ -n "${!v:-}" ] || { echo "Falta $v"; exit 1; }
done
```
2) Entorno: Node 18/20 con npm/npx funcionales (sin contenedores basta).
3) Dependencias: `cd mobile && npm ci`.
4) Versionado: `app.json`/`package.json` y `versionCode` deben incrementarse en cada release.

## Ruta recomendada (GitHub Actions)
Workflow: `.github/workflows/android-local-build.yml`

1) GitHub Actions -> **Android Local Build (GitHub Actions)** -> *Run workflow*.
2) Opcional: completa `notes` (changelog). Es opcional.
3) El workflow:
   - Hace `release:bump`.
   - Compila APK con EAS local en runner x86_64.
   - Genera `latest.json`.
   - Publica GitHub Release con ambos artefactos.

Requisitos en Secrets del repo:
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `EXPO_TOKEN` (opcional para build local, recomendado)

## Build firmado (EAS cloud)
Nota: el plan Free puede bloquear builds. Usar solo si hay cuota.

Opción rápida (bump + build):
```bash
cd mobile
npm run --silent release:build > eas-build.json
```

Opción manual:
```bash
cd mobile
npx -y eas-cli build -p android --profile release --non-interactive --wait --json > eas-build.json
```
Éxito: `eas-build.json` contiene `artifacts.buildUrl`.
Fallo: si no se genera JSON o no hay stdout, aborta y usa otro host/toolchain.

## Descargar APK y SHA256
```bash
APK_URL=$(jq -r '.[0].artifacts.buildUrl // .artifacts.buildUrl' eas-build.json)
[ -n "$APK_URL" ] || { echo "No APK_URL"; exit 1; }
curl -L "$APK_URL" -o postmir-companion.apk
SHA256=$(sha256sum postmir-companion.apk | awk '{print $1}')
echo "SHA256=$SHA256"
```

## Generar manifest `latest.json`
```bash
./scripts/local-release.sh postmir-companion.apk \
  "https://github.com/Zyach/postMIR-companion/releases/latest/download/postmir-companion.apk" \
  "Notas de la version"
```
Salida: `mobile/latest.json` (git-ignored).

## Validación
```bash
jq -e '.sha256|length==64' mobile/latest.json >/dev/null
sha256sum postmir-companion.apk | grep $(jq -r .sha256 mobile/latest.json)
```
Opcional: `npm run lint -- --max-warnings=0`, `npm run test:updater-smoke`, `python -m unittest tests.test_csv_validation`.

## Publicar (manual)
Sube a tu canal (p.ej. GitHub Releases): `postmir-companion.apk` y `mobile/latest.json`.

## Corte por fallo
- Si `eas-cli` no produce `eas-build.json` o `APK_URL`, NO continuar; cambia de host o depura npm/npx.
- Si el SHA no coincide, NO publicar; reconstruir.

## Nota sobre builds locales en ARM
Si usas `eas-cli build --local` en ARM, puede fallar por CMake x86_64 en el SDK.
La ruta recomendada es GitHub Actions (runner x86_64).
