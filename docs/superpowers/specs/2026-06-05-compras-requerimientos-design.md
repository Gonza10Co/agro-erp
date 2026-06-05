# Diseño — Compras / Requerimientos de material · Demo 4

**Fecha:** 2026-06-05
**Branch:** `feat/compras-requerimientos`
**Módulo:** Compras (aprovisionamiento). Calcula, desde una OP, qué insumos hay que comprar.
**Estado previo:** el ciclo OC→OP→amarre PT está implementado (Demo 1, en master); el Configurador de BOM (Demo 2) y Despacho + cartera (Demo 3) están en `develop`. El schema ya tiene `Material.origen` (COMPRADO/FABRICADO), BOM con consumo por talla (`BomLineaTalla`) + `consumoFijo`/`mermaPct`, y `OrdenProduccionLineaTalla.cantAProducir` (lo que falta fabricar tras el amarre). **No existe** ningún modelo de proveedor, ni inventario de insumos (solo `InventarioPT` = producto terminado), ni compra a proveedor (la `OrdenCompra` del schema es la del **cliente**).

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
GET  /proveedores              → lista (+ CRUD básico: POST/PATCH; JwtAuthGuard)
GET  /inventario-material      → lista stock de insumos (para verlo en la demo)
```

- **Helper puro `explotarBom(lineasOpConTallas, bomsPorReferencia, materialesById)`** → devuelve `Map<materialId, Decimal>` con la **necesidad bruta** por material COMPRADO. Recursivo, multinivel, con:
  - consumo por talla desde `BomLineaTalla` (clase `CURVA`) o `consumoFijo` (clase `FIJO`);
  - factor de merma `× (1 + mermaPct)` aplicado en **cada nivel** (cascada);
  - **guard anti-ciclo**: `Set` de `materialId` en la rama de recursión actual; si un FABRICADO se referencia (directa o transitivamente) a sí mismo → corta esa rama y lo registra (no explota infinito).
  - Es **puro y testeable sin DB** (recibe BOMs y materiales ya cargados).
- **`ComprasService.calcularRequerimiento(opId)`**:
  1. Carga la OP con `lineas.productoConfigurado.referencia`, `lineas.tallas` (con `cantAProducir`).
  2. Carga los BOMs necesarios (de las referencias y, transitivamente, de los materiales FABRICADO) + materiales con `origen`/`proveedorId`.
  3. `explotarBom(...)` → bruto por material.
  4. Carga `InventarioMaterial` de esos materiales → `disponible` (0 si no hay registro).
  5. `neto = max(0, bruto − disponible)` por material.
  6. **Transacción:** crea `RequerimientoCompra` + `RequerimientoCompraLinea[]` (snapshot necesaria/disponible/aComprar + proveedorId del material); `consecutivo` = max+1 dentro de la transacción (mismo patrón que OC/OP/Despacho).
  7. Devuelve el requerimiento **agrupado por proveedor** (incluye un grupo "Sin proveedor" para comprados sin `proveedorId`).
- **Decimal:** usar `Prisma.Decimal` en la acumulación para evitar errores de punto flotante en consumos/mermas.

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
  - `explotarBom` (puro, sin DB) — **el test clave**:
    - una línea COMPRADO con curva por talla → cantidad correcta;
    - `consumoFijo` (clase FIJO) → no depende de talla;
    - **merma en cascada** → `× (1 + mermaPct)` aplicada en cada nivel;
    - **multinivel** → un FABRICADO explota su BOM y acumula sus comprados con consumos multiplicados;
    - **ciclo** → no entra en loop infinito, corta la rama.
  - `calcularRequerimiento` (prisma mock + `$transaction`): bruto − stock = neto; agrupación por proveedor; "Sin proveedor"; OP 100% amarrada → vacío; genera consecutivo.
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
