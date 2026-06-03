# Frontend — Feature Clientes (F4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la pantalla de Clientes (listar en tabla densa + crear en un drawer lateral), reemplazando el placeholder de la ruta `/clientes`.

**Architecture:** Angular 19 standalone + signals. Reusa `ClientesApi` (ya existe) y los estilos del design system "Acero" (`.data`, `.drawer`, `.scrim`, `.label`, `.empty`, `.badge`). Se crea un `ui-drawer` reutilizable (CSS del DS + signal open/close, sin CDK por ahora). Primer feature completo: valida el stack de datos→UI.

**Tech Stack:** Angular 19.2, signals (`input()`/`output()`), FormsModule, Karma/Jasmine.

**Spec:** `docs/specs/2026-06-03-frontend-flujo-pedidos-design.md` (§5 componentes, §6 routing).
**Precondición:** Plan 1 (Fundaciones) en master — `ClientesApi`, modelos, shell y routing existen. Seed de demo con 5 clientes corrido en la DB local.

---

## File Structure

```
frontend/src/app/
  shared/ui/drawer/
    drawer.component.ts          (crear: panel lateral reutilizable)
    drawer.component.spec.ts     (crear)
  features/clientes/
    cliente-form.component.ts    (crear: form de creación)
    cliente-form.component.spec.ts (crear)
    clientes-list.component.ts   (crear: tabla + orquesta drawer)
    clientes-list.component.spec.ts (crear)
  app.routes.ts                  (modificar: /clientes → ClientesListComponent)
```

Responsabilidades:
- `drawer.component` — overlay lateral genérico (scrim + panel + título + cierre + content projection).
- `cliente-form` — captura y crea un cliente; emite `created`.
- `clientes-list` — carga y muestra la lista; abre el drawer; refresca al crear.

---

## Task 1: ui-drawer (panel lateral reutilizable)

**Files:**
- Create: `frontend/src/app/shared/ui/drawer/drawer.component.ts`, `drawer.component.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// frontend/src/app/shared/ui/drawer/drawer.component.spec.ts
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DrawerComponent } from './drawer.component';

@Component({
  standalone: true,
  imports: [DrawerComponent],
  template: `<app-drawer [open]="abierto" title="Prueba" (closed)="onClose()"><p class="contenido">hola</p></app-drawer>`,
})
class HostComponent { abierto = false; cerrado = false; onClose() { this.cerrado = true; } }

describe('DrawerComponent', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    return fixture;
  }

  it('no renderiza el panel cuando open=false', () => {
    const fixture = setup();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.drawer')).toBeNull();
    expect(fixture.nativeElement.querySelector('.scrim')).toBeNull();
  });

  it('renderiza panel + scrim + contenido proyectado cuando open=true', () => {
    const fixture = setup();
    fixture.componentInstance.abierto = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.drawer')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.scrim')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.contenido')?.textContent).toBe('hola');
  });

  it('emite closed al clickear el scrim', () => {
    const fixture = setup();
    fixture.componentInstance.abierto = true;
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.scrim').click();
    expect(fixture.componentInstance.cerrado).toBe(true);
  });
});
```

- [ ] **Step 2: Run test para verificar que falla**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include="**/drawer.component.spec.ts"`
Expected: FAIL — "Cannot find module './drawer.component'".

- [ ] **Step 3: Implementar el drawer**

```typescript
// frontend/src/app/shared/ui/drawer/drawer.component.ts
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-drawer',
  standalone: true,
  template: `
    @if (open()) {
      <div class="scrim" (click)="closed.emit()"></div>
      <aside class="drawer" role="dialog" aria-modal="true">
        <div class="drawer-head">
          <h3 class="t-h3">{{ title() }}</h3>
          <button class="icon-btn" type="button" title="Cerrar" (click)="closed.emit()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="drawer-body"><ng-content /></div>
      </aside>
    }
  `,
})
export class DrawerComponent {
  open = input(false);
  title = input('');
  closed = output<void>();
}
```

- [ ] **Step 4: Run test para verificar que pasa**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include="**/drawer.component.spec.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/shared/ui/drawer
git commit -m "feat(frontend): ui-drawer reutilizable (scrim + panel del design system)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: cliente-form (crear cliente)

**Files:**
- Create: `frontend/src/app/features/clientes/cliente-form.component.ts`, `cliente-form.component.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// frontend/src/app/features/clientes/cliente-form.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ClienteFormComponent } from './cliente-form.component';
import { ClientesApi } from '../../core/api/clientes.api';

describe('ClienteFormComponent', () => {
  let apiMock: { crear: jasmine.Spy };
  function setup() {
    apiMock = { crear: jasmine.createSpy('crear') };
    TestBed.configureTestingModule({
      imports: [ClienteFormComponent],
      providers: [{ provide: ClientesApi, useValue: apiMock }],
    });
    return TestBed.createComponent(ClienteFormComponent);
  }

  it('valida NIT y Nombre obligatorios y NO llama a la API', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.nit = ''; cmp.nombre = '';
    cmp.guardar();
    expect(cmp.error()).toContain('obligatorios');
    expect(apiMock.crear).not.toHaveBeenCalled();
  });

  it('crea el cliente y emite created en éxito', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    apiMock.crear.and.returnValue(of({ id: 1, nit: '900', nombre: 'ACME' }));
    let emitido: any = null;
    cmp.created.subscribe((c: any) => (emitido = c));
    cmp.nit = '900'; cmp.nombre = 'ACME'; cmp.tipoCredito = 'D30';
    cmp.guardar();
    expect(apiMock.crear).toHaveBeenCalledWith(
      jasmine.objectContaining({ nit: '900', nombre: 'ACME', tipoCredito: 'D30' }),
    );
    expect(emitido).toEqual(jasmine.objectContaining({ id: 1 }));
    expect(cmp.loading()).toBe(false);
  });

  it('muestra error si la API falla', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    apiMock.crear.and.returnValue(throwError(() => ({ error: { message: 'NIT duplicado' } })));
    cmp.nit = '900'; cmp.nombre = 'ACME';
    cmp.guardar();
    expect(cmp.error()).toBe('NIT duplicado');
    expect(cmp.loading()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test para verificar que falla**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include="**/cliente-form.component.spec.ts"`
Expected: FAIL — "Cannot find module './cliente-form.component'".

- [ ] **Step 3: Implementar el form**

```typescript
// frontend/src/app/features/clientes/cliente-form.component.ts
import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ClientesApi } from '../../core/api/clientes.api';
import { Cliente, CrearClienteDto, TipoCredito } from '../../core/api/models/pedidos.models';

@Component({
  selector: 'app-cliente-form',
  standalone: true,
  imports: [FormsModule],
  template: `
    <form (ngSubmit)="guardar()">
      <div class="field">
        <label class="label" for="nit">NIT <span class="req">*</span></label>
        <input class="input" id="nit" name="nit" [(ngModel)]="nit" autocomplete="off" />
      </div>
      <div class="field">
        <label class="label" for="nombre">Nombre <span class="req">*</span></label>
        <input class="input" id="nombre" name="nombre" [(ngModel)]="nombre" autocomplete="off" />
      </div>
      <div class="field">
        <label class="label" for="ciudad">Ciudad</label>
        <input class="input" id="ciudad" name="ciudad" [(ngModel)]="ciudad" autocomplete="off" />
      </div>
      <div class="field">
        <label class="label" for="tipoCredito">Tipo de crédito</label>
        <select class="select" id="tipoCredito" name="tipoCredito" [(ngModel)]="tipoCredito">
          <option value="CONTADO">Contado</option>
          <option value="D30">30 días</option>
          <option value="D60">60 días</option>
          <option value="D90">90 días</option>
        </select>
      </div>
      <div class="field">
        <label class="label" for="cupo">Cupo (COP)</label>
        <input class="input" id="cupo" name="cupo" type="number" [(ngModel)]="cupo" />
      </div>
      @if (error()) { <p style="color:var(--error);font-size:var(--text-sm);margin-bottom:var(--sp-3)">{{ error() }}</p> }
      <button class="btn btn-primary btn-block" type="submit" [class.is-loading]="loading()" [disabled]="loading()">Crear cliente</button>
    </form>
  `,
})
export class ClienteFormComponent {
  private readonly api = inject(ClientesApi);
  created = output<Cliente>();

  nit = '';
  nombre = '';
  ciudad = '';
  tipoCredito: TipoCredito = 'CONTADO';
  cupo?: number;
  loading = signal(false);
  error = signal('');

  guardar(): void {
    if (!this.nit.trim() || !this.nombre.trim()) {
      this.error.set('NIT y Nombre son obligatorios');
      return;
    }
    if (this.loading()) return;
    this.error.set('');
    this.loading.set(true);
    const dto: CrearClienteDto = {
      nit: this.nit.trim(),
      nombre: this.nombre.trim(),
      ciudad: this.ciudad.trim() || undefined,
      tipoCredito: this.tipoCredito,
      cupo: this.cupo,
    };
    this.api.crear(dto).subscribe({
      next: (c) => { this.loading.set(false); this.created.emit(c); },
      error: (e) => { this.loading.set(false); this.error.set(e?.error?.message ?? 'No se pudo crear el cliente'); },
    });
  }
}
```

- [ ] **Step 4: Run test para verificar que pasa**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include="**/cliente-form.component.spec.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/clientes/cliente-form.component.ts frontend/src/app/features/clientes/cliente-form.component.spec.ts
git commit -m "feat(clientes): cliente-form (crear con validacion + estados)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: clientes-list (tabla + orquesta el drawer)

**Files:**
- Create: `frontend/src/app/features/clientes/clientes-list.component.ts`, `clientes-list.component.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// frontend/src/app/features/clientes/clientes-list.component.spec.ts
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ClientesListComponent } from './clientes-list.component';
import { ClientesApi } from '../../core/api/clientes.api';

describe('ClientesListComponent', () => {
  let apiMock: { listar: jasmine.Spy };
  function setup() {
    apiMock = { listar: jasmine.createSpy('listar').and.returnValue(of([
      { id: 1, nit: '900', nombre: 'ACME', ciudad: 'Ibagué', tipoCredito: 'CONTADO', estadoCartera: 'AL_DIA', activo: true },
    ])) };
    TestBed.configureTestingModule({
      imports: [ClientesListComponent],
      providers: [{ provide: ClientesApi, useValue: apiMock }],
    });
    return TestBed.createComponent(ClientesListComponent);
  }

  it('carga los clientes al iniciar y los expone', () => {
    const fixture = setup();
    fixture.detectChanges();
    expect(apiMock.listar).toHaveBeenCalled();
    expect(fixture.componentInstance.clientes().length).toBe(1);
    expect(fixture.componentInstance.cargando()).toBe(false);
  });

  it('abrir() y cerrar() controlan el drawer', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    expect(cmp.drawerAbierto()).toBe(false);
    cmp.abrir();
    expect(cmp.drawerAbierto()).toBe(true);
    cmp.cerrar();
    expect(cmp.drawerAbierto()).toBe(false);
  });

  it('onCreado() cierra el drawer y recarga la lista', () => {
    const fixture = setup();
    const cmp = fixture.componentInstance;
    cmp.abrir();
    cmp.onCreado();
    expect(cmp.drawerAbierto()).toBe(false);
    expect(apiMock.listar).toHaveBeenCalledTimes(2); // constructor + recarga
  });
});
```

- [ ] **Step 2: Run test para verificar que falla**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include="**/clientes-list.component.spec.ts"`
Expected: FAIL — "Cannot find module './clientes-list.component'".

- [ ] **Step 3: Implementar la lista**

```typescript
// frontend/src/app/features/clientes/clientes-list.component.ts
import { Component, inject, signal } from '@angular/core';
import { ClientesApi } from '../../core/api/clientes.api';
import { Cliente } from '../../core/api/models/pedidos.models';
import { DrawerComponent } from '../../shared/ui/drawer/drawer.component';
import { ClienteFormComponent } from './cliente-form.component';

@Component({
  selector: 'app-clientes-list',
  standalone: true,
  imports: [DrawerComponent, ClienteFormComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <div><div class="ph-title">Clientes</div></div>
        <div class="page-actions">
          <button class="btn btn-primary" type="button" (click)="abrir()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Nuevo cliente
          </button>
        </div>
      </div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando clientes…</div></div>
      } @else if (clientes().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <span class="e-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/></svg></span>
            <h4>Sin clientes todavía</h4>
            <p>Creá el primer cliente para empezar a registrar pedidos.</p>
          </div>
        </div></div>
      } @else {
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>NIT</th><th>Nombre</th><th>Ciudad</th><th>Crédito</th><th>Cartera</th></tr></thead>
              <tbody>
                @for (c of clientes(); track c.id) {
                  <tr>
                    <td class="cell-mono">{{ c.nit }}</td>
                    <td>{{ c.nombre }}</td>
                    <td class="cell-sub">{{ c.ciudad || '—' }}</td>
                    <td>{{ c.tipoCredito }}</td>
                    <td><span class="badge badge-neutral"><span class="dot"></span>{{ c.estadoCartera }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>

    <app-drawer [open]="drawerAbierto()" title="Nuevo cliente" (closed)="cerrar()">
      <app-cliente-form (created)="onCreado()" />
    </app-drawer>
  `,
})
export class ClientesListComponent {
  private readonly api = inject(ClientesApi);
  clientes = signal<Cliente[]>([]);
  cargando = signal(true);
  drawerAbierto = signal(false);

  constructor() {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.listar().subscribe({
      next: (cs) => { this.clientes.set(cs); this.cargando.set(false); },
      error: () => this.cargando.set(false),
    });
  }

  abrir(): void { this.drawerAbierto.set(true); }
  cerrar(): void { this.drawerAbierto.set(false); }
  onCreado(): void { this.cerrar(); this.cargar(); }
}
```

- [ ] **Step 4: Run test para verificar que pasa**

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include="**/clientes-list.component.spec.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/clientes/clientes-list.component.ts frontend/src/app/features/clientes/clientes-list.component.spec.ts
git commit -m "feat(clientes): clientes-list (tabla densa + drawer de creacion)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Conectar la ruta /clientes

**Files:**
- Modify: `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Apuntar /clientes al componente real**

En `frontend/src/app/app.routes.ts`, en los `children` del shell, reemplazar la línea de `clientes` (que carga el placeholder) por:

```typescript
{ path: 'clientes', loadComponent: () => import('./features/clientes/clientes-list.component').then(m => m.ClientesListComponent) },
```

(La ruta `pedidos/oc` sigue con el placeholder hasta su plan.)

- [ ] **Step 2: Verificar build + suite completa**

Run: `cd frontend && npm run build`
Expected: compila sin errores.

Run: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless`
Expected: PASS — toda la suite (fundaciones + drawer 3 + cliente-form 3 + clientes-list 3).

- [ ] **Step 3: Verificación visual (manual, no bloqueante)**

Con backend (`npm run build` + `npm run start:prod` en backend, escucha :3001) y `npm start` en frontend:
- Login (admin/admin123) → ir a Clientes → ver la tabla con los 5 clientes del seed.
- Click "Nuevo cliente" → se abre el drawer → llenar NIT+Nombre → "Crear cliente" → el drawer cierra y la tabla muestra el nuevo cliente.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/app.routes.ts
git commit -m "feat(clientes): conectar ruta /clientes al listado real

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Cobertura del spec:** Clientes listar (tabla densa, T3) + crear (drawer + form, T1/T2) + ruta (T4). El `ui-drawer` cumple §5 (componente complejo reutilizable). ✓
- **Reuso:** usa `ClientesApi` y modelos del Plan 1 sin duplicar. ✓
- **Tipos consistentes:** `Cliente`, `CrearClienteDto`, `TipoCredito` del modelo compartido; `created` emite `Cliente`. ✓
- **Sin placeholders:** todo el código está completo en cada tarea. ✓

## Notas

- El `ui-drawer` no usa CDK overlay todavía (focus-trap/escape) — es una mejora de a11y para un pase posterior; el spec lo mencionaba pero priorizamos entregar el flujo. El cierre por scrim y botón X sí funciona.
- Validación del form: mínima (NIT y Nombre obligatorios) en cliente; el backend valida NIT único y devuelve el mensaje, que se muestra en el form.
- El `tipoCredito` se captura como enum del DTO; el `cupo` es opcional (number).
