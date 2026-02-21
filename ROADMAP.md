# Roadmap del Proyecto

Fecha base: 2026-02-21

## Ahora (0-2 semanas)
- Consolidar validacion de dataset (duplicados, rangos anomales, consistencia entre campos).
- Mostrar metadatos del dataset en UI (fecha, hash, tamano) para trazabilidad.
- Documentar definiciones estadisticas en `mobile/README.md` (si no esta ya).

## Proximo (2-6 semanas)
- Mejorar performance en movil (cache compacta o SQLite local si el dataset crece).
- Añadir tests de integracion ligeros para Streamlit (smoke test de carga).
- Añadir snapshot simple de cards en movil (regresion visual basica).

## Medio plazo (6-12 semanas)
- Panel de tendencias por especialidad/CCAA (agregados estadisticos).
- Exportacion con presets y nomenclatura consistente por filtros.
- Mejora de observabilidad: versionado del dataset y changelog en releases.

## Largo plazo
- Actualizacion mayor de Expo/RN cuando se planifique ventana de migracion.
- Pipeline de ingestion con validaciones automatizadas y reportes de calidad.
