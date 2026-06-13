# Estado del proyecto — agro-erp (Botas Agroindustrial ERP + MES)

> Handoff al 2026-06-12. Para retomar el trabajo en una sesión nueva.
>
> **Nota:** la mayor parte de este documento quedó congelada al 2026-06-04 (no refleja las
> Demos 5–8, que sí están en git: MES/trazabilidad, calidad, detalle de guarnición, indicadores
> de eficiencia). La fuente de verdad del avance es el git log. Las secciones de las
> Demos 9–13 de abajo sí están al día. La Demo 12 (inventario consolidado + kardex MP) está
> en git (commits `5de23c7`…`9ff9fad`) sin sección propia acá.

## Demo 13 — Compras lado proveedor (2026-06-12) ✅ — en `develop`

Cierra la cadena de compras que moría en el requerimiento (hueco #3 del kickoff: logística
inversa). Del requerimiento se generan **OCP** (órdenes de compra a proveedor, una por
proveedor) con **estado derivado** (PENDIENTE → PARCIAL → COMPLETA); cada llegada es una
**recepción** (parcial o total = backorder natural) que alimenta `InventarioMaterial` y el
kardex (`ENTRADA/COMPRA`, ref `OCP-n`); la **devolución a proveedor** por calidad descuenta
stock con guarda `gte` + kardex (`SALIDA/DEVOLUCION_PROVEEDOR`) sin tocar lo recibido.

- **Schema:** `OrdenCompraProveedor(+Linea)`, `RecepcionCompra(+Linea)`, `DevolucionProveedor(+Linea)`,
  `EstadoRequerimiento += CON_ORDEN`. Migraciones `demo13_compras_proveedor` + `demo13_consecutivo_seqs`
  (secuencias `ocp`/`recepcion`/`devolucion`).
- **Backend:** núcleo puro `compras-proveedor-core` (estadoOcp, validarRecepcion con
  sobre-recepción rechazada, validarDevolucion) + `ComprasProveedorService` + endpoints
  `POST /requerimientos/:id/ordenes` (409 si CON_ORDEN; materiales sin proveedor → advertencia),
  `GET /compras/ordenes(/:id)`, `POST /compras/ordenes/:id/recepciones|devoluciones`.
  `GET /requerimientos/:id` ahora devuelve `estado`.
- **Frontend:** `/compras/ordenes` (listado con barra de avance + badge), `/compras/ordenes/:id`
  (líneas pedido/recibido/pendiente + historial REC-n/DEV-n + drawers de recepción —prellenada
  con lo pendiente— y devolución con causa), botón **"Generar órdenes de compra"** en el
  requerimiento con banner de resultado, ítem **Compras** en el sidebar.
- **248 tests backend + 170 frontend verdes**; ambos builds limpios.
- **Verificado E2E (API + browser):** requerimiento → generar (OCP por proveedor) → re-generar 409 →
  sobre-recepción 400 → recepción parcial (PARCIAL) → restante (COMPLETA) → devolución 2 kg →
  stock y kardex correctos. En UI: listado → detalle → drawer recepción → COMPLETA.
  Screenshots `demo13-ocp-listado.png` + `demo13-ocp-detalle-completa.png`.
- Seed: OCP-n PARCIAL de Curtiembre (30 m pedidos / 20 recibidos) con REC y DEV históricos,
  coherente con el kardex de Demo 12. El requerimiento de OP-9003 queda CALCULADO para
  demostrar "Generar órdenes" en vivo.
- Plan: `docs/plans/2026-06-12-demo13-compras-proveedor.md`.
- **Pendiente:** merge a `master` + tag `demo-13`. Futuro anotado: precio en línea de OCP
  (costos de compra), nota crédito proveedor (Gálago), anulación de OCP.

## Demo 11 — Dashboard gerencial (2026-06-10) ✅ — en `develop`

Home ejecutiva (`/inicio`, ahora la ruta raíz) con los KPIs de todo el sistema, servidos por un
único endpoint agregador `GET /dashboard` (una llamada, todo calculado en el back).

- **KPIs:** pedidos en curso + por estado; OFs activas y pares EN_PROCESO por célula (barras);
  despachos del mes; facturación del mes ($ + count); cartera (saldo total/vencido + clientes vencidos).
- **Backend:** módulo `dashboard` (`DashboardService.resumen` con `Promise.all` de groupBy/count/
  aggregate, reutiliza `cartera-core` para saldos), núcleo puro `dashboard-core.rangoMes(hoy)`,
  `GET /dashboard`.
- **Frontend:** `DashboardApi`, `dashboard.component` (cards KPI con links a cada módulo + barras de
  producción por célula + grilla de pedidos por estado). Home `/` → `/inicio`; ítem "Inicio" en el menú.
- **195 tests backend + 143 frontend verdes**; ambos builds limpios.
- **Verificado** (API + browser, screenshot `demo11-dashboard.png`).
- **Pendiente:** merge a `master` + tag `demo-11`.

---

## Demo 10 — Cartera / Cuentas por cobrar (2026-06-10) ✅ — en `develop`

Cierra el círculo financiero: cada factura es una **CxC** con vencimiento y saldo; los pagos la
saldan; el **`estadoCartera` del cliente se calcula solo** y alimenta la regla de bloqueo de despacho.

- **Schema:** `model Pago` (monto/medio/fecha) + `fechaVencimiento` en Factura. Migración `demo10_cartera`.
- **Vencimiento** = fecha emisión + díasCrédito(tipoCredito): CONTADO/D30/D60/D90. Se persiste al emitir.
- **estadoCartera** (recalculado al emitir factura y al registrar pago, en la misma tx): `BLOQUEADO`
  manual manda; sino `VENCIDO` si hay saldo vencido; sino `AL_DIA`. Helper `recalcularEstadoCartera`
  compartido por facturas y cartera. Núcleo puro `cartera-core` (díasCrédito/saldo/estado/resumen).
- **Backend:** módulo `cartera` (`registrarPago` con validaciones de monto/saldo, `listar` CxC con
  saldo/vencida, `obtenerCliente` con resumen), `GET /cartera`, `POST /cartera/pagos`,
  `GET /cartera/cliente/:id`. Seed: factura vencida (~45 días, impaga) de Minera El Roble.
- **Frontend:** `CarteraApi`, `cartera-list` (resumen saldo total/vencido + tabla con filas vencidas
  resaltadas), `registrar-pago` (drawer, "saldar total"), ruta `/cartera` + ítem en el sidebar.
- **191 tests backend + 141 frontend verdes**; ambos builds limpios.
- **Verificado E2E (API + browser) — loop cerrado:** Minera VENCIDO → despachar OP-9002 sin autorizar
  da `409`; pago total de FAC-1 → saldo $0 → estadoCartera `AL_DIA` → el mismo despacho ahora **pasa**.
  En UI: cartera muestra la vencida resaltada → registrar pago → la CxC desaparece.
- Plan: `docs/plans/2026-06-10-demo10-cartera.md`.
- **Pendiente:** merge a `master` + tag `demo-10`. Abonos a cuenta (no ligados a factura) y un cron
  para recalcular cartera por mero paso del tiempo quedan como futuro.

---

## Demo 9 — Facturación (2026-06-10) ✅ — en `develop`

Cierra el ciclo del pedido: **OC → … → Despacho → Factura**.

- **Precio pactado en la línea de OC** (`OrdenCompraLinea.precioUnitario`, Decimal nullable): se captura
  por producto en el wizard de Nueva OC (paso Curva, input "Precio por par"). El detalle de OC muestra
  precio/subtotal por línea + total.
- **Factura sobre el Despacho** (1 Despacho → 1 Factura). Valoriza lo despachado × precio pactado;
  calcula subtotal + IVA (19% por defecto, configurable) + total. Estados `EMITIDA`/`ANULADA`.
  Consecutivo `factura` vía secuencia PG.
- Backend: módulo `facturas` (núcleo puro `factura-core.ts`, `FacturaService.facturar/listar/obtener`,
  `POST/GET /facturas`). Migración `20260610220440_demo9_facturacion`. Seed demo con precios ($85.000/par).
- Frontend: `FacturasApi`, `facturas-list` + `factura-detalle` (drawer), botón **"Facturar"** en
  `despachos-list` (link a la factura si ya existe), ruta `/facturas` + ítem en el sidebar.
- **174 tests backend + 138 frontend verdes**, ambos builds limpios.
- **Verificado E2E vía API:** despachar OP-9001 → facturar → FAC-1 ($1.530.000 + IVA $290.700 =
  $1.820.700); doble facturación → 400; listado y detalle correctos.
- Plan: `docs/plans/2026-06-10-demo9-facturacion.md`.
- **Pendiente:** merge `develop`→`master` `--no-ff` + tag `demo-9` (al mostrar la demo).
  Retenciones (reteFuente/IVA/ICA) quedan fuera de alcance (futuro).

---


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
- **Navegabilidad (2026-06-04)**: listado **"Órdenes de Producción"** en el menú lateral
  (`features/pedidos/op/op-list.component`, ruta `/pedidos/op`, fila → `/pedidos/op/:id`) +
  **interceptor de errores 401** (`core/interceptors/auth-error.interceptor`): en 401 (salvo
  `/auth/login`) hace logout y redirige a `/login?expired=1`; el login muestra un banner
  `role="alert"` "Tu sesión expiró". Mata el empty-state engañoso al expirar el token.
  Plan: `docs/plans/2026-06-04-navegabilidad-op-list-y-401.md`. Verificado E2E (menú→lista→amarre y
  redirección 401→login con token corrupto).
- 49 tests verdes. `ng build` limpio (budget de estilo por componente subido a 8kB warn / 12kB error
  en `angular.json` para acomodar la pantalla densa de amarre).

- **F6 — Crear OC (wizard) ⭐ — hecho y en master** (2026-06-04): wizard de 4 pasos
  (`features/pedidos/oc/oc-crear.component`, ruta `/pedidos/oc/nueva`, botón "Nueva OC" en el
  listado). Componentes reusables nuevos: `shared/ui/buscador-select` (dropdown con búsqueda por
  signals, genérico) y `shared/ui/talla-grid` (curva editable + `totalCurva`). Lógica pura
  `oc-crear.util.ts` (`tallasDeProducto` por rango de referencia, `construirDto`). Backend: nuevos
  `GET /catalog/productos` (con marca + referencia.tallaMin/Max) y `GET /catalog/tallas`
  (`CatalogService`/`CatalogController`). **Verificado E2E end-to-end**: Nueva OC → wizard → Crear →
  OC BORRADOR → Confirmar → Generar OP → amarre, todo desde la UI sin tocar la API. Plan:
  `docs/plans/2026-06-04-f6-crear-oc-wizard.md`. **64 tests frontend + 62 backend verdes.**

## Flujo de pedidos: COMPLETO ✅

El ciclo OC → OP → amarre es operable de punta a punta desde la UI (crear OC, confirmar, generar OP,
ver amarre por talla/bodega, anular OP). No quedan features del flujo de pedidos pendientes.

Próximos focos posibles (fuera del flujo de pedidos): módulos MES de planta, despacho, factura,
cartera; dashboard con KPIs; deploy del frontend a Railway.

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

# Backend (:3001) — start:dev ya funciona (fix tsBuildInfoFile, 2026-06-13)
cd agro-erp/backend
npm run start:dev    # (o build + start:prod para correr el compilado)
# seeds (si la DB está limpia): npm run seed (usuario admin) ; npm run seed:catalogo ; npm run seed:demo

# Frontend (:4200)
cd agro-erp/frontend
npm start
# login: admin / admin123
```

## Deudas técnicas anotadas (no bloquean, encarar en el camino)
- ~~Backend `npm run start:dev` (nest --watch) crashea ("Cannot find module dist/main").~~
  ✅ RESUELTO (2026-06-13): el `.tsbuildinfo` vivía en la raíz y sobrevivía al `deleteOutDir`
  de nest-cli, así `tsc --incremental` no re-emitía `dist/main.js`. Fix: `tsBuildInfoFile`
  apuntando dentro de `dist/` (tsconfig.json) → se borra junto con `dist/`. Esto arregla
  también el "nest build no emite dist/" (misma raíz). `start:dev` y builds repetidos OK.
- ~~Shell: título del topbar y avatar/usuario hardcodeados.~~ ✅ RESUELTO: el topbar se eliminó
  y el user-card del sidebar lee del JWT (`auth.usuario()`, iniciales + rol mapeado).
- ~~Falta interceptor de errores HTTP global (401 → login)~~ ✅ HECHO (auth-error.interceptor).
- ~~Falta un **sistema de toasts** para otros errores (500, validaciones).~~ ✅ HECHO (2026-06-13):
  `ToastService` + `errorToastInterceptor` global (toastea todo error con el mensaje del backend,
  excluye 401 y login) + `ToasterComponent` en app-root.
- `InventarioApi` sin tipos de retorno (tipar al definir modelos Bodega/InventarioPT).
- Antes del primer deploy del front: crear `environment.prod.ts` + `fileReplacements` en
  `angular.json` con la URL de Railway.
- `ui-drawer` sin focus-trap CDK (mejora de a11y posterior).
- Migración del Módulo 2 (`20260603143757_modulo2_pedidos`) aplicada solo en la DB local;
  para Railway falta `prisma migrate deploy`.
```
