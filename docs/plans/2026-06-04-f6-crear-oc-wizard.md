# F6 — Crear OC (Wizard) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un wizard de 4 pasos (Cliente → Productos → Curva de tallas → Revisar) que crea una OC en BORRADOR vía `POST /pedidos/oc`, permitiendo crear pedidos desde la UI.

**Architecture:** Backend: dos GET de lectura en el módulo `catalog` (`CatalogService`/`CatalogController`, Prisma global). Frontend: `CatalogoApi`, dos componentes reusables (`buscador-select` con búsqueda por signals, `talla-grid` para la curva) y el `oc-crear` (wizard con estado local en signals). La lógica del DTO y del rango de tallas vive en funciones puras testeables. Selector = dropdown con búsqueda simple; curva = rango real por producto; multi-producto.

**Tech Stack:** NestJS + Prisma + Jest (backend); Angular 19.2 standalone + signals, Karma/Jasmine (frontend). DS "Acero".

**Spec:** `docs/specs/2026-06-04-f6-crear-oc-wizard-design.md`.

---

## File Structure

```
backend/src/catalog/
  catalog.service.ts          ← CREAR: listarProductos() + listarTallas() (Prisma)
  catalog.service.spec.ts     ← CREAR: unit con prisma mock
  catalog.controller.ts       ← CREAR: GET /catalog/productos, GET /catalog/tallas
  catalog.module.ts           ← MODIFICAR: registrar controller + service

frontend/src/app/
  core/api/models/catalogo.models.ts   ← CREAR: ProductoConfiguradoFull, MarcaRef, ReferenciaRango
  core/api/catalogo.api.ts             ← CREAR: listarProductos(), listarTallas()
  core/api/catalogo.api.spec.ts        ← CREAR
  shared/ui/buscador-select/buscador-select.component.ts(+spec)  ← CREAR: dropdown búsqueda genérico
  shared/ui/talla-grid/talla-grid.component.ts(+spec)            ← CREAR: grilla de curva
  shared/ui/talla-grid/curva.util.ts(+spec)                     ← CREAR: totalCurva()
  features/pedidos/oc/oc-crear.util.ts(+spec)   ← CREAR: tallasDeProducto(), construirDto()
  features/pedidos/oc/oc-crear.component.ts(+spec) ← CREAR: el wizard
  app.routes.ts                        ← MODIFICAR: ruta pedidos/oc/nueva
  features/pedidos/oc/oc-list.component.ts ← MODIFICAR: botón "Nueva OC"
```

Reusa sin tocar: `PedidosApi.crearOC` + `CrearOCDto`/`CrearOCLineaDto`/`CrearOCTallaDto`, `ClientesApi.listar()`, modelo `Cliente`/`Talla`, clases globales del DS.

---

# BACKEND

## Task 1: `CatalogService` + `CatalogController` (GET productos/tallas)

**Files:**
- Create: `backend/src/catalog/catalog.service.ts`, `backend/src/catalog/catalog.service.spec.ts`, `backend/src/catalog/catalog.controller.ts`
- Modify: `backend/src/catalog/catalog.module.ts`

- [ ] **Step 1: Write the failing test** — Create `backend/src/catalog/catalog.service.spec.ts`:

```typescript
import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  const prisma = {
    productoConfigurado: { findMany: jest.fn() },
    talla: { findMany: jest.fn() },
  } as any;
  const service = new CatalogService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('listarProductos pide activos con marca y rango de referencia', async () => {
    prisma.productoConfigurado.findMany.mockResolvedValue([{ id: 1 }]);
    const r = await service.listarProductos();
    expect(prisma.productoConfigurado.findMany).toHaveBeenCalledTimes(1);
    const arg = prisma.productoConfigurado.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ activo: true });
    expect(arg.select.marca).toBeDefined();
    expect(arg.select.referencia.select.tallaMin).toBeDefined();
    expect(arg.select.referencia.select.tallaMax).toBeDefined();
    expect(r).toEqual([{ id: 1 }]);
  });

  it('listarTallas devuelve las tallas ordenadas por orden', async () => {
    prisma.talla.findMany.mockResolvedValue([{ id: 1, valor: 38, orden: 1 }]);
    const r = await service.listarTallas();
    expect(prisma.talla.findMany).toHaveBeenCalledWith({ orderBy: { orden: 'asc' } });
    expect(r).toEqual([{ id: 1, valor: 38, orden: 1 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `cd backend && npm test -- catalog.service` → FAIL (cannot find module './catalog.service').

- [ ] **Step 3: Write minimal implementation** — Create `backend/src/catalog/catalog.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listarProductos() {
    return this.prisma.productoConfigurado.findMany({
      where: { activo: true },
      orderBy: { nombreComercial: 'asc' },
      select: {
        id: true,
        codigo: true,
        nombreComercial: true,
        marca: { select: { id: true, nombre: true } },
        referencia: {
          select: {
            id: true,
            codigo: true,
            tallaMin: { select: { id: true, valor: true, orden: true } },
            tallaMax: { select: { id: true, valor: true, orden: true } },
          },
        },
      },
    });
  }

  listarTallas() {
    return this.prisma.talla.findMany({ orderBy: { orden: 'asc' } });
  }
}
```

Create `backend/src/catalog/catalog.controller.ts`:

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CatalogService } from './catalog.service';

@UseGuards(JwtAuthGuard)
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('productos')
  productos() {
    return this.catalog.listarProductos();
  }

  @Get('tallas')
  tallas() {
    return this.catalog.listarTallas();
  }
}
```

Modify `backend/src/catalog/catalog.module.ts` to register both (keep the existing Bom registration):

```typescript
import { Module } from '@nestjs/common';
import { BomController } from './bom/bom.controller';
import { BomLoaderService } from './bom/bom-loader.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [BomController, CatalogController],
  providers: [BomLoaderService, CatalogService],
})
export class CatalogModule {}
```

(`PrismaModule` es `@Global()`, así que `PrismaService` se inyecta sin imports extra.)

- [ ] **Step 4: Run test to verify it passes** — Run: `cd backend && npm test -- catalog.service` → PASS (2 specs). Then `cd backend && npm test` → toda la suite backend verde.

- [ ] **Step 5: Commit**

```bash
git add backend/src/catalog/catalog.service.ts backend/src/catalog/catalog.service.spec.ts backend/src/catalog/catalog.controller.ts backend/src/catalog/catalog.module.ts
git commit -m "feat(catalog): GET /catalog/productos y /catalog/tallas para el wizard de OC"
```

---

# FRONTEND — capa de datos

## Task 2: modelos `catalogo.models.ts` + `CatalogoApi`

**Files:**
- Create: `frontend/src/app/core/api/models/catalogo.models.ts`
- Create: `frontend/src/app/core/api/catalogo.api.ts`, `frontend/src/app/core/api/catalogo.api.spec.ts`

- [ ] **Step 1: Write the failing test** — Create `frontend/src/app/core/api/catalogo.api.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CatalogoApi } from './catalogo.api';

describe('CatalogoApi', () => {
  let api: CatalogoApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [CatalogoApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(CatalogoApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('listarProductos hace GET /catalog/productos', () => {
    api.listarProductos().subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/productos');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('listarTallas hace GET /catalog/tallas', () => {
    api.listarTallas().subscribe();
    const req = http.expectOne('http://localhost:3001/catalog/tallas');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- --watch=false --browsers=ChromeHeadless` → FAIL (cannot find module './catalogo.api').

- [ ] **Step 3: Write minimal implementation** — Create `frontend/src/app/core/api/models/catalogo.models.ts`:

```typescript
import { Talla } from './pedidos.models';

export interface MarcaRef { id: number; nombre: string; }
export interface ReferenciaRango { id: number; codigo: string; tallaMin: Talla; tallaMax: Talla; }
export interface ProductoConfiguradoFull {
  id: number;
  codigo: string;
  nombreComercial: string;
  marca: MarcaRef;
  referencia: ReferenciaRango;
}
```

Create `frontend/src/app/core/api/catalogo.api.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ProductoConfiguradoFull } from './models/catalogo.models';
import { Talla } from './models/pedidos.models';

@Injectable({ providedIn: 'root' })
export class CatalogoApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/catalog`;

  listarProductos() { return this.http.get<ProductoConfiguradoFull[]>(`${this.base}/productos`); }
  listarTallas() { return this.http.get<Talla[]>(`${this.base}/tallas`); }
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- --watch=false --browsers=ChromeHeadless` → PASS (2 nuevos; suite verde).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/api/models/catalogo.models.ts frontend/src/app/core/api/catalogo.api.ts frontend/src/app/core/api/catalogo.api.spec.ts
git commit -m "feat(catalogo): CatalogoApi + modelo ProductoConfiguradoFull"
```

---

# FRONTEND — componentes reusables

## Task 3: `buscador-select` (dropdown con búsqueda, genérico)

**Files:**
- Create: `frontend/src/app/shared/ui/buscador-select/buscador-select.component.ts`, `…/buscador-select.component.spec.ts`

- [ ] **Step 1: Write the failing test** — Create `…/buscador-select.component.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { BuscadorSelectComponent } from './buscador-select.component';

interface Item { id: number; nombre: string; nit: string; }

describe('BuscadorSelectComponent', () => {
  function setup(items: Item[]) {
    TestBed.configureTestingModule({ imports: [BuscadorSelectComponent] });
    const fixture = TestBed.createComponent<BuscadorSelectComponent<Item>>(BuscadorSelectComponent);
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('etiqueta', (i: Item) => i.nombre);
    fixture.componentRef.setInput('sub', (i: Item) => i.nit);
    fixture.detectChanges();
    return fixture;
  }
  const ITEMS: Item[] = [
    { id: 1, nombre: 'Minera El Roble', nit: '900111' },
    { id: 2, nombre: 'Maquila Norte', nit: '901222' },
  ];

  it('filtra la lista por etiqueta', () => {
    const fixture = setup(ITEMS);
    const c = fixture.componentInstance;
    c.filtro.set('maqui');
    expect(c.filtrados().map(i => i.id)).toEqual([2]);
  });

  it('filtra también por sub (NIT)', () => {
    const fixture = setup(ITEMS);
    fixture.componentInstance.filtro.set('900111');
    expect(fixture.componentInstance.filtrados().map(i => i.id)).toEqual([1]);
  });

  it('emite seleccionar al elegir un item', () => {
    const fixture = setup(ITEMS);
    const c = fixture.componentInstance;
    let elegido: Item | null = null;
    c.seleccionar.subscribe((i: Item) => (elegido = i));
    c.elegir(ITEMS[0]);
    expect(elegido).toEqual(ITEMS[0]);
    expect(c.abierto()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- --watch=false --browsers=ChromeHeadless` → FAIL (cannot find module).

- [ ] **Step 3: Write minimal implementation** — Create `…/buscador-select.component.ts`:

```typescript
import { Component, computed, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-buscador-select',
  standalone: true,
  template: `
    <div class="bsc">
      <input class="input bsc-input" type="text" [placeholder]="placeholder()" [value]="filtro()"
        (input)="onFiltro($event)" (focus)="abierto.set(true)" (keydown.enter)="elegirPrimero($event)" />
      @if (abierto() && filtrados().length) {
        <div class="bsc-list">
          @for (item of filtrados(); track $index) {
            <button type="button" class="bsc-opt" (click)="elegir(item)">
              <span class="bsc-main">{{ etiqueta()(item) }}</span>
              @if (sub(); as s) { <span class="bsc-sub">{{ s(item) }}</span> }
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .bsc{position:relative}
    .bsc-input{width:100%}
    .bsc-list{position:absolute;z-index:20;top:calc(100% + 4px);left:0;right:0;max-height:240px;overflow:auto;background:var(--surface);border:var(--bw) solid var(--border);border-radius:var(--r-md);box-shadow:var(--shadow-md,0 8px 24px rgba(0,0,0,.12));padding:var(--sp-1)}
    .bsc-opt{display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3);width:100%;text-align:left;background:none;border:0;padding:var(--sp-2) var(--sp-3);border-radius:var(--r-sm);cursor:pointer;font-size:var(--text-sm);color:var(--text)}
    .bsc-opt:hover{background:var(--surface-hover)}
    .bsc-main{font-weight:var(--fw-medium)}
    .bsc-sub{font-family:var(--font-mono);font-size:var(--text-caption);color:var(--text-subtle)}
  `],
})
export class BuscadorSelectComponent<T> {
  items = input<T[]>([]);
  etiqueta = input.required<(item: T) => string>();
  sub = input<((item: T) => string) | null>(null);
  placeholder = input('Buscar…');
  seleccionar = output<T>();

  filtro = signal('');
  abierto = signal(false);

  filtrados = computed(() => {
    const f = this.filtro().trim().toLowerCase();
    const et = this.etiqueta();
    const sb = this.sub();
    if (!f) return this.items();
    return this.items().filter(
      (it) => et(it).toLowerCase().includes(f) || (sb ? sb(it).toLowerCase().includes(f) : false),
    );
  });

  onFiltro(e: Event) {
    this.filtro.set((e.target as HTMLInputElement).value);
    this.abierto.set(true);
  }
  elegir(item: T) {
    this.seleccionar.emit(item);
    this.filtro.set(this.etiqueta()(item));
    this.abierto.set(false);
  }
  elegirPrimero(e: Event) {
    e.preventDefault();
    const f = this.filtrados();
    if (f.length) this.elegir(f[0]);
  }
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- --watch=false --browsers=ChromeHeadless` → PASS (3 nuevos; suite verde).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/ui/buscador-select/
git commit -m "feat(ui): buscador-select (dropdown con busqueda, generico)"
```

---

## Task 4: `talla-grid` + `totalCurva`

**Files:**
- Create: `frontend/src/app/shared/ui/talla-grid/curva.util.ts`, `…/curva.util.spec.ts`
- Create: `frontend/src/app/shared/ui/talla-grid/talla-grid.component.ts`, `…/talla-grid.component.spec.ts`

- [ ] **Step 1: Write the failing tests** — Create `…/curva.util.spec.ts`:

```typescript
import { totalCurva } from './curva.util';

describe('totalCurva', () => {
  it('suma las cantidades del mapa', () => {
    expect(totalCurva({ 1: 10, 2: 5, 3: 0 })).toBe(15);
  });
  it('un mapa vacío suma 0', () => {
    expect(totalCurva({})).toBe(0);
  });
});
```

Create `…/talla-grid.component.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { TallaGridComponent } from './talla-grid.component';
import { Talla } from '../../../core/api/models/pedidos.models';

const TALLAS: Talla[] = [
  { id: 1, valor: 38, orden: 1 },
  { id: 2, valor: 39, orden: 2 },
];

describe('TallaGridComponent', () => {
  function setup(valores: Record<number, number>) {
    TestBed.configureTestingModule({ imports: [TallaGridComponent] });
    const fixture = TestBed.createComponent(TallaGridComponent);
    fixture.componentRef.setInput('tallas', TALLAS);
    fixture.componentRef.setInput('valores', valores);
    fixture.detectChanges();
    return fixture;
  }

  it('muestra el total de la curva', () => {
    const fixture = setup({ 1: 10, 2: 5 });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('15');
  });

  it('emite el mapa actualizado al editar una talla', () => {
    const fixture = setup({ 1: 10 });
    const c = fixture.componentInstance;
    let emitido: Record<number, number> | null = null;
    c.cambio.subscribe((m: Record<number, number>) => (emitido = m));
    const input = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;
    input.value = '7';
    input.dispatchEvent(new Event('input'));
    expect(emitido).toEqual({ 1: 7 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail** — Run: `npm test -- --watch=false --browsers=ChromeHeadless` → FAIL (modules not found).

- [ ] **Step 3: Write minimal implementation** — Create `…/curva.util.ts`:

```typescript
export function totalCurva(valores: Record<number, number>): number {
  return Object.values(valores).reduce((a, b) => a + (b || 0), 0);
}
```

Create `…/talla-grid.component.ts`:

```typescript
import { Component, computed, input, output } from '@angular/core';
import { Talla } from '../../../core/api/models/pedidos.models';
import { totalCurva } from './curva.util';

@Component({
  selector: 'app-talla-grid',
  standalone: true,
  template: `
    <div class="tg">
      @for (t of tallas(); track t.id) {
        <label class="tg-cell">
          <span class="tg-talla">{{ t.valor }}</span>
          <input type="number" min="0" class="tg-input" [value]="valores()[t.id] || ''" (input)="onInput(t.id, $event)" />
        </label>
      }
    </div>
    <div class="tg-total">Total: <b>{{ total() }}</b> pares</div>
  `,
  styles: [`
    .tg{display:flex;flex-wrap:wrap;gap:var(--sp-2)}
    .tg-cell{display:flex;flex-direction:column;align-items:center;gap:4px}
    .tg-talla{font-family:var(--font-mono);font-size:var(--text-caption);color:var(--text-muted)}
    .tg-input{width:52px;text-align:center;padding:var(--sp-2);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text);font-family:var(--font-mono)}
    .tg-input:focus{outline:none;border-color:var(--border-interactive);box-shadow:var(--focus-ring-shadow)}
    .tg-total{margin-top:var(--sp-3);font-size:var(--text-sm);color:var(--text-muted)}
    .tg-total b{color:var(--text);font-family:var(--font-mono)}
  `],
})
export class TallaGridComponent {
  tallas = input<Talla[]>([]);
  valores = input<Record<number, number>>({});
  cambio = output<Record<number, number>>();

  total = computed(() => totalCurva(this.valores()));

  onInput(tallaId: number, e: Event) {
    const n = Math.max(0, Number((e.target as HTMLInputElement).value) || 0);
    this.cambio.emit({ ...this.valores(), [tallaId]: n });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass** — Run: `npm test -- --watch=false --browsers=ChromeHeadless` → PASS (4 nuevos; suite verde).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/ui/talla-grid/
git commit -m "feat(ui): talla-grid (curva editable) + totalCurva"
```

---

# FRONTEND — wizard

## Task 5: funciones puras del wizard (`oc-crear.util.ts`)

**Files:**
- Create: `frontend/src/app/features/pedidos/oc/oc-crear.util.ts`, `…/oc-crear.util.spec.ts`

- [ ] **Step 1: Write the failing test** — Create `…/oc-crear.util.spec.ts`:

```typescript
import { tallasDeProducto, construirDto, LineaWizard } from './oc-crear.util';
import { Talla } from '../../../core/api/models/pedidos.models';
import { ProductoConfiguradoFull } from '../../../core/api/models/catalogo.models';

const TALLAS: Talla[] = [
  { id: 1, valor: 38, orden: 1 }, { id: 2, valor: 39, orden: 2 },
  { id: 3, valor: 40, orden: 3 }, { id: 4, valor: 41, orden: 4 },
];
const PROD: ProductoConfiguradoFull = {
  id: 7, codigo: 'BD', nombreComercial: 'Bota Dieléctrica',
  marca: { id: 1, nombre: 'PODEROSA' },
  referencia: { id: 1, codigo: '101', tallaMin: { id: 2, valor: 39, orden: 2 }, tallaMax: { id: 3, valor: 40, orden: 3 } },
};

describe('oc-crear.util', () => {
  it('tallasDeProducto filtra al rango orden de la referencia', () => {
    expect(tallasDeProducto(PROD, TALLAS).map(t => t.valor)).toEqual([39, 40]);
  });

  it('construirDto arma el DTO y descarta cantidades 0', () => {
    const lineas: LineaWizard[] = [{ producto: PROD, valores: { 2: 10, 3: 0, 99: 5 } }];
    const dto = construirDto({ clienteId: 3, ocCliente: 'PO-1', observaciones: '', lineas });
    expect(dto).toEqual({
      clienteId: 3,
      ocCliente: 'PO-1',
      observaciones: undefined,
      lineas: [{ productoConfiguradoId: 7, tallas: [{ tallaId: 2, cantidad: 10 }, { tallaId: 99, cantidad: 5 }] }],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- --watch=false --browsers=ChromeHeadless` → FAIL (module not found).

- [ ] **Step 3: Write minimal implementation** — Create `…/oc-crear.util.ts`:

```typescript
import { Talla, CrearOCDto } from '../../../core/api/models/pedidos.models';
import { ProductoConfiguradoFull } from '../../../core/api/models/catalogo.models';

export interface LineaWizard {
  producto: ProductoConfiguradoFull;
  valores: Record<number, number>;
}

export function tallasDeProducto(producto: ProductoConfiguradoFull, todas: Talla[]): Talla[] {
  const min = producto.referencia.tallaMin.orden;
  const max = producto.referencia.tallaMax.orden;
  return todas.filter((t) => t.orden >= min && t.orden <= max);
}

export function construirDto(args: {
  clienteId: number;
  ocCliente?: string;
  observaciones?: string;
  lineas: LineaWizard[];
}): CrearOCDto {
  return {
    clienteId: args.clienteId,
    ocCliente: args.ocCliente ? args.ocCliente : undefined,
    observaciones: args.observaciones ? args.observaciones : undefined,
    lineas: args.lineas.map((l) => ({
      productoConfiguradoId: l.producto.id,
      tallas: Object.entries(l.valores)
        .map(([tallaId, cantidad]) => ({ tallaId: Number(tallaId), cantidad }))
        .filter((t) => t.cantidad > 0),
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- --watch=false --browsers=ChromeHeadless` → PASS (2 nuevos; suite verde).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/pedidos/oc/oc-crear.util.ts frontend/src/app/features/pedidos/oc/oc-crear.util.spec.ts
git commit -m "feat(pedidos): helpers del wizard (tallasDeProducto, construirDto)"
```

---

## Task 6: `oc-crear` (el wizard)

**Files:**
- Create: `frontend/src/app/features/pedidos/oc/oc-crear.component.ts`, `…/oc-crear.component.spec.ts`

- [ ] **Step 1: Write the failing smoke test** — Create `…/oc-crear.component.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { OcCrearComponent } from './oc-crear.component';

describe('OcCrearComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [OcCrearComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(OcCrearComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // carga de catálogo en ngOnInit
    http.expectOne('http://localhost:3001/clientes').flush([{ id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true }]);
    http.expectOne('http://localhost:3001/catalog/productos').flush([{ id: 7, codigo: 'BD', nombreComercial: 'Bota Dieléctrica', marca: { id: 1, nombre: 'PODEROSA' }, referencia: { id: 1, codigo: '101', tallaMin: { id: 1, valor: 38, orden: 1 }, tallaMax: { id: 2, valor: 39, orden: 2 } } }]);
    http.expectOne('http://localhost:3001/catalog/tallas').flush([{ id: 1, valor: 38, orden: 1 }, { id: 2, valor: 39, orden: 2 }]);
    fixture.detectChanges();
    return { fixture, http };
  }

  it('carga el catálogo y arranca en el paso 0 (Cliente)', () => {
    const { fixture, http } = setup();
    expect(fixture.componentInstance.paso()).toBe(0);
    expect(fixture.componentInstance.clientes().length).toBe(1);
    expect(fixture.componentInstance.productos().length).toBe(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Cliente');
    http.verify();
  });

  it('crear() arma el DTO y hace POST /pedidos/oc', () => {
    const { fixture, http } = setup();
    const c = fixture.componentInstance;
    // simular estado completo
    c.clienteSel.set({ id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } as any);
    c.lineas.set([{ producto: c.productos()[0], valores: { 1: 12 } }]);
    c.crear();
    const req = http.expectOne('http://localhost:3001/pedidos/oc');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ clienteId: 3, ocCliente: undefined, observaciones: undefined, lineas: [{ productoConfiguradoId: 7, tallas: [{ tallaId: 1, cantidad: 12 }] }] });
    req.flush({ id: 1, consecutivo: 1, estado: 'BORRADOR' });
    http.verify();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- --watch=false --browsers=ChromeHeadless` → FAIL (cannot find module './oc-crear.component').

- [ ] **Step 3: Write minimal implementation** — Create `…/oc-crear.component.ts`:

```typescript
import { Component, OnInit, computed, inject, signal, DestroyRef } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ClientesApi } from '../../../core/api/clientes.api';
import { PedidosApi } from '../../../core/api/pedidos.api';
import { CatalogoApi } from '../../../core/api/catalogo.api';
import { Cliente, Talla } from '../../../core/api/models/pedidos.models';
import { ProductoConfiguradoFull } from '../../../core/api/models/catalogo.models';
import { BuscadorSelectComponent } from '../../../shared/ui/buscador-select/buscador-select.component';
import { TallaGridComponent } from '../../../shared/ui/talla-grid/talla-grid.component';
import { LineaWizard, tallasDeProducto, construirDto } from './oc-crear.util';
import { totalCurva } from '../../../shared/ui/talla-grid/curva.util';

@Component({
  selector: 'app-oc-crear',
  standalone: true,
  imports: [FormsModule, BuscadorSelectComponent, TallaGridComponent],
  template: `
    <div class="page" style="max-width:920px;margin:0 auto">
      <div class="page-header">
        <div><div class="ph-title">Nueva Orden de Compra</div></div>
      </div>

      <!-- STEPPER -->
      <div class="card" style="padding:var(--sp-4) var(--sp-5);margin-bottom:var(--sp-5)">
        <div class="wz-steps">
          @for (s of pasosLabels; track $index) {
            <div class="wz-step" [class.is-active]="paso() === $index" [class.is-done]="paso() > $index">
              <span class="wz-marker">{{ $index + 1 }}</span><span class="wz-label">{{ s }}</span>
            </div>
          }
        </div>
      </div>

      <div class="card"><div class="card-body">
        <!-- PASO 0: CLIENTE -->
        @if (paso() === 0) {
          <div class="panel-title">Cliente</div>
          <label class="label">Cliente <span style="color:var(--accent)">*</span></label>
          <app-buscador-select [items]="clientes()" [etiqueta]="nombreCliente" [sub]="nitCliente"
            placeholder="Buscar cliente…" (seleccionar)="clienteSel.set($event)" />
          @if (clienteSel(); as cl) { <p class="cell-sub" style="margin-top:var(--sp-2)">Seleccionado: <b>{{ cl.nombre }}</b> · {{ cl.nit }}</p> }
          <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4);margin-top:var(--sp-4)">
            <div><label class="label">OC del cliente (opcional)</label><input class="input" [ngModel]="ocCliente()" (ngModelChange)="ocCliente.set($event)" /></div>
            <div><label class="label">Observaciones (opcional)</label><input class="input" [ngModel]="observaciones()" (ngModelChange)="observaciones.set($event)" /></div>
          </div>
        }

        <!-- PASO 1: PRODUCTOS -->
        @if (paso() === 1) {
          <div class="panel-title">Productos</div>
          <app-buscador-select [items]="productosDisponibles()" [etiqueta]="nombreProducto" [sub]="codigoProducto"
            placeholder="Buscar producto…" (seleccionar)="agregarProducto($event)" />
          <div style="margin-top:var(--sp-4);display:flex;flex-direction:column;gap:var(--sp-2)">
            @for (l of lineas(); track l.producto.id) {
              <div class="kv"><span class="v"><b>{{ l.producto.nombreComercial }}</b> <span class="cell-sub cell-mono">{{ l.producto.codigo }}</span></span>
                <button class="btn btn-ghost btn-sm" type="button" (click)="quitarProducto(l.producto.id)">Quitar</button></div>
            }
            @if (!lineas().length) { <p class="cell-sub">Agregá al menos un producto.</p> }
          </div>
        }

        <!-- PASO 2: CURVA -->
        @if (paso() === 2) {
          <div class="panel-title">Curva de tallas</div>
          @for (l of lineas(); track l.producto.id) {
            <div style="margin-bottom:var(--sp-5)">
              <div style="font-weight:var(--fw-medium);margin-bottom:var(--sp-2)">{{ l.producto.nombreComercial }}
                <span class="cell-sub cell-mono">curva {{ l.producto.referencia.tallaMin.valor }}–{{ l.producto.referencia.tallaMax.valor }}</span></div>
              <app-talla-grid [tallas]="tallasDe(l.producto)" [valores]="l.valores" (cambio)="setValores(l.producto.id, $event)" />
            </div>
          }
        }

        <!-- PASO 3: REVISAR -->
        @if (paso() === 3) {
          <div class="panel-title">Revisar</div>
          <div class="kv"><span class="k">Cliente</span><span class="v">{{ clienteSel()?.nombre }}</span></div>
          @for (l of lineas(); track l.producto.id) {
            <div style="margin-top:var(--sp-3)"><b>{{ l.producto.nombreComercial }}</b> — {{ totalLinea(l) }} pares</div>
          }
          <div style="margin-top:var(--sp-3);font-weight:var(--fw-semibold)">Total general: {{ totalGeneral() }} pares</div>
          @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-top:var(--sp-3)">{{ error() }}</p> }
        }
      </div></div>

      <!-- FOOT -->
      <div class="wizard-foot" style="display:flex;justify-content:space-between;align-items:center;margin-top:var(--sp-5)">
        <button class="btn btn-ghost" type="button" [style.visibility]="paso() === 0 ? 'hidden' : 'visible'" (click)="atras()">Atrás</button>
        <div class="cell-sub">Paso {{ paso() + 1 }} de 4</div>
        @if (paso() < 3) {
          <button class="btn btn-primary" type="button" [disabled]="!pasoValido()" (click)="siguiente()">Continuar</button>
        } @else {
          <button class="btn btn-primary" type="button" [class.is-loading]="enviando()" [disabled]="enviando() || !pasoValido()" (click)="crear()">Crear OC</button>
        }
      </div>
    </div>
  `,
  styles: [`
    .wz-steps{display:flex;gap:var(--sp-4)}
    .wz-step{display:flex;align-items:center;gap:var(--sp-2);color:var(--text-subtle);font-size:var(--text-sm)}
    .wz-step.is-active{color:var(--text);font-weight:var(--fw-medium)}
    .wz-step.is-done{color:var(--primary)}
    .wz-marker{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;border:var(--bw) solid var(--border);font-size:var(--text-caption);font-family:var(--font-mono)}
    .wz-step.is-active .wz-marker{background:var(--primary);color:var(--primary-fg);border-color:var(--primary)}
    .wz-step.is-done .wz-marker{background:var(--primary-subtle);color:var(--primary);border-color:var(--primary)}
    .panel-title{font-size:var(--text-h3);font-weight:var(--fw-semibold);margin-bottom:var(--sp-4)}
    .label{display:block;font-size:var(--text-sm);color:var(--text-muted);margin-bottom:var(--sp-2)}
    .input{width:100%;padding:var(--sp-2) var(--sp-3);border:var(--bw) solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text)}
    .kv{display:flex;justify-content:space-between;align-items:center;gap:var(--sp-3);padding:var(--sp-2) 0}
  `],
})
export class OcCrearComponent implements OnInit {
  private readonly clientesApi = inject(ClientesApi);
  private readonly pedidosApi = inject(PedidosApi);
  private readonly catalogoApi = inject(CatalogoApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  pasosLabels = ['Cliente', 'Productos', 'Curva de tallas', 'Revisar'];

  clientes = signal<Cliente[]>([]);
  productos = signal<ProductoConfiguradoFull[]>([]);
  tallas = signal<Talla[]>([]);

  clienteSel = signal<Cliente | null>(null);
  ocCliente = signal('');
  observaciones = signal('');
  lineas = signal<LineaWizard[]>([]);
  paso = signal<0 | 1 | 2 | 3>(0);
  enviando = signal(false);
  error = signal('');

  // funciones de etiqueta para los buscadores (bound como propiedades)
  nombreCliente = (c: Cliente) => c.nombre;
  nitCliente = (c: Cliente) => c.nit;
  nombreProducto = (p: ProductoConfiguradoFull) => p.nombreComercial;
  codigoProducto = (p: ProductoConfiguradoFull) => p.codigo;

  productosDisponibles = computed(() => {
    const usados = new Set(this.lineas().map((l) => l.producto.id));
    return this.productos().filter((p) => !usados.has(p.id));
  });

  totalGeneral = computed(() => this.lineas().reduce((acc, l) => acc + totalCurva(l.valores), 0));

  ngOnInit(): void {
    this.clientesApi.listar().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((c) => this.clientes.set(c));
    this.catalogoApi.listarProductos().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p) => this.productos.set(p));
    this.catalogoApi.listarTallas().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((t) => this.tallas.set(t));
  }

  tallasDe(p: ProductoConfiguradoFull): Talla[] { return tallasDeProducto(p, this.tallas()); }
  totalLinea(l: LineaWizard): number { return totalCurva(l.valores); }

  agregarProducto(p: ProductoConfiguradoFull) {
    if (this.lineas().some((l) => l.producto.id === p.id)) return;
    this.lineas.update((ls) => [...ls, { producto: p, valores: {} }]);
  }
  quitarProducto(id: number) { this.lineas.update((ls) => ls.filter((l) => l.producto.id !== id)); }
  setValores(productoId: number, valores: Record<number, number>) {
    this.lineas.update((ls) => ls.map((l) => (l.producto.id === productoId ? { ...l, valores } : l)));
  }

  pasoValido(): boolean {
    switch (this.paso()) {
      case 0: return this.clienteSel() !== null;
      case 1: return this.lineas().length >= 1;
      case 2: return this.lineas().every((l) => totalCurva(l.valores) > 0);
      default: return this.lineas().length >= 1 && this.clienteSel() !== null;
    }
  }

  siguiente() { if (this.pasoValido() && this.paso() < 3) this.paso.update((p) => (p + 1) as 0 | 1 | 2 | 3); }
  atras() { if (this.paso() > 0) this.paso.update((p) => (p - 1) as 0 | 1 | 2 | 3); }

  crear() {
    const cl = this.clienteSel();
    if (!cl || this.enviando() || !this.pasoValido()) return;
    this.enviando.set(true); this.error.set('');
    const dto = construirDto({ clienteId: cl.id, ocCliente: this.ocCliente(), observaciones: this.observaciones(), lineas: this.lineas() });
    this.pedidosApi.crearOC(dto).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.enviando.set(false); this.router.navigateByUrl('/pedidos/oc'); },
      error: (e) => { this.enviando.set(false); this.error.set(this.msg(e)); },
    });
  }

  private msg(e: any): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m ?? 'No se pudo crear la OC');
  }
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- --watch=false --browsers=ChromeHeadless` → PASS (2 nuevos; suite verde).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/pedidos/oc/oc-crear.component.ts frontend/src/app/features/pedidos/oc/oc-crear.component.spec.ts
git commit -m "feat(pedidos): oc-crear (wizard 4 pasos para crear OC)"
```

---

## Task 7: ruta `/pedidos/oc/nueva` + botón "Nueva OC"

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/features/pedidos/oc/oc-list.component.ts`

- [ ] **Step 1: Agregar la ruta** — En `app.routes.ts`, dentro de los `children`, agregar después de `pedidos/oc` (y antes de `pedidos/op`):

```typescript
      { path: 'pedidos/oc/nueva', loadComponent: () => import('./features/pedidos/oc/oc-crear.component').then(m => m.OcCrearComponent) },
```

Quedando el bloque:
```typescript
      { path: 'pedidos/oc', loadComponent: () => import('./features/pedidos/oc/oc-list.component').then(m => m.OcListComponent) },
      { path: 'pedidos/oc/nueva', loadComponent: () => import('./features/pedidos/oc/oc-crear.component').then(m => m.OcCrearComponent) },
      { path: 'pedidos/op', loadComponent: () => import('./features/pedidos/op/op-list.component').then(m => m.OpListComponent) },
      { path: 'pedidos/op/:id', loadComponent: () => import('./features/pedidos/op/op-detalle.component').then(m => m.OpDetalleComponent) },
```

- [ ] **Step 2: Agregar el botón "Nueva OC"** — En `oc-list.component.ts`, importar `RouterLink` (agregarlo a `imports` del decorador: `imports: [DatePipe, DrawerComponent, OcDetalleComponent, RouterLink]`, y al import de '@angular/router'). Reemplazar el `page-header` actual:

```html
      <div class="page-header">
        <div><div class="ph-title">Órdenes de Compra</div></div>
      </div>
```

por:

```html
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
        <div><div class="ph-title">Órdenes de Compra</div></div>
        <a class="btn btn-primary" routerLink="/pedidos/oc/nueva">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Nueva OC
        </a>
      </div>
```

Leé el archivo primero para confirmar el `import { ... } from '@angular/router'` (si no hay, agregá `import { RouterLink } from '@angular/router';`).

- [ ] **Step 3: Run tests** — Run: `npm test -- --watch=false --browsers=ChromeHeadless` → toda la suite verde (cambios de routing/botón no rompen specs; si el spec de oc-list necesita router por el `routerLink`, agregar `provideRouter([])` a su TestBed).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/features/pedidos/oc/oc-list.component.ts
git commit -m "feat(pedidos): ruta /pedidos/oc/nueva + boton Nueva OC en el listado"
```

---

## Task 8: Verificación (build + E2E + handoff)

**Files:** ninguno (verificación).

- [ ] **Step 1: Build** — Run (frontend): `npm run build` → `Application bundle generation complete.` sin warnings. Run (backend): `cd backend && npm run build` (si falta dist, borrar `tsconfig.build.tsbuildinfo` y reconstruir — ver deuda en ESTADO).

- [ ] **Step 2: E2E con Playwright (stack en :3001/:4200)** — reiniciar backend tras agregar endpoints (`npm run build && npm run start:prod`).
  1. Login `admin`/`admin123`.
  2. En `/pedidos/oc` → botón **"Nueva OC"** → `/pedidos/oc/nueva`.
  3. Paso 1: buscar y elegir cliente (ej. Minera El Roble) → Continuar.
  4. Paso 2: buscar y agregar un producto (ej. Bota Dieléctrica Poderosa) → Continuar.
  5. Paso 3: cargar cantidades en algunas tallas (Total > 0) → Continuar.
  6. Paso 4: revisar → **Crear OC** → vuelve a `/pedidos/oc` con la nueva OC en **BORRADOR**.
  7. Abrir la OC nueva → Confirmar OC → Generar OP → ver el amarre (flujo completo end-to-end desde la UI).

  Expected: se crea la OC desde la UI y el ciclo OC→OP→amarre funciona sin tocar la API.

- [ ] **Step 3: Actualizar handoff** — Editar `docs/ESTADO.md`: marcar **F6 hecho** (wizard Crear OC + GET catalog/productos·tallas + buscador-select + talla-grid); **ya no quedan features del flujo de pedidos pendientes**. Sumar los nuevos tests al conteo.

- [ ] **Step 4: Commit**

```bash
git add docs/ESTADO.md
git commit -m "docs: F6 Crear OC wizard completo — flujo de pedidos end-to-end desde la UI"
```

---

## Self-Review (hecho)

- **Cobertura del spec:** §2 backend endpoints → Task 1 ✓; §3 datos → Task 2 ✓; §4 buscador-select → Task 3, talla-grid → Task 4 ✓; §5 helpers → Task 5, wizard → Task 6 ✓; §6 routing+botón → Task 7 ✓; §7 testing en cada task ✓; verificación → Task 8 ✓.
- **Sin placeholders:** todo el código está completo en cada paso.
- **Consistencia de tipos:** `ProductoConfiguradoFull`/`MarcaRef`/`ReferenciaRango` (Task 2) usados en Tasks 3-6; `LineaWizard`/`tallasDeProducto`/`construirDto` (Task 5) usados idénticos en Task 6; `totalCurva` (Task 4) reusado en Task 6; `CrearOCDto`/`CrearOCLineaDto`/`CrearOCTallaDto` ya existen; `BuscadorSelectComponent`/`TallaGridComponent` (Tasks 3-4) importados en Task 6. Ruta `pedidos/oc/nueva` antes de `pedidos/op*` y junto a `pedidos/oc` (Task 7).
- **YAGNI:** sin combobox CDK, sin "Guardar borrador", sin edición de OC; validación mínima por paso.
