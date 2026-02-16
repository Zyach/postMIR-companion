# Release Runbook (Android APK via EAS)

> Nota: En este host `eas-cli` vía npx no produce salida. Ejecuta en un entorno con npm/npx funcionales. `latest.json` está ignorado por git; no se comprometen artefactos.

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
4) Versionado: `app.json`/`package.json` en 1.0.3, `versionCode`=7 (ajusta si publicas otro build).

## Build firmado (EAS)
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
