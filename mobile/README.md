# postMIR-companion (mobile)

App Android (Expo / React Native) para explorar plazas PostMIR, con filtros avanzados, exportacion y actualizacion por APK.

## Desarrollo

Instala dependencias:

```bash
npm install
```

Arranca Metro:

```bash
npx expo start
```

## Uso (en la app)

- Inicia sesion con email/contrasena.
- Pulsa **Cargar datos** para descargar y cachear el dataset.
- Usa filtros (especialidades, CCAA, provincia, ciudad, ano, rangos de orden y plazas).
- Exporta con **Exportar CSV** o **Exportar JSON**.

## Build APK (EAS)

Requiere `EXPO_TOKEN` o `eas login`.

```bash
npx -y eas-cli build -p android --profile preview
```

Notas:

- El `versionCode` (Android) se controla en `app.json` y debe incrementarse en cada release.
- `eas.json` esta configurado con `appVersionSource: local` para que se respete `versionCode`.

## Auto-update (APK)

La app comprueba actualizaciones en segundo plano al arrancar (cada ~6h) y tambien permite comprobar manualmente.

### Manifest esperado

La app consulta un JSON del estilo:

```json
{
  "versionCode": 4,
  "versionName": "1.0.0",
  "apkUrl": "https://.../postmir-companion.apk",
  "publishedAt": "2026-02-08T00:00:00Z",
  "notes": "Notas de la version"
}
```

Ejemplo:

- `docs/update-manifest.example.json`

Generador:

```bash
npm run make:update-manifest -- "https://.../postmir-companion.apk" "Notas de la version"
```

### GitHub Releases (recomendado)

Puedes alojarlo en GitHub Releases con 2 assets:

- `postmir-companion.apk`
- `latest.json`

Y apuntar la app a:

```
https://github.com/zyach/postMIR-companion/releases/latest/download/latest.json
```

La URL del APK dentro del manifest quedaria:

```
https://github.com/zyach/postMIR-companion/releases/latest/download/postmir-companion.apk
```
