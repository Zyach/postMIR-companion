# postMIR-companion

Proyecto para explorar plazas PostMIR:

- UI web (Streamlit) para consulta rapida del dataset local.
- App movil (Expo / Android) en `mobile/` con filtros, exportacion y auto-update por APK.

Archivos relevantes:

- `plazas_orden_ultimo_ano.csv` – dataset base
- `plazas.db` – base SQLite persistente (se regenera si cambia el CSV)
- `app.py` – UI con filtros dinámicos (Streamlit + SQLite)
- `query.py` – consultas rápidas por CLI
- `build_db.py` – genera/actualiza la base SQLite

## UI web (Streamlit)

Uso rapido (UI):

```
streamlit run app.py
```

Uso rapido (CLI):

```
python3 query.py \
  --year 2025 \
  --specialty "NEUROLOGIA" \
  --specialty "PSIQUIATRIA" \
  --specialty "PSIQUIATRIA INFANTIL Y DE LA ADOLESCENCIA" \
  --specialty "NEUROFISIOLOGIA CLINICA"
```

Generar base SQLite manualmente:

```
python3 build_db.py

## App movil

Codigo en `mobile/`.

- Dev: `npm install` y `npx expo start` dentro de `mobile/`.
- Builds y auto-update: ver `mobile/README.md`.
```
