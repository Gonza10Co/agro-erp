# PLAN — Entrega 5 (quincena del 2026-07-25 → ~08-08)

> Radiografía hecha contra el código real el 2026-07-25. Estimaciones en días de trabajo
> full-time de una persona. **Presupuesto neto: ~8,5 días** (10 hábiles − 1 de merge/deploy/
> seed/E2E/presentación − 0,5 de liberar gates el día de la demo).

## Recomendación: qué cabe de verdad

| Día | Bloque | Commit |
|---|---|---|
| 1 – 1,5 | **Metas por célula** | `feat(reportes): metas por célula` |
| 2 – 4,5 | **Segundas S1** (stock + captura) | `feat(calidad): segundas — stock y captura` |
| 4,5 – 8 | **Servicios / maquila Feroz** | `feat(facturas): factura de servicio (maquila Feroz)` |
| 8 – 9,5 | **Segundas S2** (venta) — *opcional, es el corte natural* | `feat(pedidos): venta de segundas` |
| 9,5 – 10 | Merge, deploy, seeds, E2E vivo, presentación, gates | |

**Fuera, explícitamente: Fase B completa** (consumo real por OF + amarre por célula) = 8-10 días,
se come la quincena y deja cero margen de demo. Además tiene un **bloqueador de negocio abierto
desde el 02-jul** (cómo nace el WIP), así que ni siquiera se puede modelar sin respuesta.

**Orden no negociable: metas PRIMERO.** Los tres temas aterrizan sobre los mismos 4 archivos
(`reporte-diario-core.ts`, `reportes.service.ts`, `reporte-diario.models.ts`,
`reporte-diario.component.ts`) y el refactor de metas es estructural: hacerlo después obliga a
tocar todo dos veces.

## Impacto en la demo

| Tema | Impacto | Por qué |
|---|---|---|
| **Servicios / Feroz** | 🟢 el más alto | convierte un **$0 que el cliente ya vio** en plata facturada |
| **Metas por célula** | 🟢 mejor ratio | es literalmente el Excel de don Gabriel: 7 tarjetas donde hoy hay 4, por 1,5 días |
| **Segundas S1** | 🟡 alto | desaparece la nota "*Externo y Segundas aún no se capturan*"; reproduce el 336 vs 263 real de Feroz |
| **Fase B** | 🔴 invisible | B1 es una fila más de kardex; B2 solo se vería con WIP cargado, y no hay |

---

## 1) Metas por célula — 1,5 días

**No agregar columna `celula` a `Meta`.** Dos de los cuatro `TipoMeta` (GUARNICION, INYECCION) ya
SON metas por célula. Migración aditiva `metas_por_celula`:
`ALTER TYPE "TipoMeta" ADD VALUE 'CORTE' / 'ALMACEN' / 'PT'`. El único `(anio,mes,tipo,lineaId)`
sigue sirviendo, el upsert manual también, y `Meta.lineaId` da gratis **metas por célula × línea**.

- El "real" contra el que comparar **ya existe para las 5 células**: `CELULA_A_COLUMNA`
  (`reporte-diario-core.ts:14-20`) y el conteo en `:148-153`.
- `BloqueMetas` pasa de 4 claves fijas a `{ celulas: {celula, meta, real, pct}[], … }` recorriendo
  `CELULA_A_COLUMNA` — **es un refactor que reduce código**. El drawer del front pasa de 4
  `[(ngModel)]` sueltos a un `@for`.
- Derivar la whitelist de `guardar-metas.dto.ts:4` del enum de Prisma, no duplicarla.

⚠️ **Riesgo que parece bug:** hoy "producción de Guarnición" cuenta **solo el sub-paso AMARRE**
(`reporte-diario-core.ts:149`), o sea capelladas terminadas. Si la meta del dueño es sobre lo que
*entra* al área, el % no va a cuadrar con su Excel. Preguntar antes.
Si las metas resultan **diarias** y no mensuales: `Meta.valorDiario` + semáforo por fila = **+1 día**.

## 2) Segundas S1 — 2,5 días (S2 = +1,5-2)

Hoy **no existe nada**: `reporte-diario-core.ts:60` tiene `segundas: number; // pendiente → 0`, y
`ClaseDano` solo conoce `BAJA` y `REPROCESO` (`schema.prisma:844-847`) — "queda de segunda" no es
un tercer camino.

El cliente las ve como **referencia paralela**; el sistema las produce como **atributo del par**.
Duplicar SKUs implicaría ×2 sobre 110 marcas y crear catálogo desde el flujo MES → se modela como
eje de calidad del stock.

Migración aditiva `segundas_calidad_pt`:
- `enum CalidadPT { PRIMERA, SEGUNDA }`; `InventarioPT.calidad` default PRIMERA y el único pasa a
  `(productoConfiguradoId, tallaId, bodegaId, calidad)`; `Par.calidad` (el grado se sella, no se infiere).
- `ALTER TYPE "ClaseDano" ADD VALUE 'SEGUNDA'` ⚠️ en **migración propia**: PG no deja usar un valor
  de enum en la misma transacción en que se agrega.
- `calidad.service.ts` — `marcarSegunda(par)` junto a `darDeBaja`, **sin** par de reposición.
- `fabricacion.service.ts:132-159` — el upsert de PT y el `MovimientoInventario` pasan `par.calidad` (3 líneas).
- 🚨 **Obligatorio, no opcional:** `op.service.ts:52-60` (el amarre, con su `FOR UPDATE`) **debe
  filtrar `calidad: 'PRIMERA'`** o un pedido normal se llenaría de segundas.

**Regalo gratis:** `MovimientoInventario.lineaId` ya está sellado ⇒ "SEGUNDAS FEROZ por línea"
sale sin código extra.

**S2 (venta):** `calidad` en `OrdenCompraLinea` / `DespachoLinea` / `FacturaLinea`; la clave de
agrupación de `despacho-lineas.ts:14` suma calidad (si no, una segunda y una primera colapsan en la
misma línea de remito) y el mapa de precios de `factura-core.ts:33-51` pasa a `(producto, calidad)`
(si no, la segunda sale al precio de la primera).

## 3) Servicios / maquila Feroz — 3 a 3,5 días

**La columna vertebral lo bloquea:** `Factura.despachoId` es `@unique` **NOT NULL**
(`schema.prisma:977-993`) → no hay factura sin despacho, y no hay despacho sin OP. `FacturaLinea`
exige producto + talla + cantidad. Por eso Feroz muestra $0 en el reporte por línea.

Migración aditiva `factura_servicio`:
- `enum TipoFactura { PRODUCTO, SERVICIO }`; `Factura.despachoId` → **nullable** (PG permite N NULLs
  bajo un único); `Factura.clienteId` **denormalizado** (backfill en la misma migración, luego NOT
  NULL); `Factura.lineaId?`; `model ServicioCatalogo`; `FacturaLinea.producto/talla` nullable +
  `servicioId?` + `descripcion?`.
- `POST /facturas/servicio` reusa `siguienteConsecutivo(tx,'factura')` (no parte la numeración),
  `totales()` de `factura-core.ts:54-59` tal cual y `recalcularEstadoCartera` ⇒ **los servicios
  entran a CxC gratis**.
- *Momento demo (0,5 d):* `GET /facturas/servicio/sugerencia?lineaId&anio&mes` cuenta los pares
  Feroz que llegaron a PT y prellena: *"Feroz inyectó 2.016 pares este mes → factura por $X"*.

⚠️ **Costo escondido, no subestimar:** volver `despachoId` nullable **rompe 4 consultas de cartera**
que hoy navegan `factura.despacho.op.oc` (`cartera.service.ts:21,36,60-62,75,90` y
`recalcular-cartera.ts:20`). Todas pasan a `where: { clienteId }`. Refactor limpio, ~medio día con specs.

## 4) Fase B — Entrega 6, con spec propio (8-10 días)

- **El agujero, con comentario propio en el código** (`despacho.service.ts:129-131`): la MP nunca se
  descuenta. El sistema **jamás** escribe un `MovimientoInventario` con `CONSUMO_PRODUCCION` — solo
  lo hacen el seed y el endpoint manual.
- **B1 (3 d):** extraer la explosión de BOM de `compras.service.ts:45-70` a un helper puro
  compartido (impuesto obligatorio), `model ConsumoOF`, backflush al cerrar el par + pantalla
  planeado-vs-real (sin la pantalla, B1 es invisible).
- **B2 (5-7 d):** `InventarioWIP` + `ReservaWIP` calcados de `InventarioPT`; `amarre.ts:26-53` pasa
  de función a **cascada** PT → WIP INYECCIÓN → ALMACÉN → GUARNICIÓN → CORTE → producir. Hoy **todo
  `Par` cuelga de una OF que cuelga de una OP** (FKs NOT NULL): no hay forma de representar "9.815
  pares en Almacén de Cortes sin dueño". Bloqueador abierto desde el 02-jul.
- Tampoco existe mapeo **material → célula**: el Excel del cliente sí lo tiene ("CENTRO DE COSTO"
  por insumo) pero no se importó.

---

## Preguntas para el cliente (ANTES de modelar)

**Segundas** — *bloquean la migración, no escribir el enum sin esto:*
1. ¿Qué convierte un par en segunda y **en qué célula se decide**? ¿Solo en PT o también en guarnición/inyección?
2. ¿Se venden? ¿A quién y a qué precio: fijo, % de descuento, o negociado por pedido?
3. 🔑 ¿La segunda **conserva marca y referencia** o se despacha sin marquilla? *(Define todo: atributo del stock vs. SKU paralelo.)*
4. ¿Hay segundas de **corte o capellada** (WIP)? *(Si sí, el tema depende de Fase B.)*
5. ¿Misma bodega física o aparte? ¿Dentro del inventario PT del reporte o en bloque aparte?
6. ¿Una segunda se puede **reparar y volver a primera**?
7. ¿Quién autoriza marcarla: cualquier operario o solo gerente (como la baja)? ¿Exige acta?
8. ¿Hay **meta o tolerancia de % de segundas** por línea o célula?

**Servicios / maquila**
9. ¿A quién se le factura el servicio de Feroz? **Razón social y NIT** para crearlo como cliente.
10. ¿Cómo se cobra: por par inyectado, por lote, mensual fijo, o tarifa por referencia/talla?
11. 🔑 **¿Quién pone los materiales** (poliol, suela, PU)? *(Si los ponemos nosotros, la factura de servicio debería descargar inventario ⇒ dependencia con Fase B.)*
12. ¿Lleva IVA 19%? ¿Retenciones (reteFuente / ICA) visibles en el documento?
13. ¿Mismo consecutivo que las facturas de producto o serie propia? (su Excel usa RV / ELE / DV / NCE)
14. ¿Qué otros servicios se facturan? ¿La venta de marquillas/punteras/plantillas es servicio o es la línea de insumos?
15. ¿El servicio suma a la meta de facturación en valor de Feroz? ¿Y a la de pares, donde no hay pares vendidos?

**Metas por célula**
16. **Pasar la hoja/pestaña exacta** del Excel con las metas por célula (una foto sirve).
17. ¿Mensual, diaria o por turno? ¿Global, por línea, o ambas? *(Diaria = +1 día.)*
18. 🔑 ¿Qué cuenta como producción de Guarnición: **capelladas terminadas** (lo que el sistema mide hoy) o pares que entran al área?
19. ¿Hay meta para Corte, Almacén y PT/Empaque, o solo Guarnición e Inyección?
20. ¿Cambian mes a mes o son fijas del año? *(Define si hace falta "copiar mes anterior".)*

**Fase B** — *para cotizar la Entrega 6 con números:*
21. ¿Se corta contra pedido o **a stock**? Si es a stock, ¿ese corte tiene código/QR por par desde que nace, o solo cantidad por talla?
22. ¿Se puede tomar un corte/capellada del stock para un pedido de **otra marca**?
23. ¿Quién registra hoy el consumo de insumos y cuándo? (la pestaña SALIDAS tiene 2.470 filas)
24. 🔑 ¿El sistema **descarga solo** por BOM (backflush) o el almacenista **registra lo que entregó**? *(La diferencia teórico-vs-real es el indicador; hay que saber cuál es la fuente de verdad.)*
25. ¿Quieren cargar el **WIP actual** como saldo inicial? (Almacén de Cortes: 9.815 pares)
