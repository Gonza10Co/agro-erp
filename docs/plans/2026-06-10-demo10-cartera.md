# Demo 10 — Cartera / Cuentas por cobrar · Implementation Plan

> **For agentic workers:** TDD task-by-task. Test primero, implementación mínima, commit frecuente.
> Mensajes de commit y comentarios en español. Steps con checkbox (`- [ ]`).

**Goal:** Convertir cada factura emitida en una **cuenta por cobrar** con vencimiento y saldo,
permitir **registrar pagos/abonos**, y hacer que el **estadoCartera del cliente se calcule solo**
(vencido si tiene saldo vencido) — alimentando la **regla de bloqueo de despacho que ya existe**.
Cierra el círculo financiero: OC → … → Factura → **Cartera** → (des)bloqueo de despacho.

**Decisiones de diseño:**
- **Pago por factura** (cada factura es una CxC; los pagos se imputan a una factura). Sin abonos a
  cuenta global por ahora (futuro).
- **`fechaVencimiento` se persiste en la Factura** al emitir = `fecha + díasCrédito(tipoCredito del cliente)`
  (CONTADO=0, D30=30, D60=60, D90=90). Fijo y auditable; no depende de re-leer el cliente.
- **Saldo factura** = `total − Σ pagos`. Una factura está **saldada** cuando saldo ≤ 0.
- **estadoCartera del cliente** (se recalcula y persiste al emitir factura y al registrar pago):
  - `BLOQUEADO` (override manual del gerente) tiene prioridad y se respeta.
  - sino `VENCIDO` si tiene ≥1 factura con saldo > 0 y `hoy > fechaVencimiento`.
  - sino `AL_DIA`.
  - El núcleo recibe `hoy` como parámetro (testeable); el service pasa la fecha real.
  - Limitación conocida: el estado solo cambia ante eventos (pago/factura/consulta de cartera),
    no por el mero paso del tiempo — un cron lo cerraría (futuro). El `GET /cartera` recalcula.
- La **regla de bloqueo de despacho NO cambia** (sigue leyendo `cliente.estadoCartera`); ahora ese
  campo es real porque cartera lo mantiene al día.

**Tech Stack:** NestJS + Prisma + Jest (back); Angular 19.2 standalone + signals, Karma/Jasmine (front). DS "Acero".

**Spec:** este plan (sin doc de diseño aparte).

---

## File Structure

```
backend/prisma/
  schema.prisma                ← MODIFICAR: model Pago; fechaVencimiento en Factura; pagos Pago[]
  migrations/<ts>_demo10_cartera/

backend/src/facturas/
  factura.service.ts(+spec)    ← MODIFICAR: al emitir, calcular fechaVencimiento (tipoCredito del cliente)
                                  + recalcular estadoCartera del cliente
backend/src/cartera/           ← CREAR módulo
  cartera-core.ts(+spec)       ← puro: diasCredito, saldoFactura, estadoCartera(facturas, hoy, bloqueado),
                                  resumenCartera (facturado/pagado/saldo/saldoVencido)
  cartera.service.ts(+spec)    ← registrarPago(facturaId, monto), listar(), obtenerCliente(id);
                                  recalcula+persiste estadoCartera
  cartera.controller.ts        ← GET /cartera, POST /cartera/pagos, GET /cartera/cliente/:id
  cartera.module.ts
  dto/registrar-pago.dto.ts    ← { facturaId, monto, medio? }
backend/src/app.module.ts      ← MODIFICAR: registrar CarteraModule
backend/prisma/seed-demo.ts    ← MODIFICAR: 1 factura vencida (fecha pasada, sin pago) para demostrar bloqueo

frontend/src/app/
  core/api/models/pedidos.models.ts ← MODIFICAR: fechaVencimiento en Factura; Pago; CarteraItem; ResumenCliente
  core/api/cartera.api.ts(+spec)    ← CREAR: listar(), registrarPago(), obtenerCliente()
  features/cartera/cartera-list.component.ts(+spec)   ← CREAR: CxC (factura, vencimiento, saldo, estado);
                                                        vencidas resaltadas; botón "Registrar pago"
  features/cartera/registrar-pago.component.ts(+spec) ← CREAR: form de pago (en drawer)
  app.routes.ts                ← MODIFICAR: ruta /cartera
  layout/shell/shell.component.ts ← MODIFICAR: ítem "Cartera" en el menú
```

Reusa: `ui-drawer`, `estado-badge` (o badge inline), clases del DS, `FacturasApi` si conviene.

---

# BACKEND

## Task 1 — Schema + migración
- [ ] `model Pago { id, facturaId, factura Factura @relation, monto Decimal(14,2), fecha @default(now()), medio String?, createdAt }`.
- [ ] `Factura`: `fechaVencimiento DateTime?` (nullable: facturas viejas) + `pagos Pago[]`.
- [ ] `npx prisma migrate dev --name demo10_cartera` (+ `prisma generate`).

## Task 2 — Núcleo puro `cartera-core.ts` (TDD)
- [ ] `diasCredito(tipoCredito)` → 0/30/60/90.
- [ ] `saldoFactura(total, pagos[])` → total − Σ monto (redondeo 2 dec).
- [ ] `estadoCartera(facturas[{fechaVencimiento, saldo}], hoy, bloqueadoManual)` → AL_DIA|VENCIDO|BLOQUEADO.
- [ ] `resumenCartera(facturas[])` → { facturado, pagado, saldo, saldoVencido }.

## Task 3 — Factura emite con vencimiento + recalcula cartera (TDD)
- [ ] `facturar`: incluir `cliente` (tipoCredito, estadoCartera) en la carga; setear `fechaVencimiento`.
- [ ] Tras crear la factura, recalcular y persistir `estadoCartera` del cliente (en la misma tx).
- [ ] Tests actualizados (la factura ahora guarda fechaVencimiento).

## Task 4 — `CarteraService` (TDD, prisma mock)
- [ ] `registrarPago(dto)`: 404 si factura no existe; 400 si monto ≤ 0 o > saldo; crea Pago;
      recalcula+persiste estadoCartera del cliente; devuelve saldo nuevo.
- [ ] `listar()`: facturas con saldo > 0 → { facturaId, consecutivo, cliente, total, pagado, saldo,
      fechaVencimiento, vencida(hoy) }.
- [ ] `obtenerCliente(id)`: facturas + pagos + resumen.

## Task 5 — Controller + módulo + seed
- [ ] `GET /cartera`, `POST /cartera/pagos`, `GET /cartera/cliente/:id` (JwtGuard).
- [ ] Registrar `CarteraModule` en `app.module.ts`.
- [ ] Seed: una factura **vencida** (fecha −45 días, sin pago) para un cliente → demuestra bloqueo real.

---

# FRONTEND

## Task 6 — Modelos + `CarteraApi` (TDD HttpTestingController)
- [ ] Modelos `Pago`, `CarteraItem`, `ResumenCliente`; `fechaVencimiento` en `Factura`.
- [ ] `listar()`, `registrarPago()`, `obtenerCliente()`.

## Task 7 — `cartera-list` (TDD)
- [ ] Tabla de CxC: factura, cliente, vencimiento, total, pagado, **saldo**, estado (al día/vencida).
- [ ] Filas **vencidas resaltadas**; totales arriba (saldo total / saldo vencido).
- [ ] Botón "Registrar pago" por fila → abre drawer.

## Task 8 — `registrar-pago` (TDD)
- [ ] Form en drawer: monto (≤ saldo), medio (opcional) → `POST /cartera/pagos` → refresca lista.
- [ ] Ruta `/cartera` + ítem en el sidebar.

## Task 9 — Verificación E2E + cierre
- [ ] `npm test` (back + front) verde; `ng build` limpio.
- [ ] E2E (API + browser): emitir factura → aparece en Cartera con saldo y vencimiento →
      registrar pago → saldo baja → al saldar, estadoCartera AL_DIA. Cliente con factura vencida →
      al intentar despachar otra OP pide autorización (loop cerrado).
- [ ] Actualizar `docs/ESTADO.md`. (Merge a master + tag `demo-10` al mostrar la demo.)

---

## Riesgos / notas
- Decimales en centavos en el núcleo puro; persistir Decimal.
- El recálculo de estadoCartera por paso del tiempo necesitaría un cron (futuro); hoy se recalcula
  ante eventos y en `GET /cartera`.
- `start:dev` del backend crashea: usar `build` + `start:prod` (deuda conocida; limpiar tsbuildinfo + dist si dist/main no aparece).
