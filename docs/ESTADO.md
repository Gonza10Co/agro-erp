# Estado del proyecto — agro-erp (Botas Agroindustrial ERP + MES)

> Handoff al 2026-06-03. Para retomar el trabajo en una sesión nueva.

## Qué hay hecho (todo en `master`, pusheado a GitHub)

### Backend (NestJS + Prisma + PostgreSQL)
- **Auth**: login JWT + refresh + roles + guards (argon2). Usuario demo: `admin` / `admin123`.
- **Módulo 1 — Catálogos + BOM**: referencias, marcas, tallas, materiales, productos
  configurados, resolvedor de BOM multinivel (overrides + consumo por talla).
- **Módulo 2 — Pedidos (OC → OP → amarre PT)**:
  - Cliente (CRUD), Bodega + InventarioPT, OrdenCompra (crear/confirmar), OrdenProduccion
    (generar desde OC con amarre transaccional + anular), reservas de inventario.
  - Endpoints GET de lectura: `/clientes`, `/pedidos/oc` (+`:id`), `/pedidos/op` (+`:id`
    con amarre desglosado por talla y reservas por bodega).
  - 60 tests verdes.

### Frontend (Angular 19.2 standalone + signals)
- **Fundaciones**: design system "Acero" (tokens/components/shell.css globales) + fuentes
  Inter/IBM Plex Mono + `@angular/cdk`. ThemeService claro/oscuro + theme-toggle.
  App shell (sidebar + topbar). Routing con shell layout + authGuard. environment +
  modelos TS (fieles al backend) + servicios API (Clientes/Pedidos/Inventario).
- **Login** rediseñado con el DS (split panel marca + form), redirect arreglado a `/`.
- **Clientes (F4)**: `ui-drawer` reutilizable + `cliente-form` (crear) + `clientes-list`
  (tabla densa + drawer). Ruta `/clientes` real. Verificado E2E.
- **Listado OC + Detalle (F5)**: `estado-badge` (mapeo estado→badge del DS), `oc-detalle`
  (cabecera kv-list + líneas/tallas + OP enlazada + acciones confirmar/generar OP, con
  `takeUntilDestroyed`), `oc-list` (tabla densa + drawer reusado). Ruta `/pedidos/oc` real.
  El detalle vive en el drawer (no en ruta `:id`). Verificado: login + ruta + empty state.
- 32 tests verdes.

## Qué falta — próximos planes (mismo patrón: spec frontend → writing-plans → subagentes)

El spec del frontend ya cubre todo: `docs/specs/2026-06-03-frontend-flujo-pedidos-design.md`.
Cada feature reemplaza el `placeholder.component` y reusa `ui-drawer`, los servicios API y los modelos.

- **F6 — Crear OC (wizard)**: 4 pasos (cliente → productos configurados → curva de tallas →
  confirmar). Necesita un **combobox con búsqueda** (referencia: `design-ref/assets/combobox.js`)
  y un **talla-grid** (curva 33-47). **Gap confirmado**: el backend solo expone `catalog/bom/resolve`
  (no hay GET de productos configurados ni de tallas) — hay que agregarlos en esta fase.
- **F7 — OP / Amarre ⭐** (pantalla estrella): detalle de OP con el amarre (pedido vs. en stock vs.
  a producir, por talla y bodega) usando `obtenerOP` y un componente `amarre-bar`.

## Cómo correr local

```
# DB (Docker): contenedor agro-erp-pg en localhost:5433
docker start agro-erp-pg      # (bin: "C:\Program Files\Docker\Docker\resources\bin")

# Backend (:3001) — OJO: usar build + start:prod (start:dev crashea, ver deuda)
cd agro-erp/backend
npm run build && npm run start:prod
# seeds (si la DB está limpia): npm run seed (usuario admin) ; npm run seed:catalogo ; npm run seed:demo

# Frontend (:4200)
cd agro-erp/frontend
npm start
# login: admin / admin123
```

## Deudas técnicas anotadas (no bloquean, encarar en el camino)
- Backend `npm run start:dev` (nest --watch) crashea ("Cannot find module dist/main").
  Workaround: `build` + `start:prod`. Arreglar la config del watcher.
- Shell: título del topbar y avatar/usuario hardcodeados → conectar a ruta activa y al JWT.
- Falta interceptor de errores HTTP global (401 → login; toasts). El `jwtInterceptor` solo
  agrega el token.
- `InventarioApi` sin tipos de retorno (tipar al definir modelos Bodega/InventarioPT).
- Antes del primer deploy del front: crear `environment.prod.ts` + `fileReplacements` en
  `angular.json` con la URL de Railway.
- `ui-drawer` sin focus-trap CDK (mejora de a11y posterior).
- Migración del Módulo 2 (`20260603143757_modulo2_pedidos`) aplicada solo en la DB local;
  para Railway falta `prisma migrate deploy`.
```
