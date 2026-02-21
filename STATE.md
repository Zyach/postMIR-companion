# Estado del Proyecto

Fecha: 2026-02-21

## Resumen ejecutivo
El proyecto esta operativo y mantiene dos superficies principales:

- App movil (Expo/React Native) con filtros, exportacion y auto-update.
- UI web (Streamlit) para consultas rapidas sobre SQLite local.

Se han mejorado las tarjetas de plazas con indicadores mas utiles para decidir
el orden necesario y se han añadido tests unitarios sobre la logica estadistica.
El pipeline de CI y el de release ahora validan dichas metricas para evitar
regresiones.

## Cambios recientes (codigo)
- Cards con metricas normalizadas y comparables entre anos.
- Layout en grid para lectura rapida de metricas por centro.
- Modulo dedicado de metricas puras para testeo (`mobile/hooks/dataset-metrics.ts`).
- Tests unitarios de estadistica (`mobile/tests/dataset-metrics.test.ts`).
- Integracion del test de metricas en CI y en el workflow de release.

## Por que estos cambios son una mejora
- **Decisiones mas informadas**: el usuario ve cierre, top requerido, IQR y N plazas
  (y en modo 3 anos, mediana, top mediano y tendencia), lo que reduce sesgos por
  outliers de un solo ano.
- **Comparabilidad**: el uso de `Top requerido` normaliza por el total MIR anual,
  haciendo comparables anos con distinta oferta.
- **Confiabilidad**: `IQR` y `N plazas` dan contexto sobre variabilidad y solidez
  del cierre observado.
- **Calidad tecnica**: las metricas estan en un modulo testable y el test corre en
  CI y en release, lo que protege de regresiones silenciosas.

## Salud del proyecto (hoy)
- CI: lint Expo + smoke updater + test metricas + validacion CSV.
- Release: EAS build con generacion de `latest.json`.
- Datos: CSV -> SQLite con validacion basica.

## Riesgos conocidos
- Dependencias con vulnerabilidades transitorias en tooling (npm audit). El fix
  completo requiere bump mayor de React Native (no recomendado ahora).
- El build en EAS puede fallar si se excede el plan Free (limite mensual).

## Siguientes pasos inmediatos (no ejecutados)
- Consolidar QA de datos (duplicados, rangos anomales, consistencia entre campos).
- Opcional: optimizar almacenamiento local del dataset en la app movil.
