# Diseño — Configurador de BOM (UI) · Demo 2

**Fecha:** 2026-06-04
**Branch:** `feat/m1-bom-ui`
**Módulo:** M1 (Catálogos + Configurador + BOM) — capa frontend
**Estado previo:** motor de BOM (Enfoque B, resolvedor puro multinivel + overrides) implementado y testeado en backend (`src/catalog/bom/`, 13 tests del resolver). Endpoints actuales: `GET /catalog/productos`, `/catalog/tallas`, `/catalog/bom/resolve`.

## 1. Objetivo

Pantalla **reactiva** donde el usuario arma cualquier bota en vivo —referencia + marca + opciones + talla— y ve el **BOM resolverse al instante**: árbol multinivel (con semielaborados explotados) + lista plana de materiales comprados. Demuestra el motor de overrides funcionando. **Solo cantidades** (sin costo; los precios quedan para una demo futura). Decisiones tomadas en brainstorming (2026-06-04).

## 2. Alcance

**Incluye:** configurador en vivo de solo lectura sobre el resolvedor existente; endpoints de catálogo para alimentar los selectores; enriquecimiento del `resolve` con nombres de material.

**No incluye:** CRUD/ABM de catálogos, edición de BOM/overrides, costos/precios, importación del Sheet legacy, hardening de ciclos del resolvedor.

## 3. Arquitectura

```
FRONTEND (/catalog/configurador)
  ConfiguradorComponent (signals, reactivo)
    selección ──(switchMap)──► resolve ──► repinta árbol + comprados
    ├─ buscador-select  (referencia, marca, opciones)   [REUSO]
    ├─ bom-arbol        (árbol multinivel, recursivo)    [NUEVO]
    └─ tabla comprados  (inline)
  ConfiguradorApi (en catalogo.api.ts) + modelos TS
        │ HTTP
BACKEND (módulo catalog)
  GET /catalog/referencias              (lista)                 [NUEVO]
  GET /catalog/referencias/:id/config   (marcas + ejes + tallas)[NUEVO]
  GET /catalog/bom/resolve              (decorado con nombres)  [MODIFICADO]
       └─ resolverBom() PURO intacto + paso enriquecer() en el controller/servicio
```

Principio rector: el **resolvedor puro (`bom-resolver.ts`) no se toca** — sigue operando con `materialId`. El controller toma su salida (`BomResuelto`), junta los ids, hace un lookup Prisma de metadatos y decora la respuesta. Los 13 tests del resolver quedan intactos.

## 4. Contratos de API

```jsonc
GET /catalog/referencias
→ [{ id, codigo, nombreInterno }]   // solo activas, orden por código

GET /catalog/referencias/:id/config
→ {
    referencia: { id, codigo, nombreInterno, tallaMin, tallaMax },  // tallaMin/Max = valor int
    marcas: [{ id, codigo, nombre, tipo }],          // desde ReferenciaMarca (marca activa)
    ejes:   [{ grupo: { id, codigo, nombre, obligatorio }, opciones: [{ id, codigo, nombre }] }]
  }
// `obligatorio` proviene de ReferenciaEje.obligatorio (no de GrupoOpcion).
// Solo opciones activas. Si la referencia no existe o está inactiva → 404.

GET /catalog/bom/resolve?referenciaId&marcaId&opcionIds&talla   // query igual que hoy
→ {
    arbol:     [{ materialId, codigo, nombre, unidad, origen, consumo, hijos: [ ...mismos campos ] }],
    comprados: [{ materialId, codigo, nombre, unidad, consumo }]
  }
// `unidad` = código/abreviatura de UnidadMedida. `origen` = COMPRADO | FABRICADO.
```

### Enriquecimiento (backend)

Nuevo método en `CatalogService` (o `BomLoaderService`): `enriquecerResuelto(resuelto: BomResuelto): BomResueltoConMeta`.
1. Recolectar todos los `materialId` del árbol (recursivo) + comprados.
2. `prisma.material.findMany({ where: { id: { in } }, select: { id, codigo, nombreCanonico, unidadMedida: { select: { codigo } } } })`.
3. Mapear a un `Record<number, {codigo, nombre, unidad}>` y decorar recursivamente nodos + comprados.

El `BomController.resolve` llama `resolverBom(entrada)` (sin cambios) y luego `enriquecerResuelto(...)`.

## 5. Estructura frontend

```
features/catalog/configurador/
  configurador.component.ts          # página reactiva (signals)
  configurador.util.ts               # PURO: opcionIdsSel(), obligatoriosCompletos(), tallasDeRef()
  bom-arbol/bom-arbol.component.ts    # render recursivo de NodoBom
core/api/
  catalogo.api.ts                    # + referencias(), + configReferencia(id), + resolver(params)
  models/catalogo.models.ts          # + ReferenciaListItem, ReferenciaConfig, BomResuelto, NodoBom
app.routes.ts                        # + ruta /catalog/configurador (dentro del shell, authGuard)
shell                                # + ítem de nav "Configurador" (grupo Catálogo)
```

- **Signals:** `referencias`, `refSel`, `config`, `marcaSel`, `opcionesSel` (Map grupoId→opcionId), `tallaSel`, `resultado`, `cargando`, `error`.
- **Flujo reactivo:**
  - Al montar → `referencias()`.
  - Cambia `refSel` → `configReferencia(id)`, resetea `marcaSel`/`opcionesSel`, setea `tallaSel = tallaMin`.
  - Cuando la selección es válida (ver §6) → `resolver(params)` vía `switchMap` (cancela la request anterior); `cargando`/`error` manejados.
- **bom-arbol:** componente recursivo que recibe `NodoBom[]` y se autoinvoca para `hijos`; indentación por nivel; badge de origen (FABRICADO vs COMPRADO) reusando estilos del DS.
- **Selectores:** `buscador-select` (ya existe) para referencia/marca/opciones; talla como select simple del rango.

## 6. Manejo de errores / edge cases

| Caso | Comportamiento |
|------|----------------|
| Grupo obligatorio sin elegir | No llama resolve; hint "Elegí: Color, Suela" |
| Referencia sin BOM | `arbol` vacío → empty state "Sin BOM cargado" |
| resolve 400/500 | Mensaje inline en el panel derecho; no rompe la pantalla |
| 401 | Cubierto por el interceptor global existente |
| Marca opcional | `marcaId` puede ir null (el resolver lo soporta); no bloquea resolve |
| BOM con ciclo | **Riesgo conocido** del resolvedor (hardening pendiente, fuera de alcance). El seed no tiene ciclos. Anotado, no se aborda en Demo 2. |

## 7. Testing

- **Backend:**
  - `CatalogService.listarReferencias` y `configReferencia` (prisma mock; incluye 404).
  - `enriquecerResuelto`: mapeo correcto de nombres/unidad en árbol anidado + comprados (unit).
  - Wiring del controller.
- **Frontend:**
  - `configurador.util` (puro): `opcionIdsSel`, `obligatoriosCompletos`, `tallasDeRef`.
  - `ConfiguradorApi` (spec con HttpTestingController).
  - `configurador.component`: la selección válida dispara resolve; render de árbol; empty state; hint de obligatorios.
  - `bom-arbol`: render recursivo con hijos.
- **E2E manual:** login → /catalog/configurador → `101 · PODEROSA · CAFÉ · RIVER · t42` → BOM correcto (caso ya verificado contra el resolver backend, AGR-452).

## 8. Dependencia de datos (seed)

El config endpoint necesita que el seed pueble `ReferenciaEje` (grupos por referencia), `ReferenciaMarca` (marcas por referencia) y `Opcion` activas. **Verificar `seed-catalogo.ts`**; si no las puebla, extenderlo. Sin esto el configurador muestra referencias pero sin marcas/opciones.

## 9. Fuera de alcance (futuro)

- Costo del par (requiere `precio` en Material + datos).
- ABM de catálogo / edición de BOM y overrides.
- Importación del Sheet legacy (depende de JP).
- Hardening del resolvedor (ciclos, consumoFijo null, ADD que pisa base).
