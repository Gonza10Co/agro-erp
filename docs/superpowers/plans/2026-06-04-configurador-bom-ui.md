# Configurador de BOM (UI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página reactiva donde el usuario arma una bota (referencia + marca + opciones + talla) y ve el BOM resolverse en vivo (árbol multinivel + lista de comprados), solo cantidades.

**Architecture:** Enfoque A — el resolvedor puro de BOM (`bom-resolver.ts`) NO se toca. Se agregan endpoints de catálogo para alimentar los selectores y un paso de enriquecimiento (puro + lookup Prisma) que decora la salida del resolver con nombres de material. El frontend es un componente Angular con signals que dispara `resolve` (switchMap) ante cualquier cambio de selección.

**Tech Stack:** NestJS + Prisma (backend), Angular 19 standalone + signals + Plain CSS DS "Acero" (frontend), Jest (backend tests), Karma/Jasmine headless (frontend tests).

**Branch:** `feat/m1-bom-ui` (ya creado desde master).

**Spec:** `docs/superpowers/specs/2026-06-04-configurador-bom-ui-design.md`.

---

## File Structure

**Backend (módulo `catalog`):**
- Modify: `backend/src/catalog/catalog.service.ts` — `+listarReferencias()`, `+configReferencia(id)`, `+metaMateriales(ids)`.
- Modify: `backend/src/catalog/catalog.controller.ts` — `+GET referencias`, `+GET referencias/:id/config`.
- Create: `backend/src/catalog/bom/bom-enriquecer.ts` — tipos + funciones puras `idsDeResuelto()` y `enriquecer()`.
- Modify: `backend/src/catalog/bom/bom.controller.ts` — inyecta `CatalogService`, enriquece la respuesta de `resolve`.
- Modify: `backend/prisma/seed-catalogo.ts` — `+ReferenciaEje` (101→COLOR, SUELA) y `+ReferenciaMarca` (101→PODEROSA).
- Tests: `backend/src/catalog/catalog.service.spec.ts`, `backend/src/catalog/bom/bom-enriquecer.spec.ts`.

**Frontend (`features/catalog/configurador`):**
- Modify: `frontend/src/app/core/api/models/catalogo.models.ts` — modelos del configurador.
- Modify: `frontend/src/app/core/api/catalogo.api.ts` — `+referencias()`, `+configReferencia(id)`, `+resolver(params)`.
- Create: `frontend/src/app/features/catalog/configurador/configurador.util.ts` — helpers puros.
- Create: `frontend/src/app/features/catalog/configurador/bom-arbol/bom-arbol.component.ts` — árbol recursivo.
- Create: `frontend/src/app/features/catalog/configurador/configurador.component.ts` — página reactiva.
- Modify: `frontend/src/app/app.routes.ts` — ruta `/catalog/configurador`.
- Modify: `frontend/src/app/layout/shell/shell.component.ts` — ítem de nav "Configurador de BOM".
- Tests: `catalogo.api.spec.ts`, `configurador.util.spec.ts`, `bom-arbol.component.spec.ts`, `configurador.component.spec.ts`.

---

## Task 1: Backend — `GET /catalog/referencias`

**Files:**
- Modify: `backend/src/catalog/catalog.service.ts`
- Modify: `backend/src/catalog/catalog.controller.ts`
- Test: `backend/src/catalog/catalog.service.spec.ts`

- [ ] **Step 1: Write the failing test**

En `catalog.service.spec.ts`, agregá `referencia` al mock de prisma y un test nuevo:

```ts
// En el objeto `prisma`, agregá esta línea junto a las otras:
//   referencia: { findMany: jest.fn(), findFirst: jest.fn() },

it('listarReferencias pide solo activas ordenadas por código', async () => {
  prisma.referencia.findMany.mockResolvedValue([{ id: 1, codigo: '101', nombreInterno: 'PODEROSA base' }]);
  const r = await service.listarReferencias();
  const arg = prisma.referencia.findMany.mock.calls[0][0];
  expect(arg.where).toEqual({ activo: true });
  expect(arg.orderBy).toEqual({ codigo: 'asc' });
  expect(arg.select).toEqual({ id: true, codigo: true, nombreInterno: true });
  expect(r).toEqual([{ id: 1, codigo: '101', nombreInterno: 'PODEROSA base' }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest catalog.service -t "listarReferencias"`
Expected: FAIL (`service.listarReferencias is not a function`).

- [ ] **Step 3: Write minimal implementation**

En `catalog.service.ts`, dentro de la clase `CatalogService`:

```ts
  listarReferencias() {
    return this.prisma.referencia.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombreInterno: true },
    });
  }
```

En `catalog.controller.ts`, agregá el método (el `@Controller('catalog')` y `CatalogService` ya están inyectados):

```ts
  @Get('referencias')
  referencias() {
    return this.catalog.listarReferencias();
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest catalog.service -t "listarReferencias"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/catalog/catalog.service.ts backend/src/catalog/catalog.controller.ts backend/src/catalog/catalog.service.spec.ts
git commit -m "feat(catalog): GET /catalog/referencias (lista de referencias activas)"
```

---

## Task 2: Backend — `GET /catalog/referencias/:id/config`

**Files:**
- Modify: `backend/src/catalog/catalog.service.ts`
- Modify: `backend/src/catalog/catalog.controller.ts`
- Test: `backend/src/catalog/catalog.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('configReferencia mapea marcas y ejes, y normaliza tallas', async () => {
  prisma.referencia.findFirst.mockResolvedValue({
    id: 1, codigo: '101', nombreInterno: 'PODEROSA base',
    tallaMin: { valor: 38 }, tallaMax: { valor: 46 },
    marcas: [{ marca: { id: 5, codigo: 'PODEROSA', nombre: 'Poderosa', tipo: 'PROPIA' } }],
    ejes: [
      { obligatorio: true, grupoOpcion: { id: 2, codigo: 'SUELA', nombre: 'Suela', orden: 2, opciones: [{ id: 9, codigo: 'RIVER', nombre: 'River Creek' }] } },
      { obligatorio: true, grupoOpcion: { id: 1, codigo: 'COLOR', nombre: 'Color', orden: 1, opciones: [{ id: 8, codigo: 'CAFE', nombre: 'Café' }] } },
    ],
  });
  const r = await service.configReferencia(1);
  expect(r.referencia).toEqual({ id: 1, codigo: '101', nombreInterno: 'PODEROSA base', tallaMin: 38, tallaMax: 46 });
  expect(r.marcas).toEqual([{ id: 5, codigo: 'PODEROSA', nombre: 'Poderosa', tipo: 'PROPIA' }]);
  // ejes ordenados por grupoOpcion.orden (COLOR antes que SUELA)
  expect(r.ejes.map((e) => e.grupo.codigo)).toEqual(['COLOR', 'SUELA']);
  expect(r.ejes[0]).toEqual({
    grupo: { id: 1, codigo: 'COLOR', nombre: 'Color', obligatorio: true },
    opciones: [{ id: 8, codigo: 'CAFE', nombre: 'Café' }],
  });
});

it('configReferencia lanza 404 si la referencia no existe', async () => {
  prisma.referencia.findFirst.mockResolvedValue(null);
  await expect(service.configReferencia(999)).rejects.toThrow('Referencia 999 no encontrada');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest catalog.service -t "configReferencia"`
Expected: FAIL (`service.configReferencia is not a function`).

- [ ] **Step 3: Write minimal implementation**

En `catalog.service.ts`, agregá `NotFoundException` al import de `@nestjs/common`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
```

Y el método en la clase:

```ts
  async configReferencia(id: number) {
    const ref = await this.prisma.referencia.findFirst({
      where: { id, activo: true },
      select: {
        id: true,
        codigo: true,
        nombreInterno: true,
        tallaMin: { select: { valor: true } },
        tallaMax: { select: { valor: true } },
        marcas: {
          where: { marca: { activo: true } },
          select: { marca: { select: { id: true, codigo: true, nombre: true, tipo: true } } },
        },
        ejes: {
          select: {
            obligatorio: true,
            grupoOpcion: {
              select: {
                id: true,
                codigo: true,
                nombre: true,
                orden: true,
                opciones: { where: { activo: true }, select: { id: true, codigo: true, nombre: true } },
              },
            },
          },
        },
      },
    });
    if (!ref) throw new NotFoundException(`Referencia ${id} no encontrada`);
    return {
      referencia: {
        id: ref.id,
        codigo: ref.codigo,
        nombreInterno: ref.nombreInterno,
        tallaMin: ref.tallaMin.valor,
        tallaMax: ref.tallaMax.valor,
      },
      marcas: ref.marcas.map((m) => m.marca),
      ejes: ref.ejes
        .slice()
        .sort((a, b) => a.grupoOpcion.orden - b.grupoOpcion.orden)
        .map((e) => ({
          grupo: { id: e.grupoOpcion.id, codigo: e.grupoOpcion.codigo, nombre: e.grupoOpcion.nombre, obligatorio: e.obligatorio },
          opciones: e.grupoOpcion.opciones,
        })),
    };
  }
```

En `catalog.controller.ts`, agregá `Param` y `ParseIntPipe` al import de `@nestjs/common`:

```ts
import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
```

Y el método:

```ts
  @Get('referencias/:id/config')
  config(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.configReferencia(id);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest catalog.service`
Expected: PASS (todos los tests de catalog.service).

- [ ] **Step 5: Commit**

```bash
git add backend/src/catalog/catalog.service.ts backend/src/catalog/catalog.controller.ts backend/src/catalog/catalog.service.spec.ts
git commit -m "feat(catalog): GET /catalog/referencias/:id/config (marcas + ejes + tallas)"
```

---

## Task 3: Backend — enriquecer `resolve` con nombres de material

**Files:**
- Create: `backend/src/catalog/bom/bom-enriquecer.ts`
- Test: `backend/src/catalog/bom/bom-enriquecer.spec.ts`
- Modify: `backend/src/catalog/catalog.service.ts` (`+metaMateriales`)
- Modify: `backend/src/catalog/bom/bom.controller.ts`

- [ ] **Step 1: Write the failing test**

Creá `backend/src/catalog/bom/bom-enriquecer.spec.ts`:

```ts
import { idsDeResuelto, enriquecer } from './bom-enriquecer';
import { BomResuelto } from './bom-resolver.types';

const RESUELTO: BomResuelto = {
  arbol: [
    { materialId: 1, consumo: 0.112, origen: 'COMPRADO', hijos: [] },
    { materialId: 2, consumo: 1, origen: 'FABRICADO', hijos: [
      { materialId: 3, consumo: 0.04, origen: 'COMPRADO', hijos: [] },
    ] },
  ],
  comprados: [
    { materialId: 1, consumo: 0.112 },
    { materialId: 3, consumo: 0.04 },
  ],
};

describe('bom-enriquecer', () => {
  it('idsDeResuelto recolecta ids del árbol (recursivo) + comprados, sin duplicar', () => {
    expect(idsDeResuelto(RESUELTO).sort()).toEqual([1, 2, 3]);
  });

  it('enriquecer decora árbol e hijos con codigo/nombre/unidad', () => {
    const meta = {
      1: { codigo: 'MICRO-CAF', nombre: 'MICROPIEL CAFÉ', unidad: 'M' },
      2: { codigo: 'PLANT-PU', nombre: 'PLANTILLA PU', unidad: 'PAR' },
      3: { codigo: 'POLIOL', nombre: 'POLIOL JF', unidad: 'KG' },
    };
    const r = enriquecer(RESUELTO, meta);
    expect(r.arbol[0]).toEqual({ materialId: 1, codigo: 'MICRO-CAF', nombre: 'MICROPIEL CAFÉ', unidad: 'M', origen: 'COMPRADO', consumo: 0.112, hijos: [] });
    expect(r.arbol[1].hijos[0].nombre).toBe('POLIOL JF');
    expect(r.comprados[0]).toEqual({ materialId: 1, codigo: 'MICRO-CAF', nombre: 'MICROPIEL CAFÉ', unidad: 'M', consumo: 0.112 });
  });

  it('enriquecer usa un placeholder si falta meta de un material', () => {
    const r = enriquecer(RESUELTO, {});
    expect(r.arbol[0].nombre).toBe('(desconocido)');
    expect(r.arbol[0].unidad).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest bom-enriquecer`
Expected: FAIL (`Cannot find module './bom-enriquecer'`).

- [ ] **Step 3: Write minimal implementation**

Creá `backend/src/catalog/bom/bom-enriquecer.ts`:

```ts
import { BomResuelto, NodoResuelto, OrigenMaterial } from './bom-resolver.types';

export interface MetaMaterial {
  codigo: string;
  nombre: string;
  unidad: string;
}

export interface NodoConMeta {
  materialId: number;
  codigo: string;
  nombre: string;
  unidad: string;
  origen: OrigenMaterial;
  consumo: number;
  hijos: NodoConMeta[];
}

export interface CompradoConMeta {
  materialId: number;
  codigo: string;
  nombre: string;
  unidad: string;
  consumo: number;
}

export interface BomConMeta {
  arbol: NodoConMeta[];
  comprados: CompradoConMeta[];
}

const FALTANTE: MetaMaterial = { codigo: '?', nombre: '(desconocido)', unidad: '' };

export function idsDeResuelto(r: BomResuelto): number[] {
  const ids = new Set<number>();
  const visitar = (nodos: NodoResuelto[]) => {
    for (const n of nodos) {
      ids.add(n.materialId);
      visitar(n.hijos);
    }
  };
  visitar(r.arbol);
  for (const c of r.comprados) ids.add(c.materialId);
  return [...ids];
}

export function enriquecer(
  r: BomResuelto,
  meta: Record<number, MetaMaterial>,
): BomConMeta {
  const decorar = (n: NodoResuelto): NodoConMeta => {
    const m = meta[n.materialId] ?? FALTANTE;
    return {
      materialId: n.materialId,
      codigo: m.codigo,
      nombre: m.nombre,
      unidad: m.unidad,
      origen: n.origen,
      consumo: n.consumo,
      hijos: n.hijos.map(decorar),
    };
  };
  return {
    arbol: r.arbol.map(decorar),
    comprados: r.comprados.map((c) => {
      const m = meta[c.materialId] ?? FALTANTE;
      return { materialId: c.materialId, codigo: m.codigo, nombre: m.nombre, unidad: m.unidad, consumo: c.consumo };
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest bom-enriquecer`
Expected: PASS (3 tests).

- [ ] **Step 5: Add `metaMateriales` to CatalogService**

En `catalog.service.ts`, importá el tipo y agregá el método:

```ts
import { MetaMaterial } from './bom/bom-enriquecer';
```

```ts
  async metaMateriales(ids: number[]): Promise<Record<number, MetaMaterial>> {
    if (!ids.length) return {};
    const filas = await this.prisma.material.findMany({
      where: { id: { in: ids } },
      select: { id: true, codigo: true, nombreCanonico: true, unidadMedida: { select: { codigo: true } } },
    });
    const map: Record<number, MetaMaterial> = {};
    for (const m of filas) map[m.id] = { codigo: m.codigo, nombre: m.nombreCanonico, unidad: m.unidadMedida.codigo };
    return map;
  }
```

- [ ] **Step 6: Wire the enrichment into BomController**

Reemplazá el contenido de `backend/src/catalog/bom/bom.controller.ts` por:

```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BomLoaderService } from './bom-loader.service';
import { resolverBom } from './bom-resolver';
import { enriquecer, idsDeResuelto } from './bom-enriquecer';
import { ResolverBomDto } from './dto/resolver-bom.dto';
import { CatalogService } from '../catalog.service';

@UseGuards(JwtAuthGuard)
@Controller('catalog/bom')
export class BomController {
  constructor(
    private readonly loader: BomLoaderService,
    private readonly catalog: CatalogService,
  ) {}

  @Get('resolve')
  async resolve(@Query() dto: ResolverBomDto) {
    const entrada = await this.loader.cargarEntrada({
      referenciaId: dto.referenciaId,
      marcaId: dto.marcaId ?? null,
      opcionIds: dto.opcionIds ?? [],
      talla: dto.talla,
    });
    const resuelto = resolverBom(entrada);
    const meta = await this.catalog.metaMateriales(idsDeResuelto(resuelto));
    return enriquecer(resuelto, meta);
  }
}
```

`CatalogService` ya está en `providers` de `catalog.module.ts`, así que la inyección funciona sin tocar el módulo.

- [ ] **Step 7: Run full backend suite to verify nothing broke**

Run: `cd backend && npx jest`
Expected: PASS (todas las suites; los 13 tests del resolver siguen intactos).

- [ ] **Step 8: Commit**

```bash
git add backend/src/catalog/bom/bom-enriquecer.ts backend/src/catalog/bom/bom-enriquecer.spec.ts backend/src/catalog/catalog.service.ts backend/src/catalog/bom/bom.controller.ts
git commit -m "feat(catalog): enriquecer resolve con nombres de material (resolver puro intacto)"
```

---

## Task 4: Backend — sembrar `ReferenciaEje` + `ReferenciaMarca`

El config endpoint necesita estos registros; el seed actual no los crea (selectores vendrían vacíos).

**Files:**
- Modify: `backend/prisma/seed-catalogo.ts`

- [ ] **Step 1: Agregar los inserts idempotentes**

En `seed-catalogo.ts`, justo **después** del bloque que crea `marca` (la const `marca`, ~línea 107) y **antes** del comentario `// Overrides`, insertá:

```ts
  // Ejes de configuración de la referencia 101 (qué grupos aplican y si son obligatorios)
  await prisma.referenciaEje.upsert({
    where: { referenciaId_grupoOpcionId: { referenciaId: ref.id, grupoOpcionId: grupoColor.id } },
    update: { obligatorio: true },
    create: { referenciaId: ref.id, grupoOpcionId: grupoColor.id, obligatorio: true },
  });
  await prisma.referenciaEje.upsert({
    where: { referenciaId_grupoOpcionId: { referenciaId: ref.id, grupoOpcionId: grupoSuela.id } },
    update: { obligatorio: true },
    create: { referenciaId: ref.id, grupoOpcionId: grupoSuela.id, obligatorio: true },
  });

  // Marca disponible para la referencia 101
  await prisma.referenciaMarca.upsert({
    where: { referenciaId_marcaId: { referenciaId: ref.id, marcaId: marca.id } },
    update: {},
    create: { referenciaId: ref.id, marcaId: marca.id },
  });
```

- [ ] **Step 2: Correr el seed contra la DB local**

Asegurate de que Postgres local esté arriba (Docker `agro-erp-pg`, :5433; el `.env` apunta a local — ver memoria botas-dev-local).

Run: `cd backend && npm run seed:catalogo`
Expected: imprime `Seed catálogo OK -> referencia ...` sin errores.

- [ ] **Step 3: Verificar el config endpoint en vivo**

Levantá el backend (`cd backend && npm run build && npm run start:prod`) en otra terminal, conseguí un token (`POST /auth/login` admin/admin123) y:

Run: `curl -s "http://localhost:3001/catalog/referencias/<ID_101>/config" -H "Authorization: Bearer <TOKEN>"`
Expected: JSON con `marcas` (PODEROSA) y `ejes` (COLOR, SUELA) no vacíos.
(El `<ID_101>` lo da `GET /catalog/referencias`.)

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/seed-catalogo.ts
git commit -m "feat(seed): ReferenciaEje (101->COLOR,SUELA) + ReferenciaMarca (101->PODEROSA)"
```

---

## Task 5: Frontend — modelos TS + métodos en `CatalogoApi`

**Files:**
- Modify: `frontend/src/app/core/api/models/catalogo.models.ts`
- Modify: `frontend/src/app/core/api/catalogo.api.ts`
- Test: `frontend/src/app/core/api/catalogo.api.spec.ts`

- [ ] **Step 1: Write the failing test**

En `catalogo.api.spec.ts`, agregá:

```ts
it('listarReferencias hace GET /catalog/referencias', () => {
  api.listarReferencias().subscribe();
  const req = http.expectOne('http://localhost:3001/catalog/referencias');
  expect(req.request.method).toBe('GET');
  req.flush([]);
});

it('configReferencia hace GET /catalog/referencias/:id/config', () => {
  api.configReferencia(7).subscribe();
  const req = http.expectOne('http://localhost:3001/catalog/referencias/7/config');
  expect(req.request.method).toBe('GET');
  req.flush({});
});

it('resolver arma los query params (referenciaId, talla, marcaId, opcionIds[])', () => {
  api.resolver({ referenciaId: 1, talla: 42, marcaId: 5, opcionIds: [8, 9] }).subscribe();
  const req = http.expectOne((r) => r.url === 'http://localhost:3001/catalog/bom/resolve');
  expect(req.request.params.get('referenciaId')).toBe('1');
  expect(req.request.params.get('talla')).toBe('42');
  expect(req.request.params.get('marcaId')).toBe('5');
  expect(req.request.params.getAll('opcionIds')).toEqual(['8', '9']);
  req.flush({ arbol: [], comprados: [] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/catalogo.api.spec.ts'`
Expected: FAIL (`api.listarReferencias is not a function`).

- [ ] **Step 3: Add the models**

En `catalogo.models.ts`, agregá al final:

```ts
export interface ReferenciaListItem { id: number; codigo: string; nombreInterno: string; }
export interface MarcaOpt { id: number; codigo: string; nombre: string; tipo: string; }
export interface OpcionOpt { id: number; codigo: string; nombre: string; }
export interface GrupoOpt { id: number; codigo: string; nombre: string; obligatorio: boolean; }
export interface EjeConfig { grupo: GrupoOpt; opciones: OpcionOpt[]; }
export interface ReferenciaConfig {
  referencia: { id: number; codigo: string; nombreInterno: string; tallaMin: number; tallaMax: number };
  marcas: MarcaOpt[];
  ejes: EjeConfig[];
}
export interface NodoBom {
  materialId: number; codigo: string; nombre: string; unidad: string;
  origen: 'COMPRADO' | 'FABRICADO'; consumo: number; hijos: NodoBom[];
}
export interface CompradoBom { materialId: number; codigo: string; nombre: string; unidad: string; consumo: number; }
export interface BomResuelto { arbol: NodoBom[]; comprados: CompradoBom[]; }
export interface ResolverParams { referenciaId: number; talla: number; marcaId?: number; opcionIds?: number[]; }
```

- [ ] **Step 4: Add the API methods**

Reemplazá el contenido de `catalogo.api.ts` por:

```ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  ProductoConfiguradoFull, ReferenciaListItem, ReferenciaConfig, BomResuelto, ResolverParams,
} from './models/catalogo.models';
import { Talla } from './models/pedidos.models';

@Injectable({ providedIn: 'root' })
export class CatalogoApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/catalog`;

  listarProductos() { return this.http.get<ProductoConfiguradoFull[]>(`${this.base}/productos`); }
  listarTallas() { return this.http.get<Talla[]>(`${this.base}/tallas`); }

  listarReferencias() { return this.http.get<ReferenciaListItem[]>(`${this.base}/referencias`); }
  configReferencia(id: number) { return this.http.get<ReferenciaConfig>(`${this.base}/referencias/${id}/config`); }

  resolver(p: ResolverParams) {
    let params = new HttpParams()
      .set('referenciaId', p.referenciaId)
      .set('talla', p.talla);
    if (p.marcaId != null) params = params.set('marcaId', p.marcaId);
    for (const o of p.opcionIds ?? []) params = params.append('opcionIds', o);
    return this.http.get<BomResuelto>(`${this.base}/bom/resolve`, { params });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/catalogo.api.spec.ts'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/core/api/models/catalogo.models.ts frontend/src/app/core/api/catalogo.api.ts frontend/src/app/core/api/catalogo.api.spec.ts
git commit -m "feat(catalogo): modelos del configurador + referencias/config/resolver en CatalogoApi"
```

---

## Task 6: Frontend — helpers puros `configurador.util.ts`

**Files:**
- Create: `frontend/src/app/features/catalog/configurador/configurador.util.ts`
- Test: `frontend/src/app/features/catalog/configurador/configurador.util.spec.ts`

- [ ] **Step 1: Write the failing test**

Creá `configurador.util.spec.ts`:

```ts
import { tallasDeRef, opcionIdsSel, obligatoriosFaltantes } from './configurador.util';
import { EjeConfig, ReferenciaConfig } from '../../../core/api/models/catalogo.models';

const CONFIG: ReferenciaConfig = {
  referencia: { id: 1, codigo: '101', nombreInterno: 'PODEROSA base', tallaMin: 38, tallaMax: 41 },
  marcas: [],
  ejes: [
    { grupo: { id: 1, codigo: 'COLOR', nombre: 'Color', obligatorio: true }, opciones: [] },
    { grupo: { id: 2, codigo: 'SUELA', nombre: 'Suela', obligatorio: false }, opciones: [] },
  ],
};

describe('configurador.util', () => {
  it('tallasDeRef devuelve el rango inclusivo', () => {
    expect(tallasDeRef(CONFIG)).toEqual([38, 39, 40, 41]);
  });

  it('opcionIdsSel descarta nulos', () => {
    const sel = new Map<number, number | null>([[1, 8], [2, null]]);
    expect(opcionIdsSel(sel)).toEqual([8]);
  });

  it('obligatoriosFaltantes lista los grupos obligatorios sin elegir', () => {
    const ejes: EjeConfig[] = CONFIG.ejes;
    expect(obligatoriosFaltantes(ejes, new Map())).toEqual(['Color']);
    expect(obligatoriosFaltantes(ejes, new Map([[1, 8]]))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/configurador.util.spec.ts'`
Expected: FAIL (`Cannot find module './configurador.util'`).

- [ ] **Step 3: Write minimal implementation**

Creá `configurador.util.ts`:

```ts
import { EjeConfig, ReferenciaConfig } from '../../../core/api/models/catalogo.models';

/** Valores de talla del rango de la referencia (inclusivo). */
export function tallasDeRef(config: ReferenciaConfig): number[] {
  const { tallaMin, tallaMax } = config.referencia;
  const out: number[] = [];
  for (let v = tallaMin; v <= tallaMax; v++) out.push(v);
  return out;
}

/** opcionIds elegidos (de la Map grupoId→opcionId|null), sin nulos. */
export function opcionIdsSel(sel: Map<number, number | null>): number[] {
  return [...sel.values()].filter((v): v is number => v != null);
}

/** Nombres de los grupos obligatorios que aún no tienen opción elegida. */
export function obligatoriosFaltantes(ejes: EjeConfig[], sel: Map<number, number | null>): string[] {
  return ejes.filter((e) => e.grupo.obligatorio && sel.get(e.grupo.id) == null).map((e) => e.grupo.nombre);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/configurador.util.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/catalog/configurador/configurador.util.ts frontend/src/app/features/catalog/configurador/configurador.util.spec.ts
git commit -m "feat(configurador): helpers puros (tallasDeRef, opcionIdsSel, obligatoriosFaltantes)"
```

---

## Task 7: Frontend — componente recursivo `bom-arbol`

**Files:**
- Create: `frontend/src/app/features/catalog/configurador/bom-arbol/bom-arbol.component.ts`
- Test: `frontend/src/app/features/catalog/configurador/bom-arbol/bom-arbol.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Creá `bom-arbol.component.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { BomArbolComponent } from './bom-arbol.component';
import { NodoBom } from '../../../../core/api/models/catalogo.models';

const NODOS: NodoBom[] = [
  { materialId: 2, codigo: 'PLANT-PU', nombre: 'PLANTILLA PU', unidad: 'PAR', origen: 'FABRICADO', consumo: 1, hijos: [
    { materialId: 3, codigo: 'POLIOL', nombre: 'POLIOL JF', unidad: 'KG', origen: 'COMPRADO', consumo: 0.04, hijos: [] },
  ] },
];

describe('BomArbolComponent', () => {
  it('renderiza nodos e hijos recursivamente', () => {
    TestBed.configureTestingModule({ imports: [BomArbolComponent] });
    const fixture = TestBed.createComponent(BomArbolComponent);
    fixture.componentRef.setInput('nodos', NODOS);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('PLANTILLA PU');
    expect(text).toContain('POLIOL JF'); // hijo (recursión)
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/bom-arbol.component.spec.ts'`
Expected: FAIL (`Cannot find module './bom-arbol.component'`).

- [ ] **Step 3: Write minimal implementation**

Creá `bom-arbol.component.ts`:

```ts
import { Component, input } from '@angular/core';
import { NodoBom } from '../../../../core/api/models/catalogo.models';

@Component({
  selector: 'app-bom-arbol',
  standalone: true,
  template: `
    <ul class="arbol">
      @for (n of nodos(); track n.materialId) {
        <li>
          <div class="nodo">
            <span class="nombre">{{ n.nombre }}</span>
            @if (n.origen === 'FABRICADO') { <span class="badge badge-info">fabricado</span> }
            <span class="consumo">{{ n.consumo }} {{ n.unidad }}</span>
          </div>
          @if (n.hijos.length) { <app-bom-arbol [nodos]="n.hijos" /> }
        </li>
      }
    </ul>
  `,
  styles: [`
    .arbol{list-style:none;margin:0;padding-left:var(--sp-4)}
    .arbol .arbol{border-left:var(--bw) solid var(--border)}
    .nodo{display:flex;align-items:center;gap:var(--sp-2);padding:var(--sp-1) 0}
    .nombre{font-weight:var(--fw-medium)}
    .badge-info{font-size:var(--text-caption);padding:0 var(--sp-2);border-radius:var(--r-sm);background:var(--primary-subtle);color:var(--primary)}
    .consumo{margin-left:auto;font-family:var(--font-mono);font-size:var(--text-sm);color:var(--text-subtle)}
  `],
})
export class BomArbolComponent {
  nodos = input.required<NodoBom[]>();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/bom-arbol.component.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/catalog/configurador/bom-arbol/
git commit -m "feat(configurador): bom-arbol (render recursivo del árbol multinivel)"
```

---

## Task 8: Frontend — `configurador.component` + ruta + nav

**Files:**
- Create: `frontend/src/app/features/catalog/configurador/configurador.component.ts`
- Test: `frontend/src/app/features/catalog/configurador/configurador.component.spec.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/layout/shell/shell.component.ts`

- [ ] **Step 1: Write the failing test**

Creá `configurador.component.spec.ts`:

```ts
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ConfiguradorComponent } from './configurador.component';
import { ReferenciaConfig } from '../../../core/api/models/catalogo.models';

const BASE = 'http://localhost:3001/catalog';
const CONFIG: ReferenciaConfig = {
  referencia: { id: 1, codigo: '101', nombreInterno: 'PODEROSA base', tallaMin: 38, tallaMax: 46 },
  marcas: [{ id: 5, codigo: 'PODEROSA', nombre: 'Poderosa', tipo: 'PROPIA' }],
  ejes: [{ grupo: { id: 1, codigo: 'COLOR', nombre: 'Color', obligatorio: true }, opciones: [{ id: 8, codigo: 'CAFE', nombre: 'Café' }] }],
};

describe('ConfiguradorComponent', () => {
  let http: HttpTestingController;
  function crear() {
    TestBed.configureTestingModule({
      imports: [ConfiguradorComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ConfiguradorComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // ngOnInit
    return fixture;
  }
  afterEach(() => http.verify());

  it('pide las referencias al iniciar', () => {
    const fixture = crear();
    const req = http.expectOne(`${BASE}/referencias`);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 1, codigo: '101', nombreInterno: 'PODEROSA base' }]);
  });

  it('al elegir referencia carga su config y fija la talla mínima', () => {
    const fixture = crear();
    http.expectOne(`${BASE}/referencias`).flush([{ id: 1, codigo: '101', nombreInterno: 'PODEROSA base' }]);
    const cmp = fixture.componentInstance;
    cmp.elegirReferencia({ id: 1, codigo: '101', nombreInterno: 'PODEROSA base' });
    http.expectOne(`${BASE}/referencias/1/config`).flush(CONFIG);
    expect(cmp.tallaSel()).toBe(38);
    // grupo COLOR obligatorio sin elegir → no dispara resolve
    expect(cmp.faltantes()).toEqual(['Color']);
  });

  it('con la selección completa dispara resolve y guarda el resultado', fakeAsync(() => {
    const fixture = crear();
    http.expectOne(`${BASE}/referencias`).flush([{ id: 1, codigo: '101', nombreInterno: 'PODEROSA base' }]);
    const cmp = fixture.componentInstance;
    cmp.elegirReferencia({ id: 1, codigo: '101', nombreInterno: 'PODEROSA base' });
    http.expectOne(`${BASE}/referencias/1/config`).flush(CONFIG);
    cmp.setOpcion(1, 8); // elige Color = Café → completa obligatorios
    tick(150); // supera el debounce
    const req = http.expectOne((r) => r.url === `${BASE}/bom/resolve`);
    expect(req.request.params.get('referenciaId')).toBe('1');
    expect(req.request.params.get('talla')).toBe('38');
    expect(req.request.params.getAll('opcionIds')).toEqual(['8']);
    req.flush({ arbol: [{ materialId: 1, codigo: 'X', nombre: 'X', unidad: 'M', origen: 'COMPRADO', consumo: 0.1, hijos: [] }], comprados: [] });
    expect(cmp.resultado()?.arbol.length).toBe(1);
  }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/configurador.component.spec.ts'`
Expected: FAIL (`Cannot find module './configurador.component'`).

- [ ] **Step 3: Write the component**

Creá `configurador.component.ts`:

```ts
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, debounceTime, map, of, switchMap } from 'rxjs';
import { CatalogoApi } from '../../../core/api/catalogo.api';
import {
  BomResuelto, MarcaOpt, ReferenciaConfig, ReferenciaListItem, ResolverParams,
} from '../../../core/api/models/catalogo.models';
import { BuscadorSelectComponent } from '../../../shared/ui/buscador-select/buscador-select.component';
import { BomArbolComponent } from './bom-arbol/bom-arbol.component';
import { obligatoriosFaltantes, opcionIdsSel, tallasDeRef } from './configurador.util';

type ResolverResp = { ok: true; r: BomResuelto } | { ok: false; e: unknown };

@Component({
  selector: 'app-configurador',
  standalone: true,
  imports: [BuscadorSelectComponent, BomArbolComponent],
  template: `
    <div class="page">
      <div class="page-header"><div class="ph-title">Configurador de BOM</div></div>

      <div class="cfg">
        <!-- IZQUIERDA: selección -->
        <div class="card"><div class="card-body">
          <div class="panel-title">Selección</div>

          <label class="label">Referencia</label>
          <app-buscador-select [items]="referencias()" [etiqueta]="etiquetaRef" [sub]="subRef"
            placeholder="Buscar referencia…" (seleccionar)="elegirReferencia($event)" />

          @if (config(); as c) {
            <label class="label" style="margin-top:var(--sp-4)">Marca</label>
            <select class="input" (change)="elegirMarca($event)">
              <option [value]="''">— sin marca —</option>
              @for (m of c.marcas; track m.id) { <option [value]="m.id">{{ m.nombre }}</option> }
            </select>

            @for (e of c.ejes; track e.grupo.id) {
              <label class="label" style="margin-top:var(--sp-4)">
                {{ e.grupo.nombre }} @if (e.grupo.obligatorio) { <span style="color:var(--accent)">*</span> }
              </label>
              <select class="input" (change)="setOpcionEvent(e.grupo.id, $event)">
                <option [value]="''">— elegir —</option>
                @for (o of e.opciones; track o.id) { <option [value]="o.id">{{ o.nombre }}</option> }
              </select>
            }

            <label class="label" style="margin-top:var(--sp-4)">Talla</label>
            <select class="input" (change)="elegirTalla($event)">
              @for (t of tallas(); track t) { <option [value]="t" [selected]="t === tallaSel()">{{ t }}</option> }
            </select>
          }
        </div></div>

        <!-- DERECHA: BOM en vivo -->
        <div class="card"><div class="card-body">
          <div class="panel-title">BOM resuelto @if (tallaSel(); as t) { <span class="cell-sub">· talla {{ t }}</span> }</div>

          @if (!config()) {
            <p class="cell-sub">Elegí una referencia para empezar.</p>
          } @else if (faltantes().length) {
            <p class="cell-sub">Elegí: {{ faltantes().join(', ') }}</p>
          } @else if (cargando()) {
            <p class="cell-sub">Resolviendo…</p>
          } @else if (error()) {
            <p style="color:var(--error);font-size:var(--text-sm)">{{ error() }}</p>
          } @else if (resultado(); as r) {
            @if (!r.arbol.length) {
              <p class="cell-sub">Sin BOM cargado para esta selección.</p>
            } @else {
              <app-bom-arbol [nodos]="r.arbol" />
              <div class="panel-title" style="margin-top:var(--sp-5)">Materiales comprados ({{ r.comprados.length }})</div>
              <table class="tbl"><tbody>
                @for (c of r.comprados; track c.materialId) {
                  <tr><td>{{ c.nombre }}</td><td class="num">{{ c.consumo }} {{ c.unidad }}</td></tr>
                }
              </tbody></table>
            }
          }
        </div></div>
      </div>
    </div>
  `,
  styles: [`
    .cfg{display:grid;grid-template-columns:320px 1fr;gap:var(--sp-5);align-items:start}
    .panel-title{font-size:var(--text-h3);font-weight:var(--fw-semibold);margin-bottom:var(--sp-4)}
    .label{display:block;font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--sp-2)}
    .input{width:100%;padding:var(--sp-2) var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
    .tbl{width:100%;border-collapse:collapse}
    .tbl td{padding:var(--sp-2) 0;border-bottom:var(--bw) solid var(--border);font-size:var(--text-sm)}
    .tbl .num{text-align:right;font-family:var(--font-mono);color:var(--text-subtle)}
    @media (max-width:860px){.cfg{grid-template-columns:1fr}}
  `],
})
export class ConfiguradorComponent implements OnInit {
  private readonly api = inject(CatalogoApi);
  private readonly destroyRef = inject(DestroyRef);

  referencias = signal<ReferenciaListItem[]>([]);
  refSel = signal<ReferenciaListItem | null>(null);
  config = signal<ReferenciaConfig | null>(null);
  marcaSel = signal<MarcaOpt | null>(null);
  opcionesSel = signal<Map<number, number | null>>(new Map());
  tallaSel = signal<number | null>(null);
  resultado = signal<BomResuelto | null>(null);
  cargando = signal(false);
  error = signal('');

  tallas = computed(() => { const c = this.config(); return c ? tallasDeRef(c) : []; });
  faltantes = computed(() => { const c = this.config(); return c ? obligatoriosFaltantes(c.ejes, this.opcionesSel()) : []; });

  etiquetaRef = (r: ReferenciaListItem) => `${r.codigo} · ${r.nombreInterno}`;
  subRef = (r: ReferenciaListItem) => r.codigo;

  private readonly trigger = new Subject<ResolverParams>();

  constructor() {
    this.trigger.pipe(
      debounceTime(120),
      switchMap((p) =>
        this.api.resolver(p).pipe(
          map((r): ResolverResp => ({ ok: true, r })),
          catchError((e) => of<ResolverResp>({ ok: false, e })),
        ),
      ),
      takeUntilDestroyed(),
    ).subscribe((res) => {
      this.cargando.set(false);
      if (res.ok) { this.resultado.set(res.r); this.error.set(''); }
      else { this.resultado.set(null); this.error.set(this.msg(res.e)); }
    });
  }

  ngOnInit(): void {
    this.api.listarReferencias().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((r) => this.referencias.set(r));
  }

  elegirReferencia(r: ReferenciaListItem) {
    this.refSel.set(r);
    this.config.set(null);
    this.marcaSel.set(null);
    this.opcionesSel.set(new Map());
    this.resultado.set(null);
    this.error.set('');
    this.api.configReferencia(r.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((c) => {
      this.config.set(c);
      this.tallaSel.set(c.referencia.tallaMin);
      this.recalcular();
    });
  }

  elegirMarca(e: Event) {
    const id = (e.target as HTMLSelectElement).value;
    const m = this.config()?.marcas.find((x) => x.id === +id) ?? null;
    this.marcaSel.set(m);
    this.recalcular();
  }

  setOpcionEvent(grupoId: number, e: Event) {
    const v = (e.target as HTMLSelectElement).value;
    this.setOpcion(grupoId, v === '' ? null : +v);
  }

  setOpcion(grupoId: number, opcionId: number | null) {
    this.opcionesSel.update((m) => new Map(m).set(grupoId, opcionId));
    this.recalcular();
  }

  elegirTalla(e: Event) {
    this.tallaSel.set(+(e.target as HTMLSelectElement).value);
    this.recalcular();
  }

  private recalcular() {
    const ref = this.refSel();
    const config = this.config();
    const t = this.tallaSel();
    if (!ref || !config || t == null) return;
    if (obligatoriosFaltantes(config.ejes, this.opcionesSel()).length) { this.resultado.set(null); return; }
    this.cargando.set(true);
    this.trigger.next({
      referenciaId: ref.id,
      talla: t,
      marcaId: this.marcaSel()?.id,
      opcionIds: opcionIdsSel(this.opcionesSel()),
    });
  }

  private msg(e: unknown): string {
    const m = (e as { error?: { message?: string | string[] } })?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m ?? 'No se pudo resolver el BOM');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/configurador.component.spec.ts'`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the route**

En `app.routes.ts`, agregá dentro de `children` (antes del redirect `{ path: '', pathMatch: 'full', ... }`):

```ts
      { path: 'catalog/configurador', loadComponent: () => import('./features/catalog/configurador/configurador.component').then(m => m.ConfiguradorComponent) },
```

- [ ] **Step 6: Add the nav item**

En `shell.component.ts`, después del `</div>` que cierra el `nav-group` de "Operación" (antes del `nav-group` de "Planta · MES"), insertá:

```html
        <div class="nav-group">
          <div class="nav-group-h">Catálogo</div>
          <a class="nav-item" routerLink="/catalog/configurador" routerLinkActive="is-active">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h10"/><circle cx="19" cy="17" r="2"/></svg></span>
            <span class="nav-label">Configurador de BOM</span>
          </a>
        </div>
```

- [ ] **Step 7: Build to verify route + nav compile**

Run: `cd frontend && npx ng build`
Expected: `Application bundle generation complete.` sin errores (debe aparecer un chunk `configurador-component`).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/features/catalog/configurador/configurador.component.ts frontend/src/app/features/catalog/configurador/configurador.component.spec.ts frontend/src/app/app.routes.ts frontend/src/app/layout/shell/shell.component.ts
git commit -m "feat(configurador): pagina reactiva BOM en vivo + ruta + nav"
```

---

## Task 9: Verificación integral

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Suite backend completa**

Run: `cd backend && npx jest`
Expected: PASS, todas las suites (incluye los 13 del resolver + los nuevos de catalog/enriquecer).

- [ ] **Step 2: Suite frontend completa**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless`
Expected: PASS, todos los specs.

- [ ] **Step 3: Build de producción frontend**

Run: `cd frontend && npx ng build --configuration production`
Expected: `Application bundle generation complete.`

- [ ] **Step 4: E2E manual (con backend + DB local)**

1. Backend arriba (`npm run build && npm run start:prod`) y seed corrido (`npm run seed` + `npm run seed:catalogo`).
2. Frontend `npm start`, login admin/admin123.
3. Ir a "Configurador de BOM" → elegir referencia **101** → marca **Poderosa** → Color **Café** → Suela **River Creek** → talla **42**.
4. Verificar: el árbol muestra micropiel CAFÉ (override aplicado), la plantilla PU como FABRICADO con poliol hijo, y la lista de comprados. (Caso AGR-452, ya verificado contra el resolver backend.)

- [ ] **Step 5: NO mergear a master**

Por el workflow de branches acordado, `feat/m1-bom-ui` queda **sin mergear** hasta la Demo 2 (master = solo lo mostrado al cliente). Dejar el branch listo y pusheado:

```bash
git push -u origin feat/m1-bom-ui
```

---

## Notas de alcance (de la spec)

- **Solo cantidades**, sin costo (Material no tiene `precio`; queda para futuro).
- Sin CRUD/ABM de catálogo, sin import del Sheet legacy.
- **Riesgo conocido (fuera de alcance):** el resolvedor puede reventar con un BOM cíclico (hardening pendiente). El seed no tiene ciclos.
