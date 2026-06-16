# Demo 14 — Reporte Diario Gerencial

**Fecha:** 2026-06-16 · **Rama:** `develop`

## Motivación

El dueño de Botas Agroindustrial revisa a diario un Excel maestro hecho a mano:
producción por célula/día, kardex de inventario en proceso, pares vendidos + valor,
y metas vs. real por célula con % de cumplimiento. Esta demo replica ese reporte —
"el que le gusta ver" — pero generado solo desde los datos que ya captura el sistema
(escaneo por célula, kardex, facturación), y lo supera con tiempo real y edición de metas.

El dashboard de la Demo 11 (`/inicio`) tiene KPIs **distintos** (pedidos, cartera,
pares en proceso); NO replicaba este reporte. Demo 14 lo cubre.

## Alcance (decidido con el cliente interno)

- **Metas modeladas**: nuevo modelo `Meta` configurable → habilita el % de cumplimiento.
- **Columnas sin captura aún** (EXTERNO, SEGUNDAS, SERVICIOS/MANTENIMIENTO): se muestran
  en **0 con nota honesta**, igual que el Excel, para que el dueño reconozca su reporte
  completo y se entienda qué falta definir. Filosofía del proyecto: "fiel pero honesto",
  sin datos falsos.

## Qué se construyó

### Backend (NestJS + Prisma)
- **Schema**: `model Meta(anio, mes, tipo, valor)` + `enum TipoMeta` (GUARNICION,
  INYECCION, FACTURACION_PARES, FACTURACION_VALOR). Unique `(anio, mes, tipo)`.
  Migración `demo14_metas`.
- **Núcleo puro** `reportes/reporte-diario-core.ts` (sin Prisma/Nest, 12 tests):
  - `columnaDeCelula` (CORTE→troquelado, GUARNICION→guarnicion, ALMACEN→almacen,
    INYECCION→inyeccion, PT→bodega), `claveDia` (UTC), `pctCumplimiento` (meta 0 → 0).
  - `construirReporte`: filas por día del mes + acumulado + bloque de metas con % +
    kardex de PT (arrastra saldo día a día). Guarnición cuenta **solo el sub-paso AMARRE**
    (salida real de la célula) para no sobrecontar los sub-pasos.
  - Columnas pendientes en 0 vía `COLUMNAS_PENDIENTES`.
- **Service** `ReportesService` (3 tests): `diario(anio, mes)` con `Promise.all` de
  EventoTrazabilidad + Factura (pares = Σ líneas, **valor = subtotal sin IVA** para comparar
  contra la meta comercial) + MovimientoInventario PT + saldo previo (groupBy) + Meta.
  `listarMetas` / `guardarMetas` (upsert por `anio_mes_tipo`).
- **Controller** `GET /reportes/diario?anio&mes`, `GET /reportes/metas`, `PUT /reportes/metas`
  (DTO `GuardarMetasDto` validado). Periodo por defecto = mes actual (UTC).
- Registrado en `app.module.ts`.

### Frontend (Angular 19 + signals)
- Modelos espejo `core/api/models/reporte-diario.models.ts` + `ReportesApi` (2 tests).
- `features/reportes/reporte-diario.component` (5 tests):
  - 4 tarjetas de metas con barra de % (verde ≥100, ámbar <100).
  - Tabla estilo Excel (día × columnas) con fila **ACUMULADO** resaltada; columnas
    EXTERNO/SEGUNDAS atenuadas con tooltip "Pendiente de captura" + nota honesta.
  - Sección **Kardex de PT** (saldo inicial/ingreso/venta/devolución/saldo final).
  - Selector de mes (`input[type=month]`) y **drawer "Editar metas"** (reusa `ui-drawer`).
- Ruta `/reportes/diario` + ítem "Reporte diario" en el sidebar.

### Seed (Demo 14)
- **Metas reales del Excel del dueño**: Guarnición 20.160, Inyección 20.160,
  Facturación 30.240 pares / $1.445.895.360.
- Actividad a escala real: OP 9014 con ~19.926 pares producidos en 14 días hábiles
  (cantidades ≈ Excel, ~1.440/día), eventos por célula (en lotes), movimiento de
  producción agregado por día + saldo inicial de bodega 30.000. 3 cadenas
  OC→OP→Despacho→Factura (9015-9017, Despacho tiene `opId` único) = 25.500 pares vendidos
  al precio medio implícito en la meta ($47.814 = $1.445.895.360 / 30.240).
- Idempotente; la limpieza de la 9014 va antes del borrado global de máquinas/operarios.

## Verificación

- **263 tests backend + 189 frontend verdes**; ambos builds limpios.
- **E2E (API)**: `GET /reportes/diario` con seed → acumulado guarnición 19.924 /
  inyección 19.923 / bodega 19.923, pares vendidos 25.500, valor $1.219.257.000; metas
  **98.8% / 98.8% / 84.3% / 84.3%** (casi calcadas al Excel real: 99.8 / 106.7 / 85.4 /
  84.1%); kardex PT arranca en 30.000 y termina en 24.420. Latencia ~1,0 s con ~100k
  eventos; dashboard/fabricación siguen <0,1 s (sin degradación por el volumen).
- **E2E (browser)**: login → `/reportes/diario` renderiza metas, tabla con ACUMULADO y
  kardex; drawer de metas precarga y guarda (PUT) y recarga. Screenshots
  `demo14-reporte-diario.png` + `demo14-metas-drawer.png`.

## Pendiente / futuro

- Merge `develop`→`master` `--no-ff` + tag `demo-14` (al mostrar la demo).
- Definir con el cliente: qué es **EXTERNO** (¿tercerización?) y si **Servicios y
  Mantenimiento** entra al alcance de facturación. Modelar **SEGUNDAS** como categoría
  de calidad vendible.
- Bloques WIP de Guarnición/Almacén-cortes del Excel (hoja 2) no modelados como kardex;
  hoy se ven como producción por célula en la tabla diaria.
