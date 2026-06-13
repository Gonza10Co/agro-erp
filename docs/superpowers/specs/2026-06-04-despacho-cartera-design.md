# Diseño — Despacho + regla de cartera · Demo 3

**Fecha:** 2026-06-04
**Branch:** `feat/despacho-cartera`
**Módulo:** Despacho (cierra el ciclo del pedido) + regla de bloqueo por cartera.
**Estado previo:** el ciclo OC→OP→amarre está implementado (Demo 1, en master). El amarre ya reserva PT en `InventarioPT` vía `ReservaInventarioPT`. El schema ya tiene `Cliente.estadoCartera` (AL_DIA/VENCIDO/BLOQUEADO), `InventarioPT` (cantDisponible/cantReservada) y un sistema de roles (`Role`/`User`, `role` en el JWT, `RolesGuard` + `@Roles`).

## 1. Objetivo

Permitir **despachar una OP** (total, en un acto) descontando el inventario reservado, dejando un **documento de Despacho** trazable. Aplicar la **regla estrella**: si el cliente está **VENCIDO/BLOQUEADO**, el despacho se **bloquea**; solo lo libera un **gerente** con autorización en un paso (registrando quién/cuándo/motivo). Decisiones tomadas en brainstorming (2026-06-04).

## 2. Alcance

**Incluye:** despacho total por OP; gate de cartera por `estadoCartera`; override de gerente en un paso; documento `Despacho` + líneas; descuento de inventario consumiendo reservas; cambios de estado (OP→DESPACHADA, OC→CERRADA); UI de despacho desde el detalle de OP + listado de despachos.

**No incluye:** despacho parcial (varias remisiones); chequeo de `cupo` (monto de crédito); facturación; el ajuste "días retenidos por pago no suman al tiempo de entrega" (es métrica de lead-time, va con reportería); despacho de OPs con producción pendiente (requiere MES).

**Precondición de alcance:** solo se despachan OPs **totalmente amarradas** (todas las líneas con `cantAProducir == 0`); la parte "a producir" llega con el MES.

## 3. Flujo

```
OP (AMARRADA, totalmente amarrada)
   │  POST /despachos { opId, autorizar?, motivo? }
   ▼
[ gate cartera ]  cliente.estadoCartera
   ├ AL_DIA ──────────────► procede
   └ VENCIDO/BLOQUEADO ───► 409  (salvo autorizar=true + rol GERENTE/ADMIN)
   ▼ (transacción)
   1. por cada ReservaInventarioPT de la OP:
        InventarioPT.cantDisponible -= cant ; cantReservada -= cant ; borra la reserva
   2. crea Despacho + DespachoLinea (snapshot producto/talla/bodega/cant)
   3. OP → DESPACHADA ; OC → CERRADA
   4. si hubo override: guarda autorizadoPor + motivo + fecha
```

## 4. Cambios de schema (una migración)

```prisma
enum EstadoOP { CREADA AMARRADA EN_PRODUCCION DESPACHADA ANULADA }  // + DESPACHADA

model Despacho {
  id                 Int             @id @default(autoincrement())
  consecutivo        Int             @unique
  opId               Int             @unique           // 1 despacho por OP (total)
  op                 OrdenProduccion @relation(fields: [opId], references: [id])
  fecha              DateTime        @default(now())
  autorizadoPorId    Int?
  autorizadoPor      User?           @relation(fields: [autorizadoPorId], references: [id])
  motivoAutorizacion String?
  createdAt          DateTime        @default(now())
  lineas             DespachoLinea[]
}

model DespachoLinea {
  id                    Int                 @id @default(autoincrement())
  despachoId            Int
  despacho              Despacho            @relation(fields: [despachoId], references: [id])
  productoConfiguradoId Int
  productoConfigurado   ProductoConfigurado @relation(fields: [productoConfiguradoId], references: [id])
  tallaId               Int
  talla                 Talla               @relation(fields: [tallaId], references: [id])
  bodegaId              Int
  bodega                Bodega              @relation(fields: [bodegaId], references: [id])
  cantidad              Int

  @@index([despachoId])
}
```
Relaciones inversas a agregar: `OrdenProduccion.despacho Despacho?`, `User.despachosAutorizados Despacho[]`, y las inversas en `ProductoConfigurado`/`Talla`/`Bodega` para `DespachoLinea[]`.

## 5. Backend (módulo nuevo `despachos`)

```
POST /despachos        body { opId: number, autorizar?: boolean, motivo?: string }   (JwtAuthGuard)
GET  /despachos        lista: { id, consecutivo, fecha, opConsecutivo, cliente, autorizado }
GET  /despachos/:id    detalle con líneas
```

- **`DespachoService.despachar(dto, user)`** (el controller pasa `req.user`, que trae `role` y `sub`):
  1. Carga la OP con `lineas.tallas`, `lineas.tallas.reservas.inventarioPT`, `oc.cliente`.
  2. **Precondición:** OP en estado `AMARRADA`, sin `Despacho` previo, y **totalmente amarrada** (toda línea-talla con `cantAProducir == 0`). Si no → `409` con mensaje específico.
  3. **Gate cartera:** si `cliente.estadoCartera ∈ {VENCIDO, BLOQUEADO}`:
     - `!autorizar` → `409` `"Cliente con cartera ${estado} — requiere autorización del gerente"`.
     - `autorizar` y `user.role ∉ {GERENTE, ADMIN}` → `403`.
     - en otro caso → procede y setea `autorizadoPorId = user.sub`, `motivoAutorizacion = motivo`.
  4. **Transacción** `prisma.$transaction`:
     - por cada reserva de la OP: `InventarioPT.update` (`cantDisponible -= cant`, `cantReservada -= cant`); `ReservaInventarioPT.delete`.
     - crea `Despacho` + `DespachoLinea[]` (snapshot agregado por producto/talla/bodega desde las reservas).
     - `OP.estado = DESPACHADA`; `OC.estado = CERRADA`.
     - genera `consecutivo` con el mismo patrón que OC/OP (max+1 dentro de la transacción).
- **Helper puro `construirLineasDespacho(reservas)`** → mapea/agrupa reservas a líneas de despacho; testeable sin DB.
- **Gate de autorización**: la verificación de rol se hace en el servicio (necesita combinar con la regla de cartera); el endpoint queda con `JwtAuthGuard` y el rol se lee de `req.user.role`.

## 6. Frontend

```
features/despachos/
  despachos-list.component.ts          (+ ruta /despachos + nav "Despachos")
core/api/despachos.api.ts              (+ modelos DespachoListItem, DespacharParams)
features/pedidos/op/op-detalle.component.ts   (MODIFICAR: acción "Despachar")
core/auth/auth.service.ts              (MODIFICAR: getter rol() desde el JWT)
```

- **OP detalle:** botón **"Despachar"** visible cuando la OP está `AMARRADA` y totalmente amarrada (y sin despacho).
  - Éxito → navega a `/despachos`.
  - `409` de cartera → **banner** "Cliente con cartera vencida — despacho bloqueado". Si `auth.rol() ∈ {GERENTE, ADMIN}`: muestra input *motivo* + botón **[Autorizar y despachar]** → re-`POST` con `autorizar: true, motivo`.
  - Otros errores → mensaje inline.
- **Despachos list:** tabla densa (consecutivo, fecha, OP, cliente, "autorizado" badge si hubo override). Reusa `estado-badge`/estilos del DS.
- **`AuthService.rol()`**: decodifica el payload del JWT (campo `role`) ya almacenado; sin llamada extra.

## 7. Manejo de errores / edge cases

| Caso | Resultado |
|------|-----------|
| OP no totalmente amarrada | 409 "OP con producción pendiente; no se puede despachar" |
| OP ya despachada / estado != AMARRADA | 409 "OP ya despachada o no amarrada" |
| Cartera VENCIDO/BLOQUEADO sin autorizar | 409 (banner en UI) |
| `autorizar: true` sin rol GERENTE/ADMIN | 403 |
| 401 | interceptor global existente |
| Inventario insuficiente | No debería ocurrir (se despacha lo reservado); la transacción garantiza atomicidad |

## 8. Testing

- **Backend:**
  - `construirLineasDespacho` (puro): agrupa reservas a líneas correctas.
  - `despachar` (prisma mock + `$transaction`): happy path AL_DIA (descuento + estados + despacho creado); VENCIDO sin autorizar → 409; VENCIDO + autorizar + GERENTE → ok + registra `autorizadoPor`/`motivo`; autorizar sin rol → 403; OP no totalmente amarrada → 409; OP ya despachada → 409.
- **Frontend:**
  - `DespachosApi` (HttpTestingController): POST/GET con params.
  - `op-detalle`: acción despachar éxito (navega) + bloqueo cartera (muestra banner; gerente ve autorizar).
  - `despachos-list`: render de filas + badge autorizado.
- **E2E manual:** login; OP de cliente AL_DIA → Despachar → aparece en /despachos, inventario descontado, OP DESPACHADA / OC CERRADA. OP de cliente VENCIDO → bloqueo; login como gerente → Autorizar y despachar → procede con motivo registrado.

## 9. Seed (`seed-demo`)

Para demostrar **ambos caminos**:
- rol `GERENTE` + usuario `gerente / gerente123`.
- un cliente **AL_DIA** con una OP totalmente amarrada (camino feliz).
- un cliente **VENCIDO** con otra OP totalmente amarrada (camino bloqueado → autorizar).
(Reusa el stock PT existente del seed; agrega lo mínimo para que ambas OPs queden 100% amarradas.)

## 10. Fuera de alcance (futuro)

- Despacho parcial / múltiples remisiones.
- Chequeo de `cupo` (monto de crédito) además de `estadoCartera`.
- Facturación (el Despacho es el gancho).
- Ajuste de lead-time por días retenidos en cartera (reportería).
- Despacho de la porción "a producir" (depende del MES).
