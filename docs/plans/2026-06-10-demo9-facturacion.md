# Demo 9 — Facturación · Implementation Plan

> **For agentic workers:** TDD task-by-task. Test primero, implementación mínima, commit frecuente.
> Mensajes de commit y comentarios en español. Steps con checkbox (`- [ ]`).

**Goal:** Cerrar el ciclo del pedido. Sobre un `Despacho` ya emitido, generar una **Factura**
(`POST /facturas`) que valoriza lo realmente despachado usando el **precio pactado en la línea de OC**,
calcula subtotal + IVA + total, y queda consultable. Se captura el precio en el wizard de OC.

**Decisiones de diseño (cerradas con el cliente/Gonza):**
- El **precio unitario vive en la línea de OC** (`OrdenCompraLinea.precioUnitario`), un precio por par
  del producto, igual para todas sus tallas. Es lo fiel a make-to-order: cada pedido se cotiza.
- La **factura nace de un Despacho** (1 Despacho → 1 Factura). La cantidad facturada = lo despachado
  (no lo pedido), porque el despacho es lo que salió de bodega.
- **IVA 19%** por defecto (botas de seguridad gravan IVA en CO), configurable por parámetro.
  Sin retenciones por ahora (futuro; se anota).
- Estados de factura: `EMITIDA` / `ANULADA`.
- Consecutivo `factura` vía `siguienteConsecutivo()` (secuencia PG) — NUNCA `_max + 1`.

**Tech Stack:** NestJS + Prisma + Jest (back); Angular 19.2 standalone + signals, Karma/Jasmine (front). DS "Acero".

**Spec:** `docs/specs/2026-06-10-demo9-facturacion-design.md` (a crear junto con este plan).

---

## File Structure

```
backend/prisma/
  schema.prisma                ← MODIFICAR: precioUnitario en OrdenCompraLinea;
                                  modelos Factura + FacturaLinea; enum EstadoFactura
  migrations/<ts>_demo9_facturacion/  ← migrate dev

backend/src/pedidos/oc/
  dto/crear-oc.dto.ts          ← MODIFICAR: precioUnitario en CrearOCLineaDto
  oc.service.ts                ← MODIFICAR: guardar precioUnitario al crear; incluir en obtener()
  oc.service.spec.ts           ← MODIFICAR: cubre persistencia del precio

backend/src/facturas/          ← CREAR módulo
  factura-core.ts(+spec)       ← puro: lineasDeFactura(despacho, preciosPorProducto) + totales(lineas, ivaPct)
  factura.service.ts(+spec)    ← facturar(despachoId, ivaPct?), listar(), obtener(id)
  factura.controller.ts        ← POST /facturas, GET /facturas, GET /facturas/:id
  factura.module.ts
  dto/facturar.dto.ts          ← { despachoId: number; ivaPct?: number }
backend/src/app.module.ts      ← MODIFICAR: registrar FacturasModule
backend/src/prisma/consecutivo.ts ← MODIFICAR si hace falta registrar la secuencia 'factura'
backend/prisma/seed*.ts        ← MODIFICAR: precios en la OC demo (para que la factura no salga en $0)

frontend/src/app/
  core/api/models/pedidos.models.ts  ← MODIFICAR: precioUnitario en línea OC; modelos Factura/FacturaLinea
  core/api/facturas.api.ts(+spec)    ← CREAR: facturar(), listar(), obtener()
  features/pedidos/oc/oc-crear.util.ts(+spec)   ← MODIFICAR: precio en LineaWizard + construirDto
  features/pedidos/oc/oc-crear.component.ts(+spec) ← MODIFICAR: input de precio por producto en el wizard
  features/pedidos/oc/oc-detalle.component.ts   ← MODIFICAR: mostrar precio/subtotal por línea + total OC
  features/facturas/facturas-list.component.ts(+spec) ← CREAR: listado
  features/facturas/factura-detalle.component.ts(+spec) ← CREAR: detalle (líneas + subtotal/iva/total) en drawer
  features/despachos/despachos-list.component.ts ← MODIFICAR: botón "Facturar" (o link a factura existente)
  app.routes.ts                ← MODIFICAR: ruta /facturas
  layout/…/sidebar             ← MODIFICAR: ítem "Facturas" en el menú
```

Reusa sin tocar: `ui-drawer`, `estado-badge`, `kv-list`, clases del DS, `DespachoService.obtener`.

---

# BACKEND

## Task 1 — Schema + migración (precio en OC, Factura, FacturaLinea)
- [ ] `OrdenCompraLinea`: `precioUnitario Decimal? @db.Decimal(14,2)` (nullable: OCs viejas no tienen).
- [ ] `enum EstadoFactura { EMITIDA ANULADA }`.
- [ ] `model Factura { id, consecutivo @unique, despachoId @unique, despacho, fecha @default(now()),
      subtotal/iva/total Decimal(14,2), ivaPct Decimal(5,2), estado EstadoFactura @default(EMITIDA),
      createdAt, lineas FacturaLinea[] }`.
- [ ] `model FacturaLinea { id, facturaId, factura, productoConfiguradoId, tallaId, cantidad,
      precioUnitario Decimal(14,2), subtotal Decimal(14,2) }`.
- [ ] Relación inversa `factura Factura?` en `Despacho`.
- [ ] `npx prisma migrate dev --name demo9_facturacion`.

## Task 2 — Núcleo puro `factura-core.ts` (TDD)
- [ ] Test primero: `lineasDeFactura(despachoLineas, preciosPorProductoId)` → arma cada línea con
      `precioUnitario` y `subtotal = cantidad * precio`; lanza si falta precio de un producto.
- [ ] `totales(lineas, ivaPct)` → `{ subtotal, iva, total }` (redondeo a 2 decimales, en centavos para evitar floats).
- [ ] Implementación mínima. Sin Prisma.

## Task 3 — `FacturaService.facturar` + listar/obtener (TDD, prisma mock)
- [ ] Test: facturar un despacho válido crea Factura EMITIDA con consecutivo, líneas y totales.
- [ ] Test: despacho ya facturado → `BadRequestException`.
- [ ] Test: línea sin precio pactado en OC → `BadRequestException` (mensaje claro).
- [ ] `facturar(despachoId, ivaPct = 19)`: carga despacho→op→oc→lineas (para precios) + despacho.lineas;
      mapea precio por `productoConfiguradoId`; `$transaction`: `siguienteConsecutivo(tx,'factura')` + create.
- [ ] `listar()` (consecutivo desc, cliente + total) y `obtener(id)` (líneas con producto/talla).

## Task 4 — Controller + módulo + wiring
- [ ] `POST /facturas` (JwtGuard), `GET /facturas`, `GET /facturas/:id`.
- [ ] Registrar `FacturasModule` en `app.module.ts`.
- [ ] Asegurar secuencia `factura` en `consecutivo.ts` / migración de secuencias.

## Task 5 — Precio en crear OC + seed (TDD)
- [ ] `CrearOCLineaDto.precioUnitario` (`@IsOptional @Min(0)` o requerido — requerido para confirmar).
- [ ] `OcService.crear` persiste `precioUnitario`; `obtener()` lo devuelve.
- [ ] Seed demo: precios reales en la OC de ejemplo para que el flujo facture > $0.

---

# FRONTEND

## Task 6 — Modelos + `FacturasApi` (TDD HttpTestingController)
- [ ] Modelos `Factura`, `FacturaLinea`; `precioUnitario` en línea OC.
- [ ] `facturar(despachoId)`, `listar()`, `obtener(id)` contra `http://localhost:3001`.

## Task 7 — Precio en el wizard de OC (TDD)
- [ ] `LineaWizard.precio`; `construirDto` incluye `precioUnitario`.
- [ ] Input de precio por producto en el paso de productos/revisar; validación > 0 para avanzar.
- [ ] `oc-detalle`: columna precio + subtotal por línea + total de la OC.

## Task 8 — Listado + detalle de Factura (TDD)
- [ ] `facturas-list` (tabla densa: consecutivo, fecha, cliente, total, estado-badge).
- [ ] `factura-detalle` en drawer (líneas + subtotal/IVA/total).
- [ ] Ruta `/facturas` + ítem en el sidebar.

## Task 9 — Botón "Facturar" desde Despacho (TDD)
- [ ] En `despachos-list`: acción "Facturar" → `POST /facturas` → navega/abre la factura.
- [ ] Si el despacho ya tiene factura, mostrar link a ella en vez del botón.

## Task 10 — Verificación E2E + cierre de demo
- [ ] `npm test` (back + front) verde; `ng build` limpio.
- [ ] E2E manual (Playwright/manual): Nueva OC con precios → confirmar → OP → (producir/amarrar) →
      despachar → **Facturar** → ver factura con total correcto.
- [ ] Actualizar `docs/ESTADO.md`. Merge `develop`→`master` `--no-ff` + tag `demo-9`.

---

## Riesgos / notas
- **ESTADO.md está desfasado** (al 04-jun, no refleja Demos 5–8). Actualizar al cerrar.
- Solo existe tag `demo-1`; hay demos sin taguear. Encarar al hacer el merge a master.
- Decimales: operar en centavos (enteros) en el núcleo puro para evitar errores de float; persistir Decimal.
- Retenciones (reteFuente/reteIVA/reteICA) quedan FUERA de alcance — futuro.
- `start:dev` del backend crashea: usar `npm run build && npm run start:prod` (deuda conocida).
