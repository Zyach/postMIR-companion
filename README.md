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

## Indicadores en tarjetas (app movil)

Los siguientes indicadores estan pensados para responder: "que orden necesito para entrar?".

- **Cierre (año)**: mayor orden que entro en ese centro en el año seleccionado. Cuanto mas bajo, mas competitivo.
- **Top requerido (%)**: `cierre / total_MIR_año`. Ej: 30% significa que necesitas estar dentro del 30% mejor.
- **IQR (p25-p75)**: rango intercuartil de ordenes del centro. Mide variabilidad; si es estrecho, el cierre es mas estable.
- **N plazas**: numero de ordenes/plazas observadas en el año. A mayor N, mas confiable.
- **Cierre mediano 3 años**: mediana de cierres 2023-2025. Resumen robusto del nivel real.
- **Top mediano 3 años**: mediana del porcentaje requerido en 3 años (normaliza por el total MIR).
- **Tendencia 3 años**: diferencia entre cierre mas reciente y mas antiguo. Negativo = mas competitivo con el tiempo.
- **N años**: numero de años con datos disponibles (cuando se ve el modo 3 años).

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
