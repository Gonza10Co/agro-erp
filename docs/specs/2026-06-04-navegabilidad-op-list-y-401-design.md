# Navegabilidad — Listado de OP + Interceptor 401 (Design)

> Diseño aprobado en brainstorming con Gonza el **2026-06-04**.
> Repo: `agro-erp/frontend` (Angular 19.2, standalone + signals).
> Surge del recorrido en vivo de F7: la pantalla de amarre solo se alcanzaba abriendo el aside
> de una OC, y al expirar el JWT (15 min) las listas mostraban un empty state engañoso.

## 1. Objetivo y alcance

Dos mejoras de navegabilidad **independientes**, ambas 100% en el frontend:

1. **Listado "Órdenes de Producción"** — un acceso directo a las OP desde el menú lateral, que
   lleva a la pantalla de detalle/amarre (`/pedidos/op/:id`, ya construida en F7) sin depender del
   aside de una OC.
2. **Interceptor de errores 401** — al expirar/invalidarse el token, redirigir limpio al login en
   vez de dejar las listas vacías (empty state engañoso).

**Fuera del alcance:**
- Refresh automático de token / endpoint `/auth/refresh` en el backend (decisión de Gonza:
  estrategia "solo redirigir"). La sesión sigue durando lo que dure el access token (~15 min).
- Sistema global de toasts (sigue como deuda; el aviso de sesión expirada se resuelve con un
  banner en el login, ver §3).
- Cualquier cambio en el backend (ambas features consumen endpoints ya existentes).

## 2. Feature ① — Listado "Órdenes de Producción"

### Datos (ya existen)
- `PedidosApi.listarOP()` → `GET /pedidos/op` (ya en `core/api/pedidos.api.ts`).
- El backend `op.service.ts#listar()` devuelve cada OP con: `id`, `consecutivo`, `estado`, `fecha`
  (scalars por defecto) y `oc: { id, consecutivo, cliente: { id, nombre } }`.
- Modelo `OrdenProduccion` ya en `core/api/models/pedidos.models.ts` (incluye `oc?` con `cliente?`).

### Componente
- **Crear** `features/pedidos/op/op-list.component.ts` — standalone, signals. Espejo de
  `features/pedidos/oc/oc-list.component.ts` pero **sin drawer**: la fila navega directo.
- Reusa `estado-badge` (`badgeOP`) y las clases globales del DS (`page`, `card`, `data`,
  `table-scroll`, `badge`, `cell-mono`, `cell-sub`).

### Tabla
```
┌──────┬──────┬─────────────────┬────────────┬───────────────┐
│ OP   │ OC   │ Cliente         │ Fecha      │ Estado        │
├──────┼──────┼─────────────────┼────────────┼───────────────┤
│ #1   │ #1   │ Minera El Roble │ 04/06/2026 │ ● Amarrada    │
└──────┴──────┴─────────────────┴────────────┴───────────────┘
        click en fila → routerLink /pedidos/op/:id
```
- Columna OP: `#{{ op.consecutivo }}` (cell-mono).
- Columna OC: `#{{ op.oc?.consecutivo }}` (cell-sub).
- Cliente: `op.oc?.cliente?.nombre`.
- Fecha: `op.fecha | date:'dd/MM/yyyy'` (cell-sub).
- Estado: `<span class="badge {{ badgeOP(op.estado).clase }}"><span class="dot"></span>{{ badgeOP(op.estado).label }}</span>`.
- Estados de la pantalla: `cargando` (card con texto) y empty (card con `.empty`, mensaje
  "Sin órdenes de producción todavía").
- Fila clickeable: `[routerLink]="['/pedidos/op', op.id]"` en la `<tr>` (cursor pointer), igual
  que el patrón de selección de `oc-list` pero navegando en vez de abrir drawer.

### Routing
- **Modificar** `app.routes.ts`: agregar `{ path: 'pedidos/op', loadComponent: () => import('./features/pedidos/op/op-list.component').then(m => m.OpListComponent) }` dentro de los `children` del shell, antes de `pedidos/op/:id` (para que `/pedidos/op` matchee la lista y `/pedidos/op/1` el detalle).

### Menú (shell)
- **Modificar** `layout/shell/shell.component.ts`: agregar un `<a class="nav-item" routerLink="/pedidos/op" routerLinkActive="is-active">` en el grupo "Operación", entre "Órdenes de Compra" y "Clientes", con un ícono propio (engranaje/producción) y label "Órdenes de Producción".

## 3. Feature ② — Interceptor de errores 401

### Componente
- **Crear** `core/interceptors/auth-error.interceptor.ts` — `HttpInterceptorFn` funcional (igual
  estilo que `jwt.interceptor.ts`).

### Comportamiento
```
intercepta la respuesta de cada request
        │
  catchError(err):
     ¿err.status === 401  Y  la URL NO termina en '/auth/login'?
        ├─ SÍ → authService.logout(); router.navigateByUrl('/login?expired=1'); rethrow
        └─ NO → rethrow (el error sigue su curso normal)
```
- **Exclusión de `/auth/login`**: un login con credenciales malas también devuelve 401; no debe
  disparar el "sesión expiró" ni un loop de redirección. Se detecta por la URL de la request.
- Usa `inject(AuthService)` y `inject(Router)` dentro de la función del interceptor.
- Reusa `AuthService.logout()` (ya limpia `accessToken`/`refreshToken` de localStorage).

### Registro
- **Modificar** el `provideHttpClient(withInterceptors([...]))` (en `app.config.ts` o donde se
  registre `jwtInterceptor`) para agregar `authErrorInterceptor` **después** de `jwtInterceptor`.

### Aviso en el login
- **Modificar** `features/login/login.component.ts`: leer el query param `expired` (vía
  `ActivatedRoute`) y, si está presente, mostrar un banner sobrio sobre el formulario:
  *"Tu sesión expiró, ingresá de nuevo."* (clase de alerta del DS o estilo inline con tokens).

## 4. Testing (Karma/Jasmine)

- **`auth-error.interceptor.spec.ts`**: con `HttpTestingController`,
  - una request cualquiera que responde 401 → se llama `logout()` y `router.navigateByUrl` con
    `/login?expired=1` (espiar el Router y AuthService).
  - una request a `/auth/login` que responde 401 → NO se llama `navigateByUrl` (no redirige).
  - un 200/500 → no redirige.
- **`op-list.component.spec.ts`**: hace `GET /pedidos/op`, flush con una OP → renderiza la fila con
  el consecutivo y el cliente; empty state con `[]`. (Necesita `provideRouter([])` por el
  `routerLink` de la fila.)

## 5. Orden de construcción
- Son independientes; se construyen en cualquier orden. Sugerido: ② interceptor primero (mejora
  base de auth), luego ① op-list (feature visible). Cada uno con su ciclo TDD.

## 6. Riesgos y notas
- **Orden de rutas**: `pedidos/op` debe ir antes que `pedidos/op/:id` en los children (Angular
  matchea en orden; `:id` no debe capturar la lista). Verificar en el plan.
- **Doble redirect**: el interceptor podría dispararse para varias requests 401 simultáneas y
  llamar `navigateByUrl` varias veces. Es idempotente (todas van a `/login?expired=1`); no se
  agrega guarda anti-doble por YAGNI, pero se anota.
- **authGuard existente**: ya protege el acceso a rutas sin token; el interceptor cubre el caso
  complementario de token que expira *estando adentro* (las llamadas API dan 401 pero el guard no
  se re-evalúa).
