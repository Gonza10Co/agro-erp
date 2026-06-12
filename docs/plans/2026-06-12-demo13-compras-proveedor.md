# Demo 13 — Compras lado proveedor (OC proveedor + recepción parcial + devolución) · Implementation Plan

> **For agentic workers:** TDD task-by-task. Test primero, implementación mínima, commit frecuente.
> Mensajes de commit y comentarios en español. Steps con checkbox (`- [ ]`).

**Goal:** Cerrar la cadena de compras que hoy muere en el requerimiento: del **Requerimiento** se
generan **Órdenes de Compra a Proveedor (OCP)** — una por proveedor — con **estados**
(PENDIENTE → PARCIAL → COMPLETA); cada llegada de mercancía se registra como **recepción
(parcial o total)** que alimenta `InventarioMaterial` y el **kardex** (motivo `COMPRA`); y la
**devolución a proveedor** por calidad descuenta stock y queda en el kardex
(motivo `DEVOLUCION_PROVEEDOR`). Cubre el hueco #3 del kickoff (logística inversa de compras).

**Decisiones de diseño:**
- **OCP separada de la OC del cliente** (`OrdenCompraProveedor`): dominios distintos, no se mezclan.
  Consecutivo propio `ocp` vía `siguienteConsecutivo`.
- **Estado derivado de las líneas**, nunca seteado a mano: `PENDIENTE` (nada recibido), `PARCIAL`
  (algo recibido, falta algo), `COMPLETA` (todas las líneas con `cantRecibida ≥ cantPedida`).
  Núcleo puro `estadoOcp(lineas)`. (ANULADA queda como futuro; no se pidió en el kickoff.)
- **Recepción = documento hijo** (`RecepcionCompra` + líneas por línea de OCP). N recepciones por
  OCP → backorder natural ("pido 200, llegan 100"). Cada recepción, en una tx: valida contra lo
  pendiente, incrementa `cantRecibida`, hace upsert de `InventarioMaterial` y crea
  `MovimientoInventario` ENTRADA/COMPRA con referencia `OCP-n` — reusa el patrón de Demo 12.
- **Sobre-recepción rechazada** (400): no se puede recibir más de lo pendiente por línea.
- **Devolución a proveedor** (`DevolucionProveedor` + líneas por material): descuenta
  `InventarioMaterial` (guarda de stock `gte`, como Demo 12) + `MovimientoInventario`
  SALIDA/DEVOLUCION_PROVEEDOR. **No toca `cantRecibida` ni el estado de la OCP**: la mercancía
  llegó; la devolución es el movimiento inverso documentado (con `causa`). Nota crédito del
  proveedor = tema contable (Gálago), fuera de alcance.
- **Generar OCPs desde el requerimiento**: 1 OCP por proveedor con las líneas `cantAComprar > 0`.
  Materiales **sin proveedor asignado** no generan OCP → se devuelven como advertencia (el cliente
  debe asignar proveedor en el catálogo). El requerimiento pasa a estado `CON_ORDEN`.
- Cantidades `Decimal(14,4)` (MP se compra en metros/kilos); en API y front se manejan como number.

**Tech Stack:** NestJS + Prisma + Jest (back); Angular 19.2 standalone + signals, Karma/Jasmine (front). DS "Acero".

**Spec:** este plan (sin doc de diseño aparte).

---

## File Structure

```
backend/prisma/
  schema.prisma                  ← MODIFICAR: enum EstadoOrdenCompraProveedor; models
                                   OrdenCompraProveedor(+Linea), RecepcionCompra(+Linea),
                                   DevolucionProveedor(+Linea); EstadoRequerimiento += CON_ORDEN;
                                   relaciones en Proveedor/Material/RequerimientoCompra/User
  migrations/<ts>_demo13_compras_proveedor/

backend/src/compras/
  compras-proveedor-core.ts(+spec)  ← CREAR puro: estadoOcp(lineas), validarRecepcion(lineasOcp,
                                      lineasDto), validarDevolucion(lineasDto)
  compras-proveedor.service.ts(+spec) ← CREAR: generarDesdeRequerimiento, listar, obtener,
                                      registrarRecepcion, registrarDevolucion
  compras.controller.ts          ← MODIFICAR: POST /requerimientos/:id/ordenes,
                                   GET /compras/ordenes (+/:id),
                                   POST /compras/ordenes/:id/recepciones,
                                   POST /compras/ordenes/:id/devoluciones
  compras.module.ts              ← MODIFICAR: providers += ComprasProveedorService
  dto/registrar-recepcion.dto.ts ← CREAR { observaciones?, lineas: [{ ocpLineaId, cantidad }] }
  dto/registrar-devolucion.dto.ts← CREAR { causa, observaciones?, lineas: [{ materialId, cantidad }] }
backend/prisma/seed-demo.ts      ← MODIFICAR: OCP demo con recepción parcial (estado PARCIAL visible)

frontend/src/app/
  core/api/models/compras.models.ts ← MODIFICAR: Ocp, OcpLinea, Recepcion, Devolucion, etc.
  core/api/compras.api.ts(+spec)    ← MODIFICAR: generarOrdenes(reqId), listarOrdenes(),
                                      obtenerOrden(id), registrarRecepcion(), registrarDevolucion()
  features/compras/ocp-list.component.ts(+spec)     ← CREAR: tabla OCPs (estado badge, % recibido)
  features/compras/ocp-detalle.component.ts(+spec)  ← CREAR: líneas pedido/recibido/pendiente +
                                                      recepciones + devoluciones + acciones (drawers)
  features/compras/requerimiento.component.ts       ← MODIFICAR: botón "Generar órdenes de compra"
  app.routes.ts                  ← MODIFICAR: rutas /compras/ordenes y /compras/ordenes/:id
  layout/shell/shell.component.ts← MODIFICAR: ítem "Compras" en el menú
```

Reusa: `ui-drawer`, `estado-badge`, clases del DS, patrón kardex/guarda de stock de Demo 12.

---

# BACKEND

## Task 1 — Schema + migración
- [ ] Enum `EstadoOrdenCompraProveedor { PENDIENTE PARCIAL COMPLETA }`; `EstadoRequerimiento += CON_ORDEN`.
- [ ] `model OrdenCompraProveedor { consecutivo @unique, proveedorId, requerimientoId?, estado @default(PENDIENTE), fecha, observaciones?, lineas[], recepciones[], devoluciones[] }`.
- [ ] `model OrdenCompraProveedorLinea { ocpId, materialId, cantPedida Decimal(14,4), cantRecibida Decimal(14,4) @default(0) }`.
- [ ] `model RecepcionCompra { consecutivo @unique, ocpId, fecha, observaciones?, usuarioId?, lineas[{ ocpLineaId, cantidad }] }`.
- [ ] `model DevolucionProveedor { consecutivo @unique, ocpId, fecha, causa, observaciones?, usuarioId?, lineas[{ materialId, cantidad }] }`.
- [ ] `npx prisma migrate dev --name demo13_compras_proveedor`.

## Task 2 — Núcleo puro `compras-proveedor-core.ts` (TDD)
- [ ] `estadoOcp(lineas[{cantPedida, cantRecibida}])` → PENDIENTE | PARCIAL | COMPLETA.
- [ ] `validarRecepcion(lineasOcp, lineasDto)` → string | null: sin líneas; cantidad ≤ 0; línea
      inexistente; línea repetida; cantidad > pendiente (sobre-recepción).
- [ ] `validarDevolucion(lineasDto)` → string | null: sin líneas; cantidad ≤ 0; causa vacía;
      material repetido. (El stock se valida en la tx con la guarda `gte`.)

## Task 3 — `ComprasProveedorService` (TDD, prisma mock)
- [ ] `generarDesdeRequerimiento(reqId)`: 404 si no existe; 409 si ya está CON_ORDEN; agrupa líneas
      `cantAComprar > 0` por proveedor; tx: crea 1 OCP por proveedor (consecutivo `ocp`) + marca
      requerimiento CON_ORDEN; devuelve `{ ordenes, sinProveedor[] }`.
- [ ] `listar()`: OCPs con proveedor, estado, totales (Σ pedida, Σ recibida) y origen (REQ-n).
- [ ] `obtener(id)`: detalle con líneas (material, pedida, recibida, pendiente), recepciones y
      devoluciones; 404 si no existe.
- [ ] `registrarRecepcion(ocpId, dto, user)`: 404; 409 si COMPLETA; valida con el core (400);
      tx: consecutivo `recepcion`, crea RecepcionCompra+líneas, incrementa `cantRecibida`,
      upsert `InventarioMaterial`, crea movimientos ENTRADA/COMPRA (ref `OCP-n`), recalcula estado.
- [ ] `registrarDevolucion(ocpId, dto, user)`: 404; valida (400); tx: consecutivo `devolucion`,
      decrement con guarda `gte` (409 stock insuficiente), crea DevolucionProveedor+líneas +
      movimientos SALIDA/DEVOLUCION_PROVEEDOR (ref `OCP-n`).

## Task 4 — Controller + módulo + seed
- [ ] Endpoints (JwtGuard): `POST /requerimientos/:id/ordenes`, `GET /compras/ordenes`,
      `GET /compras/ordenes/:id`, `POST /compras/ordenes/:id/recepciones`,
      `POST /compras/ordenes/:id/devoluciones`.
- [ ] DTOs con class-validator (ArrayMinSize, IsPositive, etc.).
- [ ] Seed demo: requerimiento de OP existente → OCP de "Cueros del Tolima" con recepción parcial
      (llega la mitad) → estado PARCIAL + kardex con la entrada. Idempotente.

---

# FRONTEND

## Task 5 — Modelos + `ComprasApi` (TDD HttpTestingController)
- [ ] Modelos `OcpResumen`, `OcpDetalle`, `OcpLinea`, `RecepcionCompra`, `DevolucionProveedor`,
      `ResultadoGenerarOrdenes`.
- [ ] `generarOrdenes(reqId)`, `listarOrdenes()`, `obtenerOrden(id)`,
      `registrarRecepcion(ocpId, dto)`, `registrarDevolucion(ocpId, dto)`.

## Task 6 — `ocp-list` + ruta + menú (TDD)
- [ ] Tabla: OCP-n, proveedor, origen REQ-n, fecha, **estado badge**, recibido/pedido (con barra %).
- [ ] Fila → `/compras/ordenes/:id`. Ruta + ítem "Compras" en el sidebar.

## Task 7 — `ocp-detalle` + drawers de recepción y devolución (TDD)
- [ ] Cabecera (OCP-n, proveedor, estado, origen) + tabla de líneas (pedida/recibida/**pendiente**).
- [ ] Historial: recepciones (REC-n, fecha, líneas) y devoluciones (DEV-n, causa).
- [ ] Drawer **"Registrar recepción"**: inputs por línea pendiente (prellenados con lo pendiente),
      valida ≤ pendiente → POST → refresca.
- [ ] Drawer **"Devolución a proveedor"**: causa (obligatoria) + cantidades por material recibido
      → POST → refresca.
- [ ] Botón **"Generar órdenes de compra"** en `requerimiento.component` (oculto si CON_ORDEN);
      muestra advertencia de materiales sin proveedor; navega al listado de OCPs.

## Task 8 — Verificación E2E + cierre
- [ ] `npm test` (back + front) verde; ambos builds limpios.
- [ ] E2E (API + browser): requerimiento → generar OCPs → recepción parcial (estado PARCIAL,
      kardex ENTRADA/COMPRA, stock sube) → segunda recepción (COMPLETA) → devolución por calidad
      (stock baja, kardex SALIDA/DEVOLUCION_PROVEEDOR). Sobre-recepción → 400.
- [ ] Actualizar `docs/ESTADO.md`. (Merge a master + tag `demo-13` al mostrar la demo.)

---

## Riesgos / notas
- `Decimal(14,4)` ↔ number en la API: usar `Number()` al serializar (patrón Demo 12).
- La guarda de stock de la devolución es `updateMany ... gte` (no leer-y-escribir): evita carreras.
- Materiales sin proveedor: el flujo no debe romperse — advertir y seguir (asignación de proveedor
  es del catálogo, no de esta demo).
- `start:dev` del backend crashea: usar `build` + `start:prod` (deuda conocida; limpiar
  tsbuildinfo + dist si dist/main no aparece).
