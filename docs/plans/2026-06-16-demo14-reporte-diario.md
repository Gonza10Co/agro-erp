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
  EventoTrazabilidad + Factura (pares = Σ líneas) + MovimientoInventario PT + saldo previo
  (groupBy) + Meta. `listarMetas` / `guardarMetas` (upsert por `anio_mes_tipo`).
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
- Metas del mes en curso (calibradas a ~76-80% de cumplimiento).
- Actividad distribuida: OP 9014 con 40 pares en 10 días (eventos por célula),
  movimientos de PT (producción + saldo inicial), y 3 cadenas OC→OP→Despacho→Factura
  (9015-9017, Despacho tiene `opId` único) = 19 pares vendidos en días dispersos.
- Idempotente; la limpieza de la 9014 va antes del borrado global de máquinas/operarios.

## Verificación

- **263 tests backend + 189 frontend verdes**; ambos builds limpios.
- **E2E (API)**: `GET /reportes/diario` con seed → acumulado troquelado 46 / guarnición 44
  / inyección 43 / bodega 43, pares vendidos 19, valor $1.921.850; metas 73.3% / 71.7% /
  76% / 80.1%; kardex PT arranca en 500 y arrastra.
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
