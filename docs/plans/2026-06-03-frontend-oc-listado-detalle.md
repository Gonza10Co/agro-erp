# Frontend — Feature F5: Listado de OC + Detalle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la pantalla de Órdenes de Compra (tabla densa con `listarOC` + detalle en drawer con `obtenerOC`, y las acciones confirmar / generar OP), reemplazando el placeholder de la ruta `/pedidos/oc`.

**Architecture:** Angular 19 standalone + signals. Reusa `PedidosApi` (ya existe, con `listarOC`/`obtenerOC`/`confirmarOC`/`generarOP`), el `ui-drawer` (ya existe) y los estilos del design system "Acero" (`.data`, `.drawer`, `.kv-list`, `.badge-*`, `.drawer-foot`, `.btn-*`). El detalle de la OC se abre en el drawer (mismo patrón que Clientes/F4), no en una ruta aparte. Las acciones mutan el estado en el backend y refrescan tanto el detalle como la lista.

**Tech Stack:** Angular 19.2, signals (`input()`/`output()`/`signal()`/`computed()`), `DatePipe`, Karma/Jasmine.

**Spec:** `docs/specs/2026-06-03-frontend-flujo-pedidos-design.md` (§5 componentes, §6 routing, §10 fase F5).
**Precondición:** Plan 1 (Fundaciones) + F4 (Clientes) en master — `PedidosApi`, modelos, `ui-drawer`, shell y routing existen. Seed de demo con OCs en la DB local.

---

## Contrato del backend (verificado en el código)

- `GET /pedidos/oc` (`listarOC`) → `OrdenCompra[]`, ordenadas por `consecutivo` desc. Incluye
  `cliente {id, nit, nombre}` y `ordenProduccion {id, consecutivo, estado} | null`. **No** incluye `lineas`.
- `GET /pedidos/oc/:id` (`obtenerOC`) → `OrdenCompra` con `cliente` (completo),
  `ordenProduccion {id, consecutivo, estado} | null` y `lineas[]` → `productoConfigurado` + `tallas[]` (con `talla`, ordenadas).
- `POST /pedidos/oc/:id/confirmar` (`confirmarOC`) → solo válido si la OC está en `BORRADOR`; pasa a `CONFIRMADA`.
  Si falla devuelve `{ message: string[] }` (array de errores de validación).
- `POST /pedidos/op/desde-oc/:ocId` (`generarOP`) → solo válido si la OC está `CONFIRMADA`; crea la OP (queda `AMARRADA`)
  y la OC pasa a `EN_PRODUCCION`. Si falla devuelve `{ message: string }`.

Transición de estados de la OC:

```
BORRADOR ──confirmar──▶ CONFIRMADA ──generarOP──▶ EN_PRODUCCION (+ OP AMARRADA enlazada)
```

Botones por estado en el detalle:
- `BORRADOR`    → **Confirmar**
- `CONFIRMADA`  → **Generar OP**
- `EN_PRODUCCION` / `CERRADA` / `ANULADA` → sin acciones (se muestra la OP enlazada).

---

## File Structure

```
frontend/src/app/
  features/pedidos/oc/
    estado-badge.ts                (crear: mapeo estado OC/OP → clase de badge + label)
    estado-badge.spec.ts           (crear)
    oc-detalle.component.ts        (crear: detalle de una OC en el drawer + acciones)
    oc-detalle.component.spec.ts   (crear)
    oc-list.component.ts           (crear: tabla densa + orquesta el drawer)
    oc-list.component.spec.ts      (crear)
  app.routes.ts                    (modificar: /pedidos/oc → OcListComponent)
```

Responsabilidades:
- `estado-badge` — función pura: dado un estado de OC u OP, devuelve `{ clase, label }`. DRY: la usan lista y detalle.
- `oc-detalle` — recibe `ocId`, carga el detalle completo, muestra cabecera + líneas/tallas + OP enlazada,
  ofrece las acciones según estado y emite `changed` cuando una acción muta el estado.
- `oc-list` — carga y muestra la tabla; abre el drawer con el detalle de la fila; refresca al recibir `changed`.

---

## Task 1: estado-badge (mapeo estado → badge del design system)

**Files:**
- Create: `frontend/src/app/features/pedidos/oc/estado-badge.ts`, `estado-badge.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// frontend/src/app/features/pedidos/oc/estado-badge.spec.ts
import { badgeOC, badgeOP } from './estado-badge';

describe('estado-badge', () => {
  it('mapea cada estado de OC a una clase de badge existente y un label legible', () => {
    expect(badgeOC('BORRADOR')).toEqual({ clase: 'badge-neutral', label: 'Borrador' });
    expect(badgeOC('CONFIRMADA')).toEqual({ clase: 'badge-info', label: 'Confirmada' });
    expect(badgeOC('EN_PRODUCCION')).toEqual({ clase: 'badge-accent', label: 'En producción' });
    expect(badgeOC('CERRADA')).toEqual({ clase: 'badge-success', label: 'Cerrada' });
    expect(badgeOC('ANULADA')).toEqual({ clase: 'badge-neutral', label: 'Anulada' });
  });

  it('mapea los estados de OP a badge + label', () => {
    expect(badgeOP('CREADA')).toEqual({ clase: 'badge-neutral', label: 'Creada' });
    expect(badgeOP('AMARRADA')).toEqual({ clase: 'badge-info', label: 'Amarrada' });
    expect(badgeOP('EN_PRODUCCION')).toEqual({ clase: 'badge-accent', label: 'En producción' });
    expect(badgeOP('ANULADA')).toEqual({ clase: 'badge-neutral', label: 'Anulada' });
  });
});
```

- [ ] **Step 2: Run test para verificar que falla**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include="**/estado-badge.spec.ts"`
Expected: FAIL — "Cannot find module './estado-badge'".

- [ ] **Step 3: Implementar el mapeo**

```typescript
// frontend/src/app/features/pedidos/oc/estado-badge.ts
import { EstadoOC, EstadoOP } from '../../../core/api/models/pedidos.models';

export interface EstadoBadge { clase: string; label: string; }

const OC: Record<EstadoOC, EstadoBadge> = {
  BORRADOR:      { clase: 'badge-neutral', label: 'Borrador' },
  CONFIRMADA:    { clase: 'badge-info',    label: 'Confirmada' },
  EN_PRODUCCION: { clase: 'badge-accent',  label: 'En producción' },
  CERRADA:       { clase: 'badge-success', label: 'Cerrada' },
  ANULADA:       { clase: 'badge-neutral', label: 'Anulada' },
};

const OP: Record<EstadoOP, EstadoBadge> = {
  CREADA:        { clase: 'badge-neutral', label: 'Creada' },
  AMARRADA:      { clase: 'badge-info',    label: 'Amarrada' },
  EN_PRODUCCION: { clase: 'badge-accent',  label: 'En producción' },
  ANULADA:       { clase: 'badge-neutral', label: 'Anulada' },
};

export const badgeOC = (estado: EstadoOC): EstadoBadge => OC[estado];
export const badgeOP = (estado: EstadoOP): EstadoBadge => OP[estado];
```

- [ ] **Step 4: Run test para verificar que pasa**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include="**/estado-badge.spec.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/pedidos/oc/estado-badge.ts frontend/src/app/features/pedidos/oc/estado-badge.spec.ts
git commit -m "feat(pedidos): mapeo de estado OC/OP a badge del design system

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: oc-detalle (detalle de una OC + acciones)

**Files:**
- Create: `frontend/src/app/features/pedidos/oc/oc-detalle.component.ts`, `oc-detalle.component.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// frontend/src/app/features/pedidos/oc/oc-detalle.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { OcDetalleComponent } from './oc-detalle.component';
import { PedidosApi } from '../../../core/api/pedidos.api';

const OC_BORRADOR = {
  id: 7, consecutivo: 12, clienteId: 1, fecha: '2026-06-01T00:00:00.000Z', estado: 'BORRADOR',
  cliente: { id: 1, nit: '900', nombre: 'ACME', tipoCredito: 'CONTADO', estadoCartera: 'AL_DIA', activo: true },
  ordenProduccion: null,
  lineas: [
    { id: 1, productoConfiguradoId: 3, productoConfigurado: { id: 3, codigo: 'BR-001', nombreComercial: 'Bota Río', referenciaId: 1, marcaId: 1 },
      tallas: [ { id: 1, tallaId: 1, cantidad: 5, talla: { id: 1, valor: 38, orden: 1 } } ] },
  ],
};

describe('OcDetalleComponent', () => {
  let apiMock: { obtenerOC: jasmine.Spy; confirmarOC: jasmine.Spy; generarOP: jasmine.Spy };
  function setup(ocId = 7) {
    apiMock = {
      obtenerOC: jasmine.createSpy('obtenerOC').and.returnValue(of(OC_BORRADOR)),
      confirmarOC: jasmine.createSpy('confirmarOC').and.returnValue(of({ id: 7, estado: 'CONFIRMADA' })),
      generarOP: jasmine.createSpy('generarOP').and.returnValue(of({ id: 50, consecutivo: 1 })),
    };
    TestBed.configureTestingModule({
      imports: [OcDetalleComponent],
      providers: [{ provide: PedidosApi, useValue: apiMock }],
    });
    const fixture = TestBed.createComponent(OcDetalleComponent);
    fixture.componentRef.setInput('ocId', ocId);
    return fixture;
  }

  it('carga el detalle de la OC al iniciar', () => {
    const fixture = setup();
    fixture.detectChanges();
    expect(apiMock.obtenerOC).toHaveBeenCalledWith(7);
    expect(fixture.componentInstance.oc()?.consecutivo).toBe(12);
    expect(fixture.componentInstance.cargando()).toBe(false);
  });

  it('confirmar() llama a confirmarOC, recarga el detalle y emite changed', () => {
    const fixture = setup();
    fixture.detectChanges();
    let cambio = false;
    fixture.componentInstance.changed.subscribe(() => (cambio = true));
    fixture.componentInstance.confirmar();
    expect(apiMock.confirmarOC).toHaveBeenCalledWith(7);
    expect(apiMock.obtenerOC).toHaveBeenCalledTimes(2); // init + recarga
    expect(cambio).toBe(true);
  });

  it('generarOP() llama a generarOP, recarga el detalle y emite changed', () => {
    const fixture = setup();
    fixture.detectChanges();
    let cambio = false;
    fixture.componentInstance.changed.subscribe(() => (cambio = true));
    fixture.componentInstance.generarOP();
    expect(apiMock.generarOP).toHaveBeenCalledWith(7);
    expect(apiMock.obtenerOC).toHaveBeenCalledTimes(2);
    expect(cambio).toBe(true);
  });

  it('muestra el mensaje de error (array) cuando la acción falla', () => {
    const fixture = setup();
    fixture.detectChanges();
    apiMock.confirmarOC.and.returnValue(throwError(() => ({ error: { message: ['Cliente inactivo', 'Talla fuera de rango'] } })));
    fixture.componentInstance.confirmar();
    expect(fixture.componentInstance.error()).toBe('Cliente inactivo Talla fuera de rango');
    expect(fixture.componentInstance.accion()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test para verificar que falla**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include="**/oc-detalle.component.spec.ts"`
Expected: FAIL — "Cannot find module './oc-detalle.component'".

- [ ] **Step 3: Implementar el detalle**

```typescript
// frontend/src/app/features/pedidos/oc/oc-detalle.component.ts
import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { PedidosApi } from '../../../core/api/pedidos.api';
import { OrdenCompra } from '../../../core/api/models/pedidos.models';
import { badgeOC, badgeOP } from './estado-badge';

@Component({
  selector: 'app-oc-detalle',
  standalone: true,
  imports: [DatePipe],
  template: `
    @if (cargando()) {
      <p class="cell-sub">Cargando orden…</p>
    } @else if (oc(); as o) {
      <div class="kv-list">
        <div class="kv"><span class="k">Cliente</span><span class="v">{{ o.cliente?.nombre }}</span></div>
        <div class="kv"><span class="k">NIT</span><span class="v cell-mono">{{ o.cliente?.nit }}</span></div>
        <div class="kv"><span class="k">OC cliente</span><span class="v">{{ o.ocCliente || '—' }}</span></div>
        <div class="kv"><span class="k">Fecha</span><span class="v">{{ o.fecha | date:'dd/MM/yyyy' }}</span></div>
        <div class="kv"><span class="k">Estado</span><span class="v"><span class="badge {{ badge(o).clase }}"><span class="dot"></span>{{ badge(o).label }}</span></span></div>
        @if (o.ordenProduccion; as op) {
          <div class="kv"><span class="k">Orden de producción</span><span class="v">OP #{{ op.consecutivo }} · {{ badgeOpLabel(op.estado) }}</span></div>
        }
      </div>

      <div class="drawer-section-h">Líneas</div>
      @for (l of o.lineas || []; track l.id) {
        <div style="margin-bottom:var(--sp-4)">
          <div style="font-weight:var(--fw-medium);margin-bottom:var(--sp-2)">
            {{ l.productoConfigurado?.nombreComercial }}
            <span class="cell-sub cell-mono">{{ l.productoConfigurado?.codigo }}</span>
          </div>
          <table class="data">
            <thead><tr><th>Talla</th><th class="num">Cantidad</th></tr></thead>
            <tbody>
              @for (t of l.tallas; track t.id) {
                <tr><td>{{ t.talla?.valor }}</td><td class="num">{{ t.cantidad }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin:var(--sp-3) 0">{{ error() }}</p> }

      @if (o.estado === 'BORRADOR' || o.estado === 'CONFIRMADA') {
        <div class="drawer-foot">
          @if (o.estado === 'BORRADOR') {
            <button class="btn btn-primary" type="button" [class.is-loading]="accion()" [disabled]="accion()" (click)="confirmar()">Confirmar OC</button>
          }
          @if (o.estado === 'CONFIRMADA') {
            <button class="btn btn-accent" type="button" [class.is-loading]="accion()" [disabled]="accion()" (click)="generarOP()">Generar OP</button>
          }
        </div>
      }
    }
  `,
})
export class OcDetalleComponent implements OnInit {
  private readonly api = inject(PedidosApi);
  ocId = input.required<number>();
  changed = output<void>();

  oc = signal<OrdenCompra | null>(null);
  cargando = signal(true);
  accion = signal(false);
  error = signal('');

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando.set(true);
    this.api.obtenerOC(this.ocId()).subscribe({
      next: (o) => { this.oc.set(o); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  confirmar(): void {
    if (this.accion()) return;
    this.accion.set(true); this.error.set('');
    this.api.confirmarOC(this.ocId()).subscribe({
      next: () => { this.accion.set(false); this.cargar(); this.changed.emit(); },
      error: (e) => { this.accion.set(false); this.error.set(this.msg(e)); },
    });
  }

  generarOP(): void {
    if (this.accion()) return;
    this.accion.set(true); this.error.set('');
    this.api.generarOP(this.ocId()).subscribe({
      next: () => { this.accion.set(false); this.cargar(); this.changed.emit(); },
      error: (e) => { this.accion.set(false); this.error.set(this.msg(e)); },
    });
  }

  badge(o: OrdenCompra) { return badgeOC(o.estado); }
  badgeOpLabel(estado: 'CREADA' | 'AMARRADA' | 'EN_PRODUCCION' | 'ANULADA') { return badgeOP(estado).label; }

  private msg(e: any): string {
    const m = e?.error?.message;
    return Array.isArray(m) ? m.join(' ') : (m ?? 'La acción falló');
  }
}
```

- [ ] **Step 4: Run test para verificar que pasa**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include="**/oc-detalle.component.spec.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/pedidos/oc/oc-detalle.component.ts frontend/src/app/features/pedidos/oc/oc-detalle.component.spec.ts
git commit -m "feat(pedidos): oc-detalle (cabecera + lineas + acciones confirmar/generar OP)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: oc-list (tabla densa + orquesta el drawer)

**Files:**
- Create: `frontend/src/app/features/pedidos/oc/oc-list.component.ts`, `oc-list.component.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// frontend/src/app/features/pedidos/oc/oc-list.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { OcListComponent } from './oc-list.component';
import { PedidosApi } from '../../../core/api/pedidos.api';

const OC_FILA = {
  id: 7, consecutivo: 12, clienteId: 1, fecha: '2026-06-01T00:00:00.000Z', estado: 'CONFIRMADA',
  cliente: { id: 1, nit: '900', nombre: 'ACME' }, ordenProduccion: null,
};

describe('OcListComponent', () => {
  let apiMock: { listarOC: jasmine.Spy; obtenerOC: jasmine.Spy };
  function setup() {
    apiMock = {
      listarOC: jasmine.createSpy('listarOC').and.returnValue(of([OC_FILA])),
      obtenerOC: jasmine.createSpy('obtenerOC').and.returnValue(of(OC_FILA)),
    };
    TestBed.configureTestingModule({
      imports: [OcListComponent],
      providers: [{ provide: PedidosApi, useValue: apiMock }],
    });
    return TestBed.createComponent(OcListComponent);
  }

  it('carga las OCs al iniciar y las expone', () => {
    const fixture = setup();
    fixture.detectChanges();
    expect(apiMock.listarOC).toHaveBeenCalled();
    expect(fixture.componentInstance.ocs().length).toBe(1);
    expect(fixture.componentInstance.cargando()).toBe(false);
  });

  it('abrir(oc) selecciona la fila y arma el título; cerrar() limpia la selección', () => {
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    expect(cmp.seleccionada()).toBeNull();
    cmp.abrir(OC_FILA as any);
    expect(cmp.seleccionada()?.id).toBe(7);
    expect(cmp.tituloDrawer()).toBe('OC #12');
    cmp.cerrar();
    expect(cmp.seleccionada()).toBeNull();
  });

  it('onCambio() recarga la lista (mantiene los datos frescos detrás del drawer)', () => {
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.onCambio();
    expect(apiMock.listarOC).toHaveBeenCalledTimes(2); // init + recarga
  });
});
```

- [ ] **Step 2: Run test para verificar que falla**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include="**/oc-list.component.spec.ts"`
Expected: FAIL — "Cannot find module './oc-list.component'".

- [ ] **Step 3: Implementar la lista**

```typescript
// frontend/src/app/features/pedidos/oc/oc-list.component.ts
import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { PedidosApi } from '../../../core/api/pedidos.api';
import { OrdenCompra } from '../../../core/api/models/pedidos.models';
import { DrawerComponent } from '../../../shared/ui/drawer/drawer.component';
import { OcDetalleComponent } from './oc-detalle.component';
import { badgeOC } from './estado-badge';

@Component({
  selector: 'app-oc-list',
  standalone: true,
  imports: [DatePipe, DrawerComponent, OcDetalleComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div><div class="ph-title">Órdenes de Compra</div></div>
      </div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando órdenes…</div></div>
      } @else if (ocs().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <span class="e-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h13l3 3v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg></span>
            <h4>Sin órdenes de compra todavía</h4>
            <p>Las órdenes de compra aparecerán acá apenas se registren.</p>
          </div>
        </div></div>
      } @else {
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>OC</th><th>Cliente</th><th>Fecha</th><th>Estado</th><th>OP</th></tr></thead>
              <tbody>
                @for (oc of ocs(); track oc.id) {
                  <tr [class.is-selected]="seleccionada()?.id === oc.id" (click)="abrir(oc)" style="cursor:pointer">
                    <td class="cell-mono">#{{ oc.consecutivo }}</td>
                    <td>{{ oc.cliente?.nombre }}</td>
                    <td class="cell-sub">{{ oc.fecha | date:'dd/MM/yyyy' }}</td>
                    <td><span class="badge {{ badge(oc).clase }}"><span class="dot"></span>{{ badge(oc).label }}</span></td>
                    <td class="cell-sub">{{ oc.ordenProduccion ? 'OP #' + oc.ordenProduccion.consecutivo : '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>

    <app-drawer [open]="!!seleccionada()" [title]="tituloDrawer()" (closed)="cerrar()">
      @if (seleccionada(); as oc) {
        <app-oc-detalle [ocId]="oc.id" (changed)="onCambio()" />
      }
    </app-drawer>
  `,
})
export class OcListComponent {
  private readonly api = inject(PedidosApi);
  ocs = signal<OrdenCompra[]>([]);
  cargando = signal(true);
  seleccionada = signal<OrdenCompra | null>(null);
  tituloDrawer = computed(() => {
    const s = this.seleccionada();
    return s ? `OC #${s.consecutivo}` : '';
  });

  constructor() { this.cargar(); }

  cargar(): void {
    this.cargando.set(true);
    this.api.listarOC().subscribe({
      next: (os) => { this.ocs.set(os); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  abrir(oc: OrdenCompra): void { this.seleccionada.set(oc); }
  cerrar(): void { this.seleccionada.set(null); }
  onCambio(): void { this.cargar(); }

  badge(oc: OrdenCompra) { return badgeOC(oc.estado); }
}
```

- [ ] **Step 4: Run test para verificar que pasa**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include="**/oc-list.component.spec.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/pedidos/oc/oc-list.component.ts frontend/src/app/features/pedidos/oc/oc-list.component.spec.ts
git commit -m "feat(pedidos): oc-list (tabla densa de OCs + drawer de detalle)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Conectar la ruta /pedidos/oc + verificación

**Files:**
- Modify: `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Apuntar /pedidos/oc al componente real**

En `frontend/src/app/app.routes.ts`, en los `children` del shell, reemplazar la línea de `pedidos/oc`
(que carga el placeholder) por:

```typescript
{ path: 'pedidos/oc', loadComponent: () => import('./features/pedidos/oc/oc-list.component').then(m => m.OcListComponent) },
```

El archivo queda así:

```typescript
import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell/shell.component').then(m => m.ShellComponent),
    children: [
      { path: 'pedidos/oc', loadComponent: () => import('./features/pedidos/oc/oc-list.component').then(m => m.OcListComponent) },
      { path: 'clientes', loadComponent: () => import('./features/clientes/clientes-list.component').then(m => m.ClientesListComponent) },
      { path: '', pathMatch: 'full', redirectTo: 'pedidos/oc' },
    ],
  },
  { path: '**', redirectTo: '' },
];
```

- [ ] **Step 2: Verificar build + suite completa**

Run: `cd frontend && npm run build`
Expected: compila sin errores.

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless`
Expected: PASS — toda la suite (fundaciones + clientes + estado-badge 2 + oc-detalle 4 + oc-list 3).

- [ ] **Step 3: Verificación visual (manual, no bloqueante)**

Con la DB (`docker start agro-erp-pg`), backend (`npm run build && npm run start:prod` en `backend`, escucha :3001)
y `npm start` en `frontend`:
- Login (admin/admin123) → la home ya es `/pedidos/oc` → ver la tabla con las OCs del seed.
- Click en una fila en `BORRADOR` → se abre el drawer con cabecera + líneas/tallas → botón **Confirmar OC** →
  el detalle pasa a `CONFIRMADA` y la fila detrás actualiza el badge.
- En la misma OC ahora `CONFIRMADA` → botón **Generar OP** → el detalle pasa a `EN_PRODUCCION` y aparece la OP enlazada;
  la columna OP de la fila muestra `OP #N`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/app.routes.ts
git commit -m "feat(pedidos): conectar ruta /pedidos/oc al listado real

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Cobertura del spec:** §5 reusa `ui-drawer`; §6 ruta `/pedidos/oc` (el detalle va en drawer, no en ruta `:id` separada —
  decisión de F5 según el prompt de continuación de Gonza); §10 fase F5 = tabla densa + detalle + acciones confirmar/generar OP. ✓
- **Reuso:** usa `PedidosApi`, `ui-drawer`, modelos y badges del DS sin duplicar; `estado-badge` evita repetir el mapeo en lista y detalle (DRY). ✓
- **Tipos consistentes:** `OrdenCompra`/`EstadoOC`/`EstadoOP` del modelo compartido; `badgeOC`/`badgeOP` con la misma firma `(estado) => EstadoBadge`; `changed`/`onCambio` enlazan detalle→lista. ✓
- **Sin placeholders:** todo el código está completo en cada tarea, incluido el `app.routes.ts` final entero. ✓

## Notas

- **`generarOP` no navega** a la pantalla de OP porque `op-detalle` es F7 (todavía no existe la ruta `/pedidos/op/:id`).
  En F5, tras generar la OP, se refresca el detalle de la OC mostrando la OP enlazada (consecutivo + estado). La navegación
  a la OP se cablea en F7.
- **El `ui-drawer` se reusa tal cual** (sin focus-trap CDK todavía, igual que en Clientes — mejora de a11y posterior).
- **Mensajes de error del backend:** `confirmarOC` puede devolver un array de errores de validación y `generarOP` un string;
  el helper `msg()` normaliza ambos (`Array → join(' ')`).
- **El badge de OP** en el detalle muestra solo el label (no la clase de color) para no recargar visualmente la fila de la OP enlazada;
  la clase queda disponible en `badgeOP` por si F7 la necesita.
- Si el seed de demo no tiene OCs en `BORRADOR`/`CONFIRMADA`, las acciones no se podrán probar end-to-end; en ese caso crear una
  OC desde el wizard (F6) o vía seed antes de la verificación visual.
