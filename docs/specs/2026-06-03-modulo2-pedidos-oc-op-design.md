# Módulo 2 — Pedidos (OC → OP → amarre de inventario PT)

> Diseño aprobado en brainstorming con Gonza el **2026-06-03**.
> Repo: `agro-erp` (NestJS + Prisma + PostgreSQL).
> Depende de: Módulo 1 (Catálogos + BOM) ya implementado.

## 1. Objetivo y alcance

Modelar el primer tramo de la columna vertebral del pedido:

```
OC  →  OP  →  (chequeo inventario PT, "amarre")  →  [OF / producción: fuera de alcance]
```

**Dentro del alcance:**
- Maestro de **Cliente** (hoy inexistente; `Marca.clienteId` apunta a él sin tabla).
- **Orden de Compra (OC)** del cliente como documento de primera clase, con líneas
  de `ProductoConfigurado` (Módulo 1) y curva de tallas.
- Generación de la **Orden de Producción (OP)** a partir de una OC confirmada (1:1).
- **Chequeo de inventario de Producto Terminado (PT)**: la OP "amarra" lo disponible
  y calcula lo que falta producir, por talla y bodega.
- Maestros de soporte: **Bodega** e **InventarioPT**.

**Fuera del alcance (módulos posteriores):**
- Generación de OF por célula y explosión de BOM contra inventario de insumos (Módulo MES/Fabricación).
- Inventario por etapas intermedias (cortes, capelladas).
- Integración contable / cartera real (Galago) — solo se deja el campo `estadoCartera`.
- Bloqueo de despacho por cartera vencida (Módulo Despacho/Cartera).

## 2. Decisiones de diseño (tomadas en brainstorming)

| Decisión | Elección | Razón |
|----------|----------|-------|
| Corte del módulo | OC → OP → chequeo inventario | Entrega enfocada; no se bloquea esperando definición de OF. |
| Relación OC↔OP | OC entidad de 1ª clase → genera OP (1:1) | Fiel al briefing; estructura limpia a futuro. |
| Línea de OC | `ProductoConfigurado` completo + curva de tallas | Aprovecha el resolvedor de BOM del Módulo 1 al 100%. |
| Inventario del chequeo | Solo Producto Terminado (por producto+talla+bodega) | Lo más simple y útil para arrancar; etapas intermedias en MES. |
| Multi-bodega | `Bodega.tipo` = PROPIA / HERMANA | Soporta el caso de bodegas de empresas hermanas (P6 a JP) sin rediseñar. |

## 3. Modelo de datos

```
NUEVAS ENTIDADES
┌─────────────┐
│  Cliente    │  NIT, nombre, ciudad, tipoCredito(CONTADO/30/60/90),
│  (maestro)  │  cupo, estadoCartera, activo   ← llena el clienteId huérfano de Marca
└──────┬──────┘
       │ 1
       │ N
┌──────▼────────────┐        genera        ┌────────────────────┐
│  OrdenCompra (OC) │ ───────1:1─────────▶ │ OrdenProduccion(OP)│
│  consecutivo int  │                       │  consecutivo int   │
│  ocCliente (texto)│                       │  ocId (FK)         │
│  fecha, estado    │                       │  fecha, estado     │
│  observaciones    │                       └─────────┬──────────┘
└──────┬────────────┘                                 │ 1
       │ 1                                             │ N
       │ N                                   ┌─────────▼───────────┐
┌──────▼──────────────┐    espejo de la OC   │ OrdenProduccionLinea│
│  OrdenCompraLinea   │ ───────────────────▶ │ productoConfiguradoId│
│  productoConfigId   │                       └─────────┬───────────┘
└──────┬──────────────┘                                 │ N
       │ N                                     ┌─────────▼──────────────┐
┌──────▼──────────────┐                        │ OPLineaTalla            │
│ OCLineaTalla        │                        │ tallaId, cantPedida,    │
│ tallaId, cantidad   │                        │ cantAmarrada, cantAProd │
└─────────────────────┘                        └─────────────────────────┘

INVENTARIO (mínimo, solo PT)
┌──────────┐        ┌──────────────────────────────────────┐
│ Bodega   │ 1───N  │ InventarioPT                          │
│ tipo:    │        │ productoConfigId + tallaId + bodegaId │
│ PROPIA/  │        │ cantDisponible, cantReservada         │
│ HERMANA  │        │ @@unique(productoConfig,talla,bodega) │
└──────────┘        └──────────────────────────────────────┘
```

### Entidades y campos

- **Cliente**: `id`, `nit (unique)`, `nombre`, `ciudad?`, `tipoCredito` (enum: CONTADO/D30/D60/D90),
  `cupo?` (decimal), `estadoCartera` (enum: AL_DIA/VENCIDO/BLOQUEADO, default AL_DIA), `activo` (default true).
  Relación: `1—N Marca` (captura maquila: cliente dueño de sus marcas), `1—N OrdenCompra`.
  → Resuelve el `clienteId` huérfano actual de `Marca`.

- **Bodega**: `id`, `codigo (unique)`, `nombre`, `tipo` (enum: PROPIA/HERMANA), `prioridad` (int, menor = primero), `activo`.

- **OrdenCompra (OC)**: `id`, `consecutivo (int, unique)`, `ocCliente` (string, texto libre del cliente, ej. "OC-6418"),
  `clienteId` (FK), `fecha`, `estado` (enum), `observaciones?`. Relación `1—N OrdenCompraLinea`, `1—1 OrdenProduccion?`.

- **OrdenCompraLinea**: `id`, `ocId` (FK), `productoConfiguradoId` (FK). Relación `1—N OCLineaTalla`.

- **OCLineaTalla**: `id`, `ocLineaId` (FK), `tallaId` (FK), `cantidad` (int). `@@unique([ocLineaId, tallaId])`.

- **OrdenProduccion (OP)**: `id`, `consecutivo (int, unique)`, `ocId` (FK, unique → 1:1), `fecha`, `estado` (enum).
  Relación `1—N OrdenProduccionLinea`.

- **OrdenProduccionLinea**: `id`, `opId` (FK), `productoConfiguradoId` (FK). Relación `1—N OPLineaTalla`.

- **OPLineaTalla**: `id`, `opLineaId` (FK), `tallaId` (FK), `cantPedida`, `cantAmarrada`, `cantAProducir` (ints).
  Invariante: `cantPedida = cantAmarrada + cantAProducir`. `@@unique([opLineaId, tallaId])`.

- **InventarioPT**: `id`, `productoConfiguradoId` (FK), `tallaId` (FK), `bodegaId` (FK), `cantDisponible` (int),
  `cantReservada` (int, default 0). `@@unique([productoConfiguradoId, tallaId, bodegaId])`.

### Enums nuevos
- `TipoCredito`: CONTADO, D30, D60, D90
- `EstadoCartera`: AL_DIA, VENCIDO, BLOQUEADO
- `TipoBodega`: PROPIA, HERMANA
- `EstadoOC`: BORRADOR, CONFIRMADA, EN_PRODUCCION, CERRADA, ANULADA
- `EstadoOP`: CREADA, AMARRADA, EN_PRODUCCION, ANULADA

## 4. Máquina de estados

```
OC
  BORRADOR ──confirmar──▶ CONFIRMADA ──genera OP──▶ EN_PRODUCCION ──▶ CERRADA
     │                        │
     └────anular──────────────┴──▶ ANULADA
  • BORRADOR: edición libre de líneas.
  • CONFIRMAR: valida cliente activo, ≥1 línea, tallas dentro del rango de la Referencia.
  • Solo una OC CONFIRMADA puede generar OP.

OP
  CREADA ──chequear inventario──▶ AMARRADA ──▶ (EN_PRODUCCION → … fuera de alcance)
     │
     └──anular──▶ ANULADA  (libera reservas de PT)
```

## 5. Flujo OC → OP → amarre

```
1. Crear OC (BORRADOR) + líneas: ProductoConfigurado + curva de tallas.
2. Confirmar OC ──validaciones──▶ CONFIRMADA.
3. Generar OP (transacción Prisma única):
      ├─ crea OP (CREADA), ocId, consecutivo
      ├─ copia líneas + OPLineaTalla (cantPedida = cantidad OC)
      └─ por cada (productoConfig + talla), recorriendo bodegas por prioridad:
             disponible = cantDisponible − cantReservada
             amarrar    = min(restantePorAmarrar, disponible)
             cantAmarrada  += amarrar
             InventarioPT.cantReservada += amarrar   ◀ reserva
         al terminar:
             cantAProducir = cantPedida − cantAmarrada
      └─ OP queda AMARRADA
4. Consulta: "de N pedidos → X amarrados de PT, Y a producir" por talla y bodega.
```

## 6. Manejo de errores y reglas

- Paso 3 corre en **una sola transacción Prisma**: o se amarra y reserva todo, o nada (sin reservas huérfanas).
- **Concurrencia**: la reserva valida `cantDisponible − cantReservada` dentro de la transacción → dos OP no reservan el mismo stock.
- **Anular OP**: devuelve reservas (`cantReservada -= cantAmarrada` de cada línea).
- No se genera OP de una OC que no esté CONFIRMADA.
- El amarre recorre bodegas por `prioridad` (PROPIA antes que HERMANA).

## 7. Consecutivos (a confirmar con JP — no bloquea)

Tabla `Consecutivo` configurable por tipo (OC/OP): prefijo + número, reinicio anual opcional.
Por defecto, continuar la numeración donde quedó el Drive (~3900) si se busca continuidad histórica.

## 8. Testing (TDD, como el Módulo 1)

- **Unit**: lógica de amarre pura (`min`, reparto por talla, recorrido de bodegas) sin DB.
- **Integración**:
  - Generar OP con stock parcial / cero / suficiente.
  - Anular OP y verificar devolución de reservas.
  - Concurrencia: dos OP compitiendo por el mismo stock.
  - Validaciones de confirmación de OC (cliente inactivo, sin líneas, talla fuera de rango).

## 9. Estructura NestJS propuesta

```
backend/src/
  clientes/          → Cliente (maestro)
  inventario/        → Bodega, InventarioPT
  pedidos/
    oc/              → OrdenCompra + líneas + confirmar
    op/              → OrdenProduccion + generar-desde-oc + amarre + anular
```

## 10. Dependencias con preguntas a JP (ninguna bloquea)

| Pregunta a JP | Campo/entidad afectada | Estado |
|---------------|------------------------|--------|
| P2 marca propia/maquila + dueño | `Cliente 1—N Marca` | Estructura lista; solo poblar datos. |
| P6 bodegas + stock hermanas | `Bodega.tipo` | Soporta consolidar o separar sin rediseño. |
| P7 Galago / cartera | `Cliente.estadoCartera` | Campo previsto; integración en Módulo Cartera. |
