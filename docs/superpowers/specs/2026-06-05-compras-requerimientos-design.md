# Diseño — Compras / Requerimientos de material · Demo 4

**Fecha:** 2026-06-05
**Branch:** `feat/compras-requerimientos`
**Módulo:** Compras (aprovisionamiento). Calcula, desde una OP, qué insumos hay que comprar.
**Estado previo:** el ciclo OC→OP→amarre PT está implementado (Demo 1, en master); el Configurador de BOM (Demo 2) y Despacho + cartera (Demo 3) están en `develop`. El schema ya tiene `Material.origen` (COMPRADO/FABRICADO), BOM con consumo por talla (`BomLineaTalla`) + `consumoFijo`/`mermaPct`, y `OrdenProduccionLineaTalla.cantAProducir` (lo que falta fabricar tras el amarre). **No existe** ningún modelo de proveedor, ni inventario de insumos (solo `InventarioPT` = producto terminado), ni compra a proveedor (la `OrdenCompra` del schema es la del **cliente**).

**Reuso clave (Demo 2):** la explosión BOM multinivel **ya existe y está testeada** en `backend/src/catalog/bom/`:
- `bom-resolver.ts` → `resolverBom(entrada)` orquesta `aplicarOverrides` (BOM efectivo según marca/opciones) + `explotarMultinivel` (recursivo, **con guard anti-ciclo**) + `consolidarComprados` (suma consumo por material COMPRADO **para una talla**, con merma aplicada). Funciones **puras**.
- `bom-loader.service.ts` → `BomLoaderService.cargarEntrada({ referenciaId, marcaId, opcionIds, talla })` carga desde Prisma todo lo necesario (BOM base, overrides, materiales con sub-BOMs) y devuelve la `EntradaResolucion` que consume `resolverBom`.

Por lo tanto Demo 4 **NO reimplementa el explotador**: lo **orquesta**. El cálculo de requerimiento = para cada (productoConfigurado, talla con `cantAProducir > 0`): `resolverBom` → `comprados[]` (consumo por par para esa talla) × `cantAProducir`, acumular por material, restar stock, agrupar por proveedor.

## 1. Objetivo

Desde una **OP**, calcular el **requerimiento de compra**: explotar el BOM de lo que falta producir (`cantAProducir`), sumar el consumo de cada insumo **COMPRADO** (incluyendo los comprados ocultos dentro de semielaborados **FABRICADO**, vía explosión multinivel), restar el stock de insumos disponible y mostrar el **neto a comprar agrupado por proveedor**. Decisiones tomadas en brainstorming (2026-06-05).

## 2. Alcance

**Incluye:** modelo `Proveedor` + proveedor preferido por material; modelo `InventarioMaterial` (stock de insumos, global por material); explosión **multinivel** del BOM (recursiva hasta material COMPRADO, con merma en cascada); cálculo de necesidad **neta** (bruta − stock); documento `RequerimientoCompra` + líneas persistido; disparo **por OP individual**; UI de requerimientos desde el detalle de OP, agrupada por proveedor; seed con proveedores, proveedor preferido en los comprados y stock de insumos.

**No incluye (futuro):** catálogo N:M material↔proveedor con precios/lead-time; cálculo **consolidado** multi-OP; **reserva** de stock de insumos (acá es solo lectura/snapshot); generación de una orden de compra formal al proveedor y su **recepción** (que sumaría stock); inventario de insumos por **bodega** (acá es global); costeo/valorización del requerimiento.

**Precondición de alcance:** se calcula sobre `cantAProducir > 0` de la OP. Si una OP quedó 100% amarrada (todo `cantAProducir == 0`) el requerimiento sale vacío (no hay nada que fabricar → nada que comprar).

## 3. Flujo

```
OP (con líneas-talla, cantAProducir > 0)
   │  POST /ops/:id/requerimiento
   ▼
[ explotar BOM multinivel ]  por cada (productoConfigurado, talla, cantAProducir):
   │   BOM de la referencia del producto
   │   explotar(bom, cantidad):
   │     por cada BomLinea:
   │       consumo  = curva[talla] (BomLineaTalla) ó consumoFijo
   │       efectivo = consumo × (1 + mermaPct) × cantidad
   │       material COMPRADO  → acumular(materialId, efectivo)
   │       material FABRICADO → explotar(bomDelMaterial, efectivo)   ← recursión
   │     guard anti-ciclo (Set de materiales en la rama actual)
   ▼
[ acumulado BRUTO por material COMPRADO ]
   │  restar InventarioMaterial.cantDisponible (snapshot, solo lectura)
   ▼  neto = max(0, bruto − disponible)
[ persistir ]  RequerimientoCompra + líneas (snapshot necesaria/disponible/aComprar + proveedorId)
   ▼
[ respuesta ]  líneas agrupadas por proveedor
```

## 4. Cambios de schema (una migración)

```prisma
enum EstadoRequerimiento { CALCULADO }   // simple; sin orden formal a proveedor en esta demo

model Proveedor {
  id        Int        @id @default(autoincrement())
  nit       String     @unique
  nombre    String
  ciudad    String?
  activo    Boolean    @default(true)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt

  materiales Material[]                 // materiales con este proveedor preferido
  lineasReq  RequerimientoCompraLinea[]
}

model InventarioMaterial {
  id             Int      @id @default(autoincrement())
  materialId     Int      @unique       // global, sin bodega (insumos en bodega MP única)
  material       Material @relation(fields: [materialId], references: [id])
  cantDisponible Decimal  @default(0)
  updatedAt      DateTime @updatedAt
}

model RequerimientoCompra {
  id          Int                 @id @default(autoincrement())
  consecutivo Int                 @unique
  opId        Int                                 // varios requerimientos por OP (recálculo)
  op          OrdenProduccion     @relation(fields: [opId], references: [id])
  fecha       DateTime            @default(now())
  estado      EstadoRequerimiento @default(CALCULADO)
  createdAt   DateTime            @default(now())

  lineas RequerimientoCompraLinea[]

  @@index([opId])
}

model RequerimientoCompraLinea {
  id              Int                 @id @default(autoincrement())
  requerimientoId Int
  requerimiento   RequerimientoCompra @relation(fields: [requerimientoId], references: [id])
  materialId      Int
  material        Material            @relation(fields: [materialId], references: [id])
  proveedorId     Int?                                 // snapshot del proveedor preferido
  proveedor       Proveedor?          @relation(fields: [proveedorId], references: [id])
  cantNecesaria   Decimal             // bruta explotada
  cantDisponible  Decimal             // snapshot del stock al calcular
  cantAComprar    Decimal             // neto = max(0, necesaria − disponible)

  @@index([requerimientoId])
}
```
Cambios en modelos existentes:
- `Material`: agregar `proveedorId Int?` + `proveedor Proveedor?` (preferido; solo se setea en COMPRADO), `inventario InventarioMaterial?`, `lineasReq RequerimientoCompraLinea[]`.
- `OrdenProduccion`: agregar inversa `requerimientos RequerimientoCompra[]`.

## 5. Backend (módulo nuevo `compras`)

```
POST /ops/:id/requerimiento   → calcula + persiste; devuelve el requerimiento agrupado por proveedor  (JwtAuthGuard)
GET  /requerimientos/:id       → detalle (agrupado por proveedor)
GET  /requerimientos?opId=     → lista de requerimientos de una OP
GET  /proveedores              → lista (solo lectura; el alta se hace por seed en esta demo)
GET  /inventario-material      → lista stock de insumos (para verlo en la demo)
```
> Todos bajo `JwtAuthGuard`. El **CRUD de proveedor por UI/API** (POST/PATCH) queda como mejora futura — para la demo basta con que el seed los cree.
```
```

- **Reuso (no reimplementar):** la explosión multinivel se hace con `resolverBom` + `BomLoaderService` de Demo 2. Para usar el loader fuera de `catalog`, **exportarlo**: agregar `exports: [BomLoaderService]` en `CatalogModule` e `imports: [CatalogModule]` en `ComprasModule`.
- **Helper puro nuevo `construirLineasRequerimiento(brutoPorMaterial, stockPorMaterial, proveedorPorMaterial)`** → recibe 3 `Map<number, ...>` (bruto acumulado, stock disponible, proveedorId) y devuelve `LineaRequerimientoData[]` con `{ materialId, proveedorId, cantNecesaria, cantDisponible, cantAComprar }` donde `cantAComprar = max(0, cantNecesaria − cantDisponible)`. Solo emite líneas con `cantNecesaria > 0`. **Puro, testeable sin DB.**
- **Helper puro nuevo `agruparPorProveedor(lineas, proveedoresById, materialesById)`** → agrupa `LineaRequerimientoData[]` en `{ proveedor: {id,nombre}|null, lineas: [...] }[]`; las de `proveedorId == null` van a un grupo final "Sin proveedor". Preserva orden estable. **Puro, testeable sin DB.**
- **`ComprasService.calcularRequerimiento(opId)`**:
  1. Carga la OP con `lineas.productoConfigurado` (incluye `referenciaId`, `marcaId`, `opciones.opcionId`) y `lineas.tallas` (con `cantAProducir` y `talla.valor`).
  2. Si no existe → `NotFoundException`. Si ninguna línea-talla tiene `cantAProducir > 0` → requerimiento vacío (sin tocar DB de cálculo; igual persiste cabecera vacía o devuelve vacío — ver paso 6).
  3. **Por cada** línea-talla con `cantAProducir > 0`: `entrada = await bomLoader.cargarEntrada({ referenciaId, marcaId, opcionIds, talla: valor })`; `{ comprados } = resolverBom(entrada)`; por cada `{ materialId, consumo }` acumular en `bruto` el valor `consumo × cantAProducir`.
  4. Carga `InventarioMaterial` de los materiales con bruto > 0 → `stock` (0 si no hay registro). Carga los materiales (para `proveedorId` y nombre) y proveedores.
  5. `lineas = construirLineasRequerimiento(bruto, stock, proveedorPorMaterial)`.
  6. **Transacción:** crea `RequerimientoCompra` + `RequerimientoCompraLinea[]` (snapshot necesaria/disponible/aComprar + proveedorId); `consecutivo` = `max+1` dentro de la transacción (patrón OC/OP/Despacho).
  7. Devuelve `{ id, consecutivo, opId, fecha, grupos: agruparPorProveedor(...) }`.
- **Números:** el resolver opera en `number` (igual que Demo 2); se persiste a columnas `Decimal` (Prisma acepta `number` al crear). No mezclar `Prisma.Decimal` en el cálculo.

## 6. Frontend

```
features/compras/
  requerimiento.component.ts            (vista del requerimiento agrupado x proveedor)
core/api/compras.api.ts                 (CompraApi: calcular/get requerimiento, proveedores)
features/pedidos/op/op-detalle.component.ts   (MODIFICAR: acción "Calcular requerimientos")
```

- **OP detalle:** botón **"Calcular requerimientos"** visible cuando la OP tiene `cantAProducir > 0` en alguna línea. Al hacer click → `POST /ops/:id/requerimiento` → navega/expande a la vista del requerimiento.
- **Vista requerimiento:** tabla **agrupada por proveedor** (header por proveedor), columnas `material · necesita · stock · a comprar`. Resalta `a comprar`. Grupo final "Sin proveedor" si aplica. Reusa estilos densos / tokens del DS (igual que despachos/pedidos).
- Si el requerimiento sale **vacío** (OP 100% amarrada) → estado vacío "Nada que comprar: la OP está completamente cubierta por inventario".

## 7. Manejo de errores / edge cases

| Caso | Resultado |
|------|-----------|
| OP inexistente | 404 |
| OP sin `cantAProducir > 0` | 200 con requerimiento vacío (estado vacío en UI) |
| Material COMPRADO sin `proveedorId` | línea va al grupo "Sin proveedor" (no es error) |
| Material FABRICADO sin BOM | se ignora su explosión + se loguea (warning); no rompe el cálculo |
| Ciclo en BOM multinivel | guard anti-ciclo corta la rama; no hay recursión infinita |
| Material sin `InventarioMaterial` | disponible = 0 → todo es a comprar |
| 401 | interceptor global existente |

## 8. Testing

- **Backend:**
  - La explosión multinivel (curva/fijo, merma en cascada, multinivel, ciclo) **ya está cubierta** por `bom-resolver.spec.ts` de Demo 2 — no se re-testea.
  - `construirLineasRequerimiento` (puro) — **test clave del módulo**: `cantAComprar = max(0, necesaria − disponible)`; stock ≥ necesaria → 0; sin registro de stock → todo a comprar; descarta materiales con `cantNecesaria == 0`.
  - `agruparPorProveedor` (puro): agrupa por proveedor; las de `proveedorId == null` caen en grupo "Sin proveedor" al final; orden estable.
  - `calcularRequerimiento` (prisma mock + `bomLoader` mock + `$transaction`): acumula `consumo × cantAProducir` por talla; bruto − stock = neto; persiste líneas + genera consecutivo; OP inexistente → 404; OP sin `cantAProducir > 0` → vacío.
- **Frontend:**
  - `CompraApi` (HttpTestingController): POST/GET con params.
  - `op-detalle`: acción "Calcular requerimientos" (navega/expande).
  - `requerimiento.component`: render agrupado por proveedor + columnas + estado vacío.
- **E2E manual:** login; OP con producción pendiente → "Calcular requerimientos" → tabla agrupada por proveedor con netos correctos; verificar que un insumo con stock suficiente sale en 0 / no aparece como a comprar; OP totalmente amarrada → estado vacío.

## 9. Seed (`seed-demo`)

Para demostrar el cálculo completo:
- 2–3 `Proveedor` (ej. una curtiembre, un proveedor de químicos PU, un proveedor de herrajes).
- `proveedorId` asignado a los materiales **COMPRADO** del seed actual (curtiembre→cueros, químicos→poliol/isocianato de la plantilla PU, etc.).
- `InventarioMaterial` con stock de algunos insumos (suficiente en uno → sale neto 0; parcial en otro → sale neto reducido; cero/sin registro en otro → todo a comprar).
- Asegurar al menos **un material FABRICADO con su BOM** entre los insumos (plantilla PU) para que la **explosión multinivel** se vea en la demo.
- Una OP con `cantAProducir > 0` (reusar/crear a partir del flujo OC→OP existente).

## 10. Fuera de alcance (futuro)

- Catálogo N:M material↔proveedor con precios y lead-time.
- Requerimiento **consolidado** multi-OP (agrega demanda para comprar en volumen).
- **Reserva** de stock de insumos (acá es snapshot de solo lectura).
- **Orden de compra formal** al proveedor + **recepción** que suma `InventarioMaterial`.
- Inventario de insumos por **bodega** (acá es global).
- Costeo/valorización del requerimiento (precios) → habilita reportería de gasto en compras.
