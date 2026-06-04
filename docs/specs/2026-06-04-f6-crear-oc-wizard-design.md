# F6 — Crear OC (Wizard) · Design

> Diseño aprobado en brainstorming con Gonza el **2026-06-04**.
> Cierra el flujo de la demo: permite crear una Orden de Compra desde la UI (hoy solo por API).
> Repo: `agro-erp` (frontend Angular 19.2 + backend NestJS/Prisma). DS "Acero".
> Spec base del flujo: `docs/specs/2026-06-03-frontend-flujo-pedidos-design.md` §7.

## 1. Objetivo y alcance

Un **wizard de 4 pasos** (Cliente → Productos → Curva de tallas → Revisar) que crea una OC en
estado **BORRADOR** vía `POST /pedidos/oc`. Destraba poder crear pedidos sin tocar la API.

**Decisiones tomadas (2026-06-04):**
- **Selector**: dropdown con búsqueda simple (input que filtra una lista con signals, sin CDK
  overlay). Reusable para cliente y producto.
- **Curva de tallas**: rango real por producto (`referencia.tallaMin..tallaMax`), no una lista fija.
- **Multi-producto**: el wizard permite varios productos por OC (cada uno con su curva), como el
  modelo real (`OrdenCompra.lineas[]`).

**Fuera del alcance:** combobox CDK completo, botón "Guardar borrador" intermedio (el paso 4 ya
crea el BORRADOR), edición de OC existentes, datepicker/multiselect.

## 2. Backend — endpoints de lectura del catálogo (los que faltan)

El backend solo expone `GET /catalog/bom/resolve`. Se agregan dos GET de lectura en el módulo
`catalog` (nuevo `CatalogController` + `CatalogService` con Prisma, protegidos con `JwtAuthGuard`
como `BomController`; `CatalogService` se registra en `providers` de `CatalogModule`).

### `GET /catalog/productos`
Lista de `ProductoConfigurado` activos, cada uno con su marca y el rango de tallas de su referencia:
```jsonc
[
  {
    "id": 1, "codigo": "PC-101-PODEROSA-DIEL", "nombreComercial": "Bota Dieléctrica Poderosa",
    "marca": { "id": 1, "nombre": "PODEROSA" },
    "referencia": {
      "id": 1, "codigo": "101",
      "tallaMin": { "id": 1, "valor": 38, "orden": 1 },
      "tallaMax": { "id": 9, "valor": 46, "orden": 9 }
    }
  }
]
```
Prisma: `productoConfigurado.findMany({ where: { activo: true }, orderBy: { nombreComercial: 'asc' }, include: { marca: { select: { id, nombre } }, referencia: { select: { id, codigo, tallaMin: { select: { id, valor, orden } }, tallaMax: { select: { id, valor, orden } } } } } })`.

### `GET /catalog/tallas`
Todas las tallas, ordenadas:
```jsonc
[ { "id": 1, "valor": 38, "orden": 1 }, { "id": 2, "valor": 39, "orden": 2 }, … ]
```
Prisma: `talla.findMany({ orderBy: { orden: 'asc' } })`.

**La curva de un producto** (frontend) = las tallas con `orden` entre `producto.referencia.tallaMin.orden`
y `producto.referencia.tallaMax.orden` (inclusive).

## 3. Frontend — capa de datos

- **Modelos** (`core/api/models/`):
  - `Talla` ya existe (`{ id, valor, orden }`).
  - Nuevo `ProductoConfiguradoFull`: `{ id, codigo, nombreComercial, marca: { id, nombre }, referencia: { id, codigo, tallaMin: Talla, tallaMax: Talla } }`.
- **`core/api/catalogo.api.ts`** (`CatalogoApi`):
  - `listarProductos()` → `GET {apiUrl}/catalog/productos`
  - `listarTallas()` → `GET {apiUrl}/catalog/tallas`
- `PedidosApi.crearOC(dto)` ya existe (`POST /pedidos/oc`); DTO `CrearOCDto` ya existe
  (`{ clienteId, ocCliente?, observaciones?, lineas: [{ productoConfiguradoId, tallas: [{ tallaId, cantidad }] }] }`).
- `ClientesApi.listar()` ya existe (para el buscador de cliente).

## 4. Frontend — componentes

### `shared/ui/buscador-select` (`BuscadorSelectComponent`)
Dropdown con búsqueda, genérico y reusable. Interfaz:
- **Inputs**: `items: T[]`, `etiqueta: (item: T) => string` (texto principal), `sub?: (item: T) => string`
  (texto secundario, ej. NIT), `placeholder?: string`.
- **Output**: `seleccionar = output<T>()`.
- **Comportamiento**: input de texto filtra `items` por `etiqueta`/`sub` (case-insensitive, signal
  `filtro`); muestra la lista filtrada debajo; click en una opción emite `seleccionar` y cierra;
  Enter sobre el filtro selecciona el primero. Estado abierto/cerrado con signal. Sin CDK overlay
  (lista en flujo, `position:relative`/absolute simple dentro del campo).
- Estilos propios encapsulados con tokens del DS.

### `shared/ui/talla-grid` (`TallaGridComponent`)
Grilla de la curva de **un** producto. Interfaz:
- **Inputs**: `tallas: Talla[]` (ya filtradas al rango del producto), `valores: Record<number, number>`
  (cantidades por tallaId, estado controlado por el padre).
- **Output**: `cambio = output<Record<number, number>>()` (emite el mapa actualizado al editar).
- **Comportamiento**: una celda por talla con `<input type="number" min="0">`; al editar, actualiza
  el mapa y emite; muestra el **Total** (suma) calculado con un `computed`. Navegación con Tab nativa.
- Función pura testeable `totalCurva(valores): number` (suma de cantidades).

### `features/pedidos/oc/oc-crear.component` (`OcCrearComponent`)
El wizard. Standalone, signals. Ruta `/pedidos/oc/nueva`.

## 5. Wizard — estado, pasos y validación

```
Estado local (signals):
  clienteSel    = signal<Cliente | null>(null)
  ocCliente     = signal('')        // referencia de OC del cliente (opcional)
  observaciones = signal('')        // opcional
  lineas        = signal<LineaWizard[]>([])   // LineaWizard = { producto: ProductoConfiguradoFull, valores: Record<tallaId, cant> }
  paso          = signal<0|1|2|3>(0)

Catálogo cargado en ngOnInit: productos (signal), tallas (signal), clientes (signal).
```

| Paso | Contenido | Validación para "Continuar" |
|------|-----------|------------------------------|
| 0 Cliente | `buscador-select` de clientes (etiqueta=nombre, sub=NIT) + inputs ocCliente/observaciones | `clienteSel() !== null` |
| 1 Productos | `buscador-select` de productos + lista de agregados (quitar con ✕). No permite duplicar el mismo producto | `lineas().length >= 1` |
| 2 Curva | por cada línea: nombre del producto + `talla-grid` con sus tallas del rango | cada línea tiene `totalCurva(valores) > 0` |
| 3 Revisar | resumen: cliente, y por línea las tallas con cantidad + total general | acción **Crear OC** |

- Stepper visual (clases del DS, ver mockup `design-ref/pantallas/Crear OC.html`). Botones
  **Atrás** / **Continuar**; en el paso 3 el botón primario es **Crear OC**.
- **Tallas del rango de una línea**: `tallas().filter(t => t.orden >= producto.referencia.tallaMin.orden && t.orden <= producto.referencia.tallaMax.orden)`.
- **Crear OC**: arma el `CrearOCDto` desde el estado (solo tallas con `cantidad > 0`), llama
  `PedidosApi.crearOC(dto)`; en éxito navega a `/pedidos/oc`; en error muestra el mensaje (patrón
  `msg()` como en oc-detalle). Función pura testeable `construirDto(estado): CrearOCDto`.

## 6. Routing y punto de entrada

- **Ruta**: `{ path: 'pedidos/oc/nueva', loadComponent: OcCrearComponent }` en los `children` del
  shell, **antes** de cualquier `pedidos/oc/:id` si existiera (hoy no existe ruta de detalle de OC,
  así que va junto a `pedidos/oc`). Orden: `pedidos/oc`, `pedidos/oc/nueva`, …
- **Entrada**: botón **"Nueva OC"** (`btn btn-primary`) en el header de `oc-list.component`
  (`page-header`), con `routerLink="/pedidos/oc/nueva"`.

## 7. Testing (Karma/Jasmine + Jest backend según patrón del repo)

- **Backend** `catalog.service.spec.ts` — unit con prisma mockeado (patrón del repo, ver
  `clientes.service.spec.ts`): `const prisma = { productoConfigurado: { findMany: jest.fn() }, talla: { findMany: jest.fn() } } as any; const service = new CatalogService(prisma);`.
  Tests: `listarProductos()` llama `productoConfigurado.findMany` con el `include` de marca +
  referencia.tallaMin/Max y devuelve el resultado; `listarTallas()` llama `talla.findMany` con
  `orderBy: { orden: 'asc' }`.
- **Frontend**:
  - `catalogo.api.spec`: `HttpTestingController` — URL + método de `listarProductos`/`listarTallas`.
  - `buscador-select.spec`: filtra la lista al cambiar el filtro; emite `seleccionar` al elegir.
  - `talla-grid.spec`: `totalCurva` suma; editar un input emite el mapa actualizado.
  - `oc-crear.spec`: `construirDto` arma el DTO correcto (solo cant>0); smoke del wizard (carga
    catálogo, selecciona cliente, agrega producto, valida pasos, POST con el DTO esperado).

## 8. Riesgos y notas

- **PrismaService en CatalogModule**: `PrismaModule` es `@Global()` y exporta `PrismaService`, así
  que `CatalogService` lo inyecta por constructor sin imports extra; solo se agrega `CatalogService`
  a `providers` y `CatalogController` a `controllers` de `CatalogModule`.
- **Curva vacía / rango**: el seed tiene tallas 38–46 (orden 1–9) y la referencia 101 abarca todo el
  rango; la curva mostrará 38–46. Si una referencia tuviera un rango menor, el filtro por `orden` lo
  respeta.
- **DTO**: enviar solo tallas con `cantidad > 0`; una línea sin ninguna cantidad la bloquea la
  validación del paso 2→3, así que no debería llegar vacía al POST.
- **Navegación post-creación**: a `/pedidos/oc` (la nueva OC aparece como BORRADOR en la lista). No
  se abre el aside automáticamente (YAGNI).
- **Multi-marca**: cada `ProductoConfigurado` ya encapsula referencia+marca; el buscador de producto
  lista productos configurados (no hay selector de marca aparte).
