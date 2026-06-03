# Frontend Fundaciones (F1+F2+F3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar la base del frontend lista: estilos del design system "Acero" (claro/oscuro), app shell navegable (sidebar+topbar), capa de datos (modelos + servicios API) y seed de demo en el backend.

**Architecture:** Angular 19 standalone + signals. CSS plano del design system cargado como estilos globales (tokens/components/shell). `@angular/cdk` instalado para fases siguientes. Shell como componente layout que envuelve rutas hijas con `routerLink`. Servicios HTTP con `HttpClient` tipados contra los endpoints del Módulo 2. Seed Prisma idempotente.

**Tech Stack:** Angular 19.2, @angular/cdk, RxJS/signals, Karma/Jasmine, Prisma 7.8 (seed).

**Spec:** `docs/specs/2026-06-03-frontend-flujo-pedidos-design.md`
**Design system de referencia:** `design-ref/` (tokens.css, components.css, shell.css, shell.js).

---

## File Structure

```
frontend/
  angular.json                         (modificar: agregar los 3 CSS a "styles")
  src/index.html                       (modificar: fuentes Google + lang es)
  src/styles.scss                      (modificar: base global mínima)
  src/styles/
    tokens.css                         (copiar de design-ref/assets/tokens.css)
    components.css                      (copiar de design-ref/assets/components.css)
    shell.css                          (copiar de design-ref/assets/shell.css)
  src/environments/
    environment.ts                     (crear: apiUrl)
  src/app/
    app.routes.ts                      (modificar: shell layout + rutas hijas)
    app.component.ts / .html           (modificar: solo <router-outlet/>)
    core/
      theme/
        theme.service.ts               (crear)
        theme.service.spec.ts          (crear)
      api/
        models/
          pedidos.models.ts            (crear: tipos espejo del backend)
        clientes.api.ts                (crear)
        clientes.api.spec.ts           (crear)
        pedidos.api.ts                 (crear)
        pedidos.api.spec.ts            (crear)
        inventario.api.ts              (crear)
    shared/ui/
      theme-toggle/theme-toggle.component.ts   (crear)
    layout/
      shell/shell.component.ts         (crear: sidebar + topbar + outlet)
backend/
  prisma/seed-demo.ts                  (crear)
  package.json                         (modificar: script seed:demo)
```

---

## Task 1: Estilos globales del design system + fuentes + CDK

**Files:**
- Create: `frontend/src/styles/tokens.css`, `frontend/src/styles/components.css`, `frontend/src/styles/shell.css`
- Modify: `frontend/angular.json`, `frontend/src/index.html`, `frontend/src/styles.scss`

- [ ] **Step 1: Instalar @angular/cdk (misma versión que Angular 19)**

Run: `cd frontend && npm install @angular/cdk@^19.2.0`
Expected: agrega `@angular/cdk` a dependencies sin errores de peer.

- [ ] **Step 2: Copiar los 3 CSS del design system**

Copiar el contenido EXACTO de cada archivo de `design-ref/assets/` a `frontend/src/styles/`:
- `design-ref/assets/tokens.css`     → `frontend/src/styles/tokens.css`
- `design-ref/assets/components.css` → `frontend/src/styles/components.css`
- `design-ref/assets/shell.css`      → `frontend/src/styles/shell.css`

(En PowerShell: `Copy-Item design-ref/assets/tokens.css frontend/src/styles/tokens.css`, ídem los otros.)

- [ ] **Step 3: Registrar los CSS globales en angular.json (orden importa)**

En `frontend/angular.json`, en `projects.<proj>.architect.build.options.styles`, reemplazar el array por (tokens → components → shell → styles.scss):

```json
"styles": [
  "src/styles/tokens.css",
  "src/styles/components.css",
  "src/styles/shell.css",
  "src/styles.scss"
]
```

Hacer el mismo cambio en `architect.test.options.styles` si existe; si no existe la clave, omitir.

- [ ] **Step 4: Agregar las fuentes y lang en index.html**

En `frontend/src/index.html`: poner `<html lang="es">` y dentro de `<head>`, antes de cerrar, agregar:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

- [ ] **Step 5: Base global en styles.scss**

Reemplazar el contenido de `frontend/src/styles.scss` por:

```scss
/* Estilos globales base. Tokens/components/shell se cargan vía angular.json. */
html, body {
  margin: 0;
  min-height: 100dvh;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: var(--text-body);
  line-height: var(--lh-body);
}
* { box-sizing: border-box; }
```

- [ ] **Step 6: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: build sin errores (los CSS se incluyen en el bundle).

- [ ] **Step 7: Commit**

```bash
git add frontend/angular.json frontend/src/index.html frontend/src/styles.scss frontend/src/styles frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): estilos del design system Acero + fuentes + @angular/cdk

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: ThemeService (claro/oscuro)

**Files:**
- Create: `frontend/src/app/core/theme/theme.service.ts`, `frontend/src/app/core/theme/theme.service.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// frontend/src/app/core/theme/theme.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({});
  });

  it('arranca en light por defecto (sin nada en localStorage)', () => {
    const svc = TestBed.inject(ThemeService);
    expect(svc.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('lee dark desde localStorage y aplica data-theme', () => {
    localStorage.setItem('agro-theme', 'dark');
    const svc = TestBed.inject(ThemeService);
    expect(svc.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('toggle alterna el tema, el DOM y persiste', () => {
    const svc = TestBed.inject(ThemeService);
    svc.toggle();
    expect(svc.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('agro-theme')).toBe('dark');
    svc.toggle();
    expect(svc.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    expect(localStorage.getItem('agro-theme')).toBe('light');
  });
});
```

- [ ] **Step 2: Run test para verificar que falla**

Run: `cd frontend && npx ng test --watch=false --include="**/theme.service.spec.ts"`
Expected: FAIL — "Cannot find module './theme.service'".

- [ ] **Step 3: Implementar el service**

```typescript
// frontend/src/app/core/theme/theme.service.ts
import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
const KEY = 'agro-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.read());

  constructor() {
    this.apply(this.theme());
  }

  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    this.apply(next);
    try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  }

  private read(): Theme {
    try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  }

  private apply(t: Theme): void {
    const el = document.documentElement;
    if (t === 'dark') el.setAttribute('data-theme', 'dark');
    else el.removeAttribute('data-theme');
  }
}
```

- [ ] **Step 4: Run test para verificar que pasa**

Run: `cd frontend && npx ng test --watch=false --include="**/theme.service.spec.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/core/theme
git commit -m "feat(frontend): ThemeService claro/oscuro con persistencia

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: theme-toggle component

**Files:**
- Create: `frontend/src/app/shared/ui/theme-toggle/theme-toggle.component.ts`

- [ ] **Step 1: Implementar el componente (presentacional, usa ThemeService)**

```typescript
// frontend/src/app/shared/ui/theme-toggle/theme-toggle.component.ts
import { Component, inject } from '@angular/core';
import { ThemeService } from '../../../core/theme/theme.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  template: `
    <button class="icon-btn" type="button" title="Cambiar tema" (click)="theme.toggle()">
      @if (theme.theme() === 'dark') {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 1v3M12 20v3M4 12H1M23 12h-3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>
      } @else {
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
      }
    </button>
  `,
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/shared/ui/theme-toggle
git commit -m "feat(frontend): theme-toggle component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: App shell (sidebar + topbar)

**Files:**
- Create: `frontend/src/app/layout/shell/shell.component.ts`

Referencia de estructura: `design-ref/assets/shell.js` (NAV, brand, footer, topbar). Los íconos SVG salen de ese archivo (objeto `ICON`).

- [ ] **Step 1: Implementar el shell**

Componente layout que reproduce el sidebar (grupos de navegación con `routerLink` + `routerLinkActive`) y el topbar (título + búsqueda + theme-toggle), envolviendo `<router-outlet/>`. El host actúa como contenedor flex (equivalente a `body.app-body` del design system).

```typescript
// frontend/src/app/layout/shell/shell.component.ts
import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ThemeToggleComponent } from '../../shared/ui/theme-toggle/theme-toggle.component';
import { AuthService } from '../../core/auth/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggleComponent],
  host: { class: 'app-body' },
  styles: [`:host{display:flex;min-height:100dvh}`],
  template: `
    <aside class="app-sidebar">
      <a class="brand" routerLink="/pedidos/oc">
        <span class="brand-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5v9a4 4 0 0 0 4 4h10a2 2 0 0 0 2-2 4 4 0 0 0-3-3.9L11 10V5z"/></svg></span>
        <span class="brand-text"><b>BOTAS</b><small>AGROINDUSTRIAL</small></span>
      </a>
      <nav class="nav">
        <div class="nav-group">
          <div class="nav-group-h">Operación</div>
          <a class="nav-item" routerLink="/pedidos/oc" routerLinkActive="is-active">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h13l3 3v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg></span>
            <span class="nav-label">Órdenes de Compra</span>
          </a>
          <a class="nav-item" routerLink="/clientes" routerLinkActive="is-active">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.6M21 20a5.5 5.5 0 0 0-4-5.3"/></svg></span>
            <span class="nav-label">Clientes</span>
          </a>
        </div>
        <div class="nav-group">
          <div class="nav-group-h">Planta · MES<span class="nav-tag">Próximamente</span></div>
          <a class="nav-item is-soon" href="#" tabindex="-1" aria-disabled="true">
            <span class="nav-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.5 15.5M20 20L8.5 8.5"/></svg></span>
            <span class="nav-label">Corte & Guarnición</span>
          </a>
        </div>
      </nav>
      <div class="sidebar-foot">
        <div class="user-card">
          <span class="avatar">CM</span>
          <span class="user-meta"><b>Carolina M.</b><small>Oficial de ventas</small></span>
          <button class="icon-btn" type="button" title="Salir" (click)="logout()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
          </button>
        </div>
      </div>
    </aside>
    <main class="app-main">
      <header class="app-topbar">
        <div class="topbar-left"><h1 class="t-h2">Órdenes de Compra</h1></div>
        <div class="topbar-right">
          <app-theme-toggle />
        </div>
      </header>
      <router-outlet />
    </main>
  `,
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
```

Nota: si `AuthService` no expone `logout()`, usar el método de cierre de sesión existente (revisar `auth.service.ts`); si no existe, limpiar tokens vía el método disponible y navegar a `/login`.

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/layout/shell
git commit -m "feat(frontend): app shell (sidebar + topbar) con routerLink

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Routing con shell layout + limpiar app.component

**Files:**
- Modify: `frontend/src/app/app.routes.ts`, `frontend/src/app/app.component.ts`, `frontend/src/app/app.component.html`

- [ ] **Step 1: Reescribir app.routes.ts (shell con rutas hijas, placeholders temporales)**

```typescript
// frontend/src/app/app.routes.ts
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
      { path: 'pedidos/oc', loadComponent: () => import('./features/placeholder.component').then(m => m.PlaceholderComponent) },
      { path: 'clientes', loadComponent: () => import('./features/placeholder.component').then(m => m.PlaceholderComponent) },
      { path: '', pathMatch: 'full', redirectTo: 'pedidos/oc' },
    ],
  },
  { path: '**', redirectTo: '' },
];
```

- [ ] **Step 2: Crear el placeholder temporal de features**

```typescript
// frontend/src/app/features/placeholder.component.ts
import { Component } from '@angular/core';

@Component({
  selector: 'app-placeholder',
  standalone: true,
  template: `<div class="page"><div class="page-header"><div class="ph-title">En construcción</div></div><div class="card"><div class="card-body">Pantalla pendiente — se construye en su fase.</div></div></div>`,
})
export class PlaceholderComponent {}
```

- [ ] **Step 3: Limpiar app.component (solo el outlet)**

`frontend/src/app/app.component.ts`:
```typescript
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class AppComponent {}
```

Borrar `frontend/src/app/app.component.html` y `app.component.scss` (ya no se usan; el componente pasa a inline). Si el `.spec.ts` referencia el título 'frontend', actualizarlo para no romper (ver Step 4).

- [ ] **Step 4: Ajustar app.component.spec.ts**

Reemplazar `frontend/src/app/app.component.spec.ts` por una versión mínima que no dependa del template viejo:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [provideRouter([])],
  }));

  it('se crea', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
```

- [ ] **Step 5: Verificar build + arranque visual**

Run: `cd frontend && npm run build`
Expected: compila sin errores.

Run (manual, no bloqueante): `cd frontend && npm start` y abrir `http://localhost:4200` → redirige a `/login`; tras login muestra el shell con sidebar/topbar y el placeholder. Probar el toggle de tema (claro/oscuro). Detener con Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/app.component.ts frontend/src/app/features/placeholder.component.ts frontend/src/app/app.component.spec.ts
git rm frontend/src/app/app.component.html frontend/src/app/app.component.scss
git commit -m "feat(frontend): routing con shell layout + rutas hijas; limpia app.component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Modelos TS + environment

**Files:**
- Create: `frontend/src/environments/environment.ts`, `frontend/src/app/core/api/models/pedidos.models.ts`

- [ ] **Step 1: Crear environment**

```typescript
// frontend/src/environments/environment.ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3001',
};
```

- [ ] **Step 2: Crear los modelos (espejo del backend)**

```typescript
// frontend/src/app/core/api/models/pedidos.models.ts
export type EstadoOC = 'BORRADOR' | 'CONFIRMADA' | 'EN_PRODUCCION' | 'CERRADA' | 'ANULADA';
export type EstadoOP = 'CREADA' | 'AMARRADA' | 'EN_PRODUCCION' | 'ANULADA';
export type TipoCredito = 'CONTADO' | 'D30' | 'D60' | 'D90';
export type EstadoCartera = 'AL_DIA' | 'VENCIDO' | 'BLOQUEADO';
export type TipoBodega = 'PROPIA' | 'HERMANA';

export interface Cliente {
  id: number;
  nit: string;
  nombre: string;
  ciudad?: string | null;
  tipoCredito: TipoCredito;
  cupo?: string | null;
  estadoCartera: EstadoCartera;
  activo: boolean;
}

export interface Talla { id: number; valor: number; orden: number; }

export interface ProductoConfigurado {
  id: number;
  codigo: string;
  nombreComercial: string;
  referenciaId: number;
  marcaId: number;
}

export interface OCLineaTalla { id: number; tallaId: number; cantidad: number; talla?: Talla; }
export interface OCLinea {
  id: number;
  productoConfiguradoId: number;
  productoConfigurado?: ProductoConfigurado;
  tallas: OCLineaTalla[];
}
export interface OrdenCompra {
  id: number;
  consecutivo: number;
  ocCliente?: string | null;
  clienteId: number;
  cliente?: Cliente;
  fecha: string;
  estado: EstadoOC;
  observaciones?: string | null;
  lineas?: OCLinea[];
  ordenProduccion?: { id: number; consecutivo: number; estado: EstadoOP } | null;
}

export interface ReservaInventarioPT {
  id: number;
  inventarioPTId: number;
  cantidad: number;
  inventarioPT?: { id: number; bodegaId: number; bodega?: { id: number; codigo: string; nombre: string } };
}
export interface OPLineaTalla {
  id: number;
  tallaId: number;
  cantPedida: number;
  cantAmarrada: number;
  cantAProducir: number;
  talla?: Talla;
  reservas?: ReservaInventarioPT[];
}
export interface OPLinea {
  id: number;
  productoConfiguradoId: number;
  productoConfigurado?: ProductoConfigurado;
  tallas: OPLineaTalla[];
}
export interface OrdenProduccion {
  id: number;
  consecutivo: number;
  ocId: number;
  oc?: OrdenCompra;
  fecha: string;
  estado: EstadoOP;
  lineas?: OPLinea[];
}

// DTOs de creación
export interface CrearClienteDto { nit: string; nombre: string; ciudad?: string; tipoCredito?: TipoCredito; cupo?: number; }
export interface CrearOCTallaDto { tallaId: number; cantidad: number; }
export interface CrearOCLineaDto { productoConfiguradoId: number; tallas: CrearOCTallaDto[]; }
export interface CrearOCDto { clienteId: number; ocCliente?: string; observaciones?: string; lineas: CrearOCLineaDto[]; }
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/environments frontend/src/app/core/api/models
git commit -m "feat(frontend): environment + modelos TS espejo del backend

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Servicios API (Clientes, Pedidos, Inventario)

**Files:**
- Create: `frontend/src/app/core/api/clientes.api.ts`, `clientes.api.spec.ts`, `pedidos.api.ts`, `pedidos.api.spec.ts`, `inventario.api.ts`

- [ ] **Step 1: Test de ClientesApi (HttpTestingController)**

```typescript
// frontend/src/app/core/api/clientes.api.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClientesApi } from './clientes.api';

describe('ClientesApi', () => {
  let api: ClientesApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ClientesApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ClientesApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('listar hace GET /clientes', () => {
    api.listar().subscribe();
    const req = http.expectOne('http://localhost:3001/clientes');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('crear hace POST /clientes con el dto', () => {
    api.crear({ nit: '900', nombre: 'ACME' }).subscribe();
    const req = http.expectOne('http://localhost:3001/clientes');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ nit: '900', nombre: 'ACME' });
    req.flush({ id: 1 });
  });
});
```

- [ ] **Step 2: Run test para verificar que falla**

Run: `cd frontend && npx ng test --watch=false --include="**/clientes.api.spec.ts"`
Expected: FAIL — "Cannot find module './clientes.api'".

- [ ] **Step 3: Implementar ClientesApi**

```typescript
// frontend/src/app/core/api/clientes.api.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Cliente, CrearClienteDto } from './models/pedidos.models';

@Injectable({ providedIn: 'root' })
export class ClientesApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/clientes`;

  listar() { return this.http.get<Cliente[]>(this.base); }
  obtener(id: number) { return this.http.get<Cliente>(`${this.base}/${id}`); }
  crear(dto: CrearClienteDto) { return this.http.post<Cliente>(this.base, dto); }
}
```

- [ ] **Step 4: Run test para verificar que pasa**

Run: `cd frontend && npx ng test --watch=false --include="**/clientes.api.spec.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Test de PedidosApi**

```typescript
// frontend/src/app/core/api/pedidos.api.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PedidosApi } from './pedidos.api';

describe('PedidosApi', () => {
  let api: PedidosApi;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [PedidosApi, provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(PedidosApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('listarOC hace GET /pedidos/oc', () => {
    api.listarOC().subscribe();
    const req = http.expectOne('http://localhost:3001/pedidos/oc');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('confirmarOC hace POST /pedidos/oc/:id/confirmar', () => {
    api.confirmarOC(5).subscribe();
    const req = http.expectOne('http://localhost:3001/pedidos/oc/5/confirmar');
    expect(req.request.method).toBe('POST');
    req.flush({ id: 5, estado: 'CONFIRMADA' });
  });

  it('generarOP hace POST /pedidos/op/desde-oc/:ocId', () => {
    api.generarOP(5).subscribe();
    const req = http.expectOne('http://localhost:3001/pedidos/op/desde-oc/5');
    expect(req.request.method).toBe('POST');
    req.flush({ id: 50 });
  });

  it('obtenerOP hace GET /pedidos/op/:id', () => {
    api.obtenerOP(50).subscribe();
    const req = http.expectOne('http://localhost:3001/pedidos/op/50');
    expect(req.request.method).toBe('GET');
    req.flush({ id: 50 });
  });
});
```

- [ ] **Step 6: Run test para verificar que falla**

Run: `cd frontend && npx ng test --watch=false --include="**/pedidos.api.spec.ts"`
Expected: FAIL — "Cannot find module './pedidos.api'".

- [ ] **Step 7: Implementar PedidosApi**

```typescript
// frontend/src/app/core/api/pedidos.api.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { OrdenCompra, OrdenProduccion, CrearOCDto } from './models/pedidos.models';

@Injectable({ providedIn: 'root' })
export class PedidosApi {
  private readonly http = inject(HttpClient);
  private readonly oc = `${environment.apiUrl}/pedidos/oc`;
  private readonly op = `${environment.apiUrl}/pedidos/op`;

  crearOC(dto: CrearOCDto) { return this.http.post<OrdenCompra>(this.oc, dto); }
  listarOC() { return this.http.get<OrdenCompra[]>(this.oc); }
  obtenerOC(id: number) { return this.http.get<OrdenCompra>(`${this.oc}/${id}`); }
  confirmarOC(id: number) { return this.http.post<OrdenCompra>(`${this.oc}/${id}/confirmar`, {}); }

  generarOP(ocId: number) { return this.http.post<OrdenProduccion>(`${this.op}/desde-oc/${ocId}`, {}); }
  listarOP() { return this.http.get<OrdenProduccion[]>(this.op); }
  obtenerOP(id: number) { return this.http.get<OrdenProduccion>(`${this.op}/${id}`); }
  anularOP(id: number) { return this.http.post<OrdenProduccion>(`${this.op}/${id}/anular`, {}); }
}
```

- [ ] **Step 8: Run test para verificar que pasa**

Run: `cd frontend && npx ng test --watch=false --include="**/pedidos.api.spec.ts"`
Expected: PASS (4 tests).

- [ ] **Step 9: Implementar InventarioApi (sin test dedicado; CRUD trivial usado por el seed/demo)**

```typescript
// frontend/src/app/core/api/inventario.api.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class InventarioApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/inventario`;

  crearBodega(dto: { codigo: string; nombre: string; tipo?: string; prioridad?: number }) {
    return this.http.post(`${this.base}/bodegas`, dto);
  }
  registrarStock(dto: { productoConfiguradoId: number; tallaId: number; bodegaId: number; cantidad: number }) {
    return this.http.post(`${this.base}/pt`, dto);
  }
}
```

- [ ] **Step 10: Commit**

```bash
git add frontend/src/app/core/api
git commit -m "feat(frontend): servicios API (Clientes, Pedidos, Inventario) + tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Seed de demo (backend)

**Files:**
- Create: `backend/prisma/seed-demo.ts`
- Modify: `backend/package.json` (script `seed:demo`)

Requisito: la DB local (Docker, `localhost:5433`) corriendo y migrada; el seed del catálogo (`seed:catalogo`) ya ejecutado (provee referencias/marcas/productos configurados/tallas).

- [ ] **Step 1: Inspeccionar el seed de catálogo existente para reusar IDs/códigos**

Run: `cd backend && type prisma\seed-catalogo.ts` (PowerShell) — identificar códigos de `ProductoConfigurado` y `Talla` creados, para referenciarlos en el seed-demo. Anotar al menos un `ProductoConfigurado.codigo` y el rango de tallas.

- [ ] **Step 2: Escribir el seed-demo (idempotente con upsert)**

```typescript
// backend/prisma/seed-demo.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Clientes
  const clientes = [
    { nit: '900111222', nombre: 'Minera El Roble', ciudad: 'Medellín', tipoCredito: 'D60' as const },
    { nit: '900333444', nombre: 'Maquila Norte SAS', ciudad: 'Barranquilla', tipoCredito: 'D30' as const },
    { nit: '900555666', nombre: 'Constructora Yopal', ciudad: 'Yopal', tipoCredito: 'CONTADO' as const },
    { nit: '900777888', nombre: 'Agroindustrias del Llano', ciudad: 'Villavicencio', tipoCredito: 'D90' as const },
    { nit: '900999000', nombre: 'Petro Servicios SA', ciudad: 'Bogotá', tipoCredito: 'D60' as const },
  ];
  for (const c of clientes) {
    await prisma.cliente.upsert({ where: { nit: c.nit }, create: c, update: c });
  }

  // Bodegas
  await prisma.bodega.upsert({
    where: { codigo: 'IBG' },
    create: { codigo: 'IBG', nombre: 'Ibagué (Principal)', tipo: 'PROPIA', prioridad: 100 },
    update: { nombre: 'Ibagué (Principal)', tipo: 'PROPIA', prioridad: 100 },
  });
  await prisma.bodega.upsert({
    where: { codigo: 'BOG' },
    create: { codigo: 'BOG', nombre: 'Bogotá (Hermana)', tipo: 'HERMANA', prioridad: 200 },
    update: { nombre: 'Bogotá (Hermana)', tipo: 'HERMANA', prioridad: 200 },
  });

  // Stock PT parcial: para cada ProductoConfigurado existente, sembrar stock en
  // ~la mitad de las tallas (así el amarre muestra "en stock" + "a producir").
  const ibg = await prisma.bodega.findUniqueOrThrow({ where: { codigo: 'IBG' } });
  const productos = await prisma.productoConfigurado.findMany({
    include: { referencia: { include: { tallaMin: true, tallaMax: true } } },
  });
  const tallas = await prisma.talla.findMany({ orderBy: { orden: 'asc' } });

  for (const p of productos) {
    const min = p.referencia.tallaMin.valor;
    const max = p.referencia.tallaMax.valor;
    const enRango = tallas.filter((t) => t.valor >= min && t.valor <= max);
    // sembrar stock solo en tallas de índice par → mezcla stock/producir
    for (let i = 0; i < enRango.length; i++) {
      if (i % 2 === 0) {
        const t = enRango[i];
        await prisma.inventarioPT.upsert({
          where: {
            productoConfiguradoId_tallaId_bodegaId: {
              productoConfiguradoId: p.id, tallaId: t.id, bodegaId: ibg.id,
            },
          },
          create: { productoConfiguradoId: p.id, tallaId: t.id, bodegaId: ibg.id, cantDisponible: 50 },
          update: { cantDisponible: 50 },
        });
      }
    }
  }

  console.log('Seed demo OK:', { clientes: clientes.length, productos: productos.length });
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
```

- [ ] **Step 3: Agregar el script en package.json**

En `backend/package.json`, dentro de `"scripts"`, agregar:
```json
"seed:demo": "tsx prisma/seed-demo.ts"
```

- [ ] **Step 4: Ejecutar el seed y verificar**

Run: `cd backend && npm run seed:demo`
Expected: imprime `Seed demo OK: { clientes: 5, productos: <n> }` sin errores.

Verificación rápida (opcional): `npx prisma studio` o una query — confirmar que hay filas en `Cliente`, `Bodega` e `InventarioPT`.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/seed-demo.ts backend/package.json backend/package-lock.json
git commit -m "feat(backend): seed de demo (clientes, bodegas, stock PT parcial)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Cobertura del spec (F1-F3):** estilos del DS + fuentes (T1), tema claro/oscuro (T2-T3), app shell (T4), routing+guard (T5), environment+modelos (T6), servicios API (T7), seed (T8). ✓
- **Endpoints usados** coinciden con los del Módulo 2 ya en master (`/clientes`, `/pedidos/oc`, `/pedidos/oc/:id/confirmar`, `/pedidos/op/desde-oc/:ocId`, `/pedidos/op/:id`). ✓
- **Tipos consistentes** entre modelos (T6) y servicios (T7). ✓
- **Pendiente conocido:** el wizard (F6) necesitará GET de productos configurados/tallas del catálogo; si no existe, se agrega al backend en esa fase (anotado en el spec §11).

## Notas

- Las pantallas reales (Clientes, Listado OC, Crear OC, OP/Amarre) reemplazan al `placeholder.component` en sus planes (F4-F7).
- El `shell.component` arranca con título fijo "Órdenes de Compra"; en F5+ se puede hacer dinámico por ruta si se desea (no requerido para la demo).
- Fidelidad visual: se valida con `npm start` + inspección en el navegador (claro/oscuro). Las clases provienen de `components.css`/`shell.css` ya cargados.
