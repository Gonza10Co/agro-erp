# Navegabilidad — Listado de OP + Interceptor 401 · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar un acceso directo a las Órdenes de Producción desde el menú (lista → detalle/amarre) y redirigir limpio al login cuando el token expira, en vez de mostrar listas vacías engañosas.

**Architecture:** Dos features independientes, 100% frontend. (②) Un `HttpInterceptorFn` que en 401 (excepto en `/auth/login`) hace logout y redirige a `/login?expired=1`, más un banner en el login. (①) Un componente de listado de OP (espejo de `oc-list` pero sin drawer, la fila navega), una ruta `/pedidos/op` y un ítem de menú. Ambas consumen endpoints y modelos ya existentes; no se toca el backend.

**Tech Stack:** Angular 19.2 (standalone + signals), `@angular/router`, `@angular/common/http` (functional interceptors), Karma/Jasmine.

**Spec:** `docs/specs/2026-06-04-navegabilidad-op-list-y-401-design.md`. Decisión de Gonza: interceptor "solo redirigir" (sin refresh de token).

---

## File Structure

```
frontend/src/app/
  core/interceptors/
    auth-error.interceptor.ts        ← CREAR: 401 → logout + /login?expired=1 (excepto /auth/login)
    auth-error.interceptor.spec.ts   ← CREAR: tests del interceptor
  app.config.ts                      ← MODIFICAR: registrar authErrorInterceptor tras jwtInterceptor
  features/login/login.component.ts  ← MODIFICAR: leer ?expired y mostrar banner "Tu sesión expiró"
  features/pedidos/op/
    op-list.component.ts             ← CREAR: tabla de OP (sin drawer, fila navega a :id)
    op-list.component.spec.ts        ← CREAR: tests de carga + render
  app.routes.ts                      ← MODIFICAR: ruta pedidos/op ANTES de pedidos/op/:id
  layout/shell/shell.component.ts    ← MODIFICAR: ítem de menú "Órdenes de Producción"
```

Reusa sin tocar: `AuthService.logout()`, `PedidosApi.listarOP()`, modelo `OrdenProduccion`, `badgeOP` (`features/pedidos/oc/estado-badge.ts`), clases globales del DS.

---

# FEATURE ② — Interceptor de errores 401

## Task 1: `auth-error.interceptor.ts` (401 → logout + redirect)

**Files:**
- Create: `frontend/src/app/core/interceptors/auth-error.interceptor.ts`
- Test: `frontend/src/app/core/interceptors/auth-error.interceptor.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/core/interceptors/auth-error.interceptor.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { authErrorInterceptor } from './auth-error.interceptor';

describe('authErrorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: jasmine.SpyObj<Router>;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    auth = jasmine.createSpyObj('AuthService', ['logout']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: auth },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('en 401 de una request normal hace logout y redirige a /login?expired=1', () => {
    http.get('http://localhost:3001/pedidos/oc').subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne('http://localhost:3001/pedidos/oc').flush('no', { status: 401, statusText: 'Unauthorized' });
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login?expired=1');
  });

  it('en 401 de /auth/login NO redirige (login fallido)', () => {
    http.post('http://localhost:3001/auth/login', {}).subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne('http://localhost:3001/auth/login').flush('bad', { status: 401, statusText: 'Unauthorized' });
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('en error 500 no redirige', () => {
    http.get('http://localhost:3001/pedidos/oc').subscribe({ next: () => {}, error: () => {} });
    httpMock.expectOne('http://localhost:3001/pedidos/oc').flush('boom', { status: 500, statusText: 'Server Error' });
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: FAIL — `Cannot find module './auth-error.interceptor'`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/app/core/interceptors/auth-error.interceptor.ts`:

```typescript
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';

export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const esLogin = req.url.endsWith('/auth/login');
      if (err.status === 401 && !esLogin) {
        auth.logout();
        router.navigateByUrl('/login?expired=1');
      }
      return throwError(() => err);
    }),
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: PASS — los 3 specs de `authErrorInterceptor` verdes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/interceptors/auth-error.interceptor.ts frontend/src/app/core/interceptors/auth-error.interceptor.spec.ts
git commit -m "feat(auth): interceptor 401 -> logout + redirect a /login?expired=1"
```

---

## Task 2: Registrar el interceptor + banner de sesión expirada en el login

**Files:**
- Modify: `frontend/src/app/app.config.ts`
- Modify: `frontend/src/app/features/login/login.component.ts`
- Test: `frontend/src/app/features/login/login.component.spec.ts` (crear si no existe; ver Step 3)

- [ ] **Step 1: Registrar el interceptor en `app.config.ts`**

En `frontend/src/app/app.config.ts`, agregar el import y sumarlo a `withInterceptors` **después** de `jwtInterceptor`:

```typescript
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { jwtInterceptor } from './core/interceptors/jwt.interceptor';
import { authErrorInterceptor } from './core/interceptors/auth-error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([jwtInterceptor, authErrorInterceptor])),
  ],
};
```

- [ ] **Step 2: Agregar la lectura de `?expired` y el banner al login**

En `frontend/src/app/features/login/login.component.ts`:

a) Importar `ActivatedRoute`:
```typescript
import { Router, ActivatedRoute } from '@angular/router';
```

b) En la clase, inyectar la ruta y exponer una señal `expirada`:
```typescript
  private readonly route = inject(ActivatedRoute);
  expirada = signal(this.route.snapshot.queryParamMap.get('expired') === '1');
```

c) En el template, justo ANTES del `<heading "Ingresar">` (o al inicio del bloque del formulario, dentro del panel derecho), agregar el banner condicional:
```html
        @if (expirada()) {
          <div class="login-aviso">Tu sesión expiró, ingresá de nuevo.</div>
        }
```

d) Agregar el estilo del banner al array `styles` del componente (usa tokens del DS):
```css
    .login-aviso{margin-bottom:var(--sp-4);padding:var(--sp-3) var(--sp-4);border-radius:var(--r-sm);font-size:var(--text-sm);background:color-mix(in oklch,var(--accent) 12%,var(--surface));border:var(--bw) solid color-mix(in oklch,var(--accent) 35%,var(--border));color:var(--text)}
```

**Nota:** ubicá el `@if (expirada())` dentro del contenedor del formulario (el panel derecho que ya contiene el `<h2>Ingresar</h2>`), antes de ese `<h2>`. Leé el template del componente para encontrar el lugar exacto; no muevas nada más.

- [ ] **Step 3: Test del banner**

Crear (o ampliar) `frontend/src/app/features/login/login.component.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { convertToParamMap } from '@angular/router';
import { LoginComponent } from './login.component';

function setup(expired: string | null) {
  TestBed.configureTestingModule({
    imports: [LoginComponent],
    providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(expired ? { expired } : {}) } } },
    ],
  });
  return TestBed.createComponent(LoginComponent);
}

describe('LoginComponent', () => {
  it('muestra el aviso de sesión expirada cuando ?expired=1', () => {
    const fixture = setup('1');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Tu sesión expiró');
  });

  it('no muestra el aviso sin el query param', () => {
    const fixture = setup(null);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Tu sesión expiró');
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: PASS — los 2 specs del login verdes; el resto de la suite sigue verde.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/app.config.ts frontend/src/app/features/login/login.component.ts frontend/src/app/features/login/login.component.spec.ts
git commit -m "feat(auth): registrar interceptor 401 + banner de sesion expirada en el login"
```

---

# FEATURE ① — Listado "Órdenes de Producción"

## Task 3: `op-list.component.ts` (tabla de OP, fila navega)

**Files:**
- Create: `frontend/src/app/features/pedidos/op/op-list.component.ts`
- Test: `frontend/src/app/features/pedidos/op/op-list.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/features/pedidos/op/op-list.component.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { OpListComponent } from './op-list.component';

describe('OpListComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [OpListComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(OpListComponent);
    const http = TestBed.inject(HttpTestingController);
    return { fixture, http };
  }

  it('carga las OPs y renderiza una fila con consecutivo y cliente', () => {
    const { fixture, http } = setup();
    fixture.detectChanges();
    const req = http.expectOne('http://localhost:3001/pedidos/op');
    expect(req.request.method).toBe('GET');
    req.flush([{
      id: 1, consecutivo: 1, ocId: 1, fecha: '2026-06-04T00:00:00.000Z', estado: 'AMARRADA',
      oc: { id: 1, consecutivo: 1, clienteId: 3, fecha: '2026-06-04T00:00:00.000Z', estado: 'EN_PRODUCCION',
            cliente: { id: 3, nit: '900', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } },
    }]);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Minera El Roble');
    expect(text).toContain('Amarrada');
    const link = (fixture.nativeElement as HTMLElement).querySelector('tbody tr a[href], tbody tr[ng-reflect-router-link]');
    expect(text).toContain('#1');
    http.verify();
  });

  it('muestra el empty state cuando no hay OPs', () => {
    const { fixture, http } = setup();
    fixture.detectChanges();
    http.expectOne('http://localhost:3001/pedidos/op').flush([]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sin órdenes de producción');
    http.verify();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: FAIL — `Cannot find module './op-list.component'`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/app/features/pedidos/op/op-list.component.ts`:

```typescript
import { Component, OnInit, inject, signal, DestroyRef } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PedidosApi } from '../../../core/api/pedidos.api';
import { OrdenProduccion } from '../../../core/api/models/pedidos.models';
import { badgeOP } from '../oc/estado-badge';

@Component({
  selector: 'app-op-list',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <div class="page">
      <div class="page-header">
        <div><div class="ph-title">Órdenes de Producción</div></div>
      </div>

      @if (cargando()) {
        <div class="card"><div class="card-body">Cargando órdenes…</div></div>
      } @else if (ops().length === 0) {
        <div class="card"><div class="card-body">
          <div class="empty">
            <span class="e-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg></span>
            <h4>Sin órdenes de producción todavía</h4>
            <p>Las órdenes de producción aparecerán acá apenas se generen desde una OC.</p>
          </div>
        </div></div>
      } @else {
        <div class="card">
          <div class="table-scroll">
            <table class="data">
              <thead><tr><th>OP</th><th>OC</th><th>Cliente</th><th>Fecha</th><th>Estado</th></tr></thead>
              <tbody>
                @for (op of ops(); track op.id) {
                  <tr [routerLink]="['/pedidos/op', op.id]" style="cursor:pointer">
                    <td class="cell-mono">#{{ op.consecutivo }}</td>
                    <td class="cell-sub">#{{ op.oc?.consecutivo }}</td>
                    <td>{{ op.oc?.cliente?.nombre }}</td>
                    <td class="cell-sub">{{ op.fecha | date:'dd/MM/yyyy' }}</td>
                    <td><span class="badge {{ badge(op).clase }}"><span class="dot"></span>{{ badge(op).label }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  `,
})
export class OpListComponent implements OnInit {
  private readonly api = inject(PedidosApi);
  private readonly destroyRef = inject(DestroyRef);

  ops = signal<OrdenProduccion[]>([]);
  cargando = signal(true);

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando.set(true);
    this.api.listarOP()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ops) => { this.ops.set(ops); this.cargando.set(false); },
        error: () => this.cargando.set(false),
      });
  }

  badge(op: OrdenProduccion) { return badgeOP(op.estado); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: PASS — los 2 specs de `OpListComponent` verdes.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/pedidos/op/op-list.component.ts frontend/src/app/features/pedidos/op/op-list.component.spec.ts
git commit -m "feat(pedidos): op-list (tabla de OP, fila navega al detalle de amarre)"
```

---

## Task 4: Ruta `/pedidos/op` + ítem de menú

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/layout/shell/shell.component.ts`

- [ ] **Step 1: Agregar la ruta ANTES de `pedidos/op/:id`**

En `frontend/src/app/app.routes.ts`, dentro de los `children`, agregar la ruta de la lista **antes** de la ruta de detalle `pedidos/op/:id` (orden importa: la lista debe matchear `/pedidos/op` y el detalle `/pedidos/op/1`):

```typescript
      { path: 'pedidos/oc', loadComponent: () => import('./features/pedidos/oc/oc-list.component').then(m => m.OcListComponent) },
      { path: 'pedidos/op', loadComponent: () => import('./features/pedidos/op/op-list.component').then(m => m.OpListComponent) },
      { path: 'pedidos/op/:id', loadComponent: () => import('./features/pedidos/op/op-detalle.component').then(m => m.OpDetalleComponent) },
      { path: 'clientes', loadComponent: () => import('./features/clientes/clientes-list.component').then(m => m.ClientesListComponent) },
```

(Reemplazá el bloque existente de esas rutas por este, manteniendo el resto del archivo igual.)

- [ ] **Step 2: Agregar el ítem de menú en el shell**

En `frontend/src/app/layout/shell/shell.component.ts`, dentro del grupo `<div class="nav-group">` de "Operación", entre el `<a>` de "Órdenes de Compra" y el de "Clientes", insertar:

```html
          <a class="nav-item" routerLink="/pedidos/op" routerLinkActive="is-active">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg></span>
            <span class="nav-label">Órdenes de Producción</span>
          </a>
```

Leé el archivo primero para ubicar exactamente el cierre del `<a>` de "Órdenes de Compra" y colocar el nuevo `<a>` justo después.

- [ ] **Step 3: Run tests**

Run: `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: PASS — toda la suite sigue verde (cambios de routing/menú no rompen specs existentes).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/layout/shell/shell.component.ts
git commit -m "feat(pedidos): ruta /pedidos/op + item de menu Ordenes de Produccion"
```

---

## Task 5: Verificación (build + E2E manual con Playwright)

**Files:** ninguno (verificación).

- [ ] **Step 1: Build de producción**

Run: `npm run build`
Expected: `Application bundle generation complete.` sin warnings ni errores.

- [ ] **Step 2: Recorrido en el navegador (stack ya levantado en :3001/:4200)**

1. Login `admin` / `admin123`.
2. En el menú lateral aparece **"Órdenes de Producción"** → click → `/pedidos/op` muestra la tabla con la OP #1 (cliente Minera El Roble, estado Amarrada).
3. Click en la fila → navega a `/pedidos/op/1` (pantalla de amarre).
4. **Prueba del 401:** esperar a que expire el token (~15 min) o forzarlo (borrar `accessToken` de localStorage en DevTools y hacer una navegación que dispare una request) → la app debe **redirigir a `/login?expired=1`** y mostrar el banner "Tu sesión expiró, ingresá de nuevo", en vez de una lista vacía.

Expected: el listado de OP es accesible desde el menú y la fila navega al amarre; el 401 redirige limpio al login con el aviso.

- [ ] **Step 3: Actualizar el handoff**

Editar `docs/ESTADO.md`: registrar el listado de OP en el menú y el interceptor 401 como hechos; quitar de "deudas" la del interceptor de errores HTTP (al menos el 401). Sumar los nuevos tests al conteo.

- [ ] **Step 4: Commit**

```bash
git add docs/ESTADO.md
git commit -m "docs: navegabilidad (op-list + interceptor 401) lista"
```

---

## Self-Review (hecho)

- **Cobertura del spec:** ① op-list (Task 3) + ruta/menú (Task 4) ✓; ② interceptor (Task 1) + registro/banner (Task 2) ✓; testing (Tasks 1-3) ✓; verificación (Task 5) ✓.
- **Sin placeholders:** todo el código está completo en cada paso.
- **Consistencia de tipos:** `authErrorInterceptor` (Task 1) se importa idéntico en Task 2; `OpListComponent` (Task 3) se referencia igual en la ruta (Task 4); `listarOP()`/`badgeOP`/modelo `OrdenProduccion` ya existen. Ruta `pedidos/op` colocada antes de `pedidos/op/:id` (riesgo de orden anotado en el spec, resuelto en Task 4 Step 1).
- **YAGNI:** sin refresh de token, sin sistema de toasts, sin guarda anti-doble-redirect (anotado en el spec como aceptable).
