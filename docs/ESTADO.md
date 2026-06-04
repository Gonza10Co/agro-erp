# Estado del proyecto — agro-erp (Botas Agroindustrial ERP + MES)

> Handoff al 2026-06-04. Para retomar el trabajo en una sesión nueva.

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
- **OP / Amarre (F7) ⭐**: pantalla completa en ruta `/pedidos/op/:id` (`op-detalle.component`).
  Hero (OP/OC/cliente/estado) + summary (pedido/stock/producir/bodegas) + ring de cumplimiento +
  stack-bar + **amarre por talla** (barras stock/producir vs. pedido, con fila Σ) y **tab "Por
  bodega"** (tabla con columnas dinámicas por bodega). Acción **Anular OP**. Toda la agregación en
  funciones puras testeables `op/amarre-view.ts` (`resumenAmarre`/`filasPorTalla`/`filasPorBodega`/
  `bodegasDeOP`). Enlace desde el detalle de OC ("OP #N" → ruta). Alcance "fiel pero honesto":
  sin timeline ni detalle-modelo falsos (no hay datos en backend). Plan:
  `docs/plans/2026-06-04-frontend-op-amarre.md`.
- 42 tests verdes. `ng build` limpio (budget de estilo por componente subido a 8kB warn / 12kB error
  en `angular.json` para acomodar la pantalla densa de amarre).

## Qué falta — próximos planes (mismo patrón: spec frontend → writing-plans → subagentes)

El spec del frontend ya cubre todo: `docs/specs/2026-06-03-frontend-flujo-pedidos-design.md`.
Cada feature reemplaza el `placeholder.component` y reusa `ui-drawer`, los servicios API y los modelos.

- **F6 — Crear OC (wizard)** ← único feature pendiente: 4 pasos (cliente → productos configurados →
  curva de tallas → confirmar). Necesita un **combobox con búsqueda** (referencia:
  `design-ref/assets/combobox.js`) y un **talla-grid** (curva 33-47). **Gap confirmado**: el backend
  solo expone `catalog/bom/resolve` (no hay GET de productos configurados ni de tallas) — hay que
  agregarlos en esta fase.

### Mejoras menores anotadas en review de F7 (no bloquean, encarar al pasar)
- `op-detalle` muestra el skeleton "Cargando…" al recargar tras Anular (flash). Si molesta en demo:
  que `cargar()` no haga `op.set(null)` cuando es recarga.
- Anular OP es destructivo (libera reservas server-side) y no pide confirmación. Validar con el
  cliente en la demo; si lo piden, `if (!confirm('¿Anular esta OP?')) return;` antes de `accion.set(true)`.
- Si `op-detalle` sigue creciendo, extraer la card de amarre a un subcomponente presentacional
  `<app-op-amarre [op]="o">`.
- El enlace "OC-NNNN" del hero de la OP apunta al listado `/pedidos/oc` (no hay ruta de detalle de OC;
  el detalle vive en drawer). Correcto por ahora.

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
