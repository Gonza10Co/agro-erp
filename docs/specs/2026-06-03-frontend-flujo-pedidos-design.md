# Frontend — Flujo de Pedidos (demo) Design

> Diseño aprobado en brainstorming con Gonza el **2026-06-03**.
> Repo: `agro-erp/frontend` (Angular 19.2, standalone + signals).
> Backend: Módulo 1 (Catálogos/BOM) + Módulo 2 (Pedidos OC→OP→amarre) ya completos.
> Design system: dirección "Acero" (ver `agro-erp/design-ref/`).

## 1. Objetivo y alcance

Construir el **frontend visual del flujo de pedidos** para la primera demo a JP: una SPA
Angular que permita recorrer el ciclo OC → OP → amarre de punta a punta, con el look del
design system "Acero" (claro/oscuro), conectada al backend real.

**Dentro del alcance:**
- App shell (sidebar + topbar) con tema claro/oscuro.
- Pantallas: Clientes (listar/crear), Listado de OC, Crear OC (wizard), Detalle OC,
  Detalle OP con amarre.
- Capa de datos (servicios HTTP + modelos) contra los endpoints existentes.
- Componentes compartidos complejos (combobox, drawer, data-table, talla-grid, amarre-bar).
- Seed de demo en el backend para tener datos jugables.

**Fuera del alcance (fases posteriores):**
- Dashboard con KPIs (requiere endpoints de métricas inexistentes).
- Módulos MES de planta, Despacho, Factura, Cartera.
- Pantallas de Inventario más allá de lo mínimo para la demo.
- Datepicker y multiselect (sin caso de uso en el flujo actual).

## 2. Decisiones de diseño (tomadas en brainstorming)

| Decisión | Elección | Razón |
|----------|----------|-------|
| UI framework | Plain CSS (tokens del design system) + `@angular/cdk` | Fidelidad 100% a "Acero"; CDK aporta a11y/overlay sin estilos Material. |
| Estrategia de componentes | Híbrida | Clases CSS directas para lo simple; componentes Angular solo para lo complejo/con comportamiento. |
| Datos durante el build | Backend real local (:3001) + seed de demo | Ve datos reales, detecta integración temprano; el seed sirve para la demo en vivo. |
| Alcance | Flujo end-to-end (sin Dashboard) | Demo completa del ciclo OC→OP→amarre. |
| Theming | tokens.css global + `[data-theme]` en `<html>` | Dark mode resuelto solo redefiniendo roles; portado tal cual del design system. |

## 3. Estructura de carpetas

```
frontend/src/
  styles.scss                  → @use tokens + components + shell (globales)
  styles/
    tokens.css                 ← copiado de design-ref (fuente de verdad de tokens)
    components.css             ← copiado de design-ref
    shell.css                  ← copiado de design-ref
  app/
    core/
      auth/            (existe: auth.service, auth.guard)
      interceptors/    (existe: jwt.interceptor)
      api/             → servicios HTTP + modelos TS
      theme/           → theme.service (signal + localStorage)
    shared/
      ui/              → componentes complejos (ver §5)
    layout/
      shell/           → shell.component (sidebar + topbar)
    features/
      login/           (existe)
      clientes/        → clientes-list, cliente-form
      pedidos/
        oc/            → oc-list, oc-crear (wizard), oc-detalle
        op/            → op-detalle (amarre)
```

Cada feature es standalone con su routing lazy. Archivos enfocados: un componente por pantalla,
componentes de UI reutilizables en `shared/ui`.

## 4. Capa de datos (core/api)

**Modelos TS** (espejo del backend, en `core/api/models/`):
- `Cliente`, `Bodega`, `ProductoConfigurado`, `Talla`
- `OrdenCompra` (con `lineas[]` → `tallas[]`), `EstadoOC`
- `OrdenProduccion` (con `lineas[]` → `tallas[]` con `cantPedida/cantAmarrada/cantAProducir`
  y `reservas[]` → `inventarioPT.bodega`), `EstadoOP`

**Servicios** (HttpClient + signals, en `core/api/`):
- `ClientesApi`: `listar()`, `crear(dto)`, `obtener(id)` → `/clientes`
- `PedidosApi`:
  - OC: `crearOC(dto)`, `listarOC()`, `obtenerOC(id)`, `confirmarOC(id)` → `/pedidos/oc`
  - OP: `generarOP(ocId)`, `obtenerOP(id)`, `anularOP(id)` → `/pedidos/op`
- `InventarioApi`: `crearBodega(dto)`, `registrarStock(dto)` → `/inventario`
- `CatalogoApi`: lectura de productos configurados/tallas para el wizard (según endpoints
  disponibles; si falta alguno de lectura, se agrega al backend en su fase).

`environment.apiUrl = 'http://localhost:3001'` (ya corregido). El `jwt.interceptor` existente
adjunta el token a todas las llamadas.

## 5. Componentes compartidos (shared/ui)

Solo los complejos o con comportamiento; los simples (btn, badge, input, card, stepper) se usan
como **clases CSS directas** en los templates.

| Componente | Responsabilidad | Base |
|------------|-----------------|------|
| `ui-combobox` | Autocomplete con búsqueda por teclado (cliente, producto, marca) | CDK overlay + listbox; ref `combobox.js` |
| `ui-drawer` | Panel lateral de detalle | CDK overlay + a11y focus trap |
| `ui-data-table` | Tabla densa: sort, paginación, selección | tabla plana + signals (CDK opcional) |
| `ui-talla-grid` | Curva de tallas 33-47 editable por teclado | input grid + signals |
| `ui-amarre-bar` | Barra pedido / en stock / a producir | div + tokens, % calculado |
| `ui-theme-toggle` | Cambiar claro/oscuro | usa `ThemeService` |

`ThemeService` (core/theme): signal `theme` ('light'|'dark'), persiste en localStorage, aplica
`data-theme` en `document.documentElement`.

## 6. Routing

Lazy por feature, bajo el shell protegido por `authGuard` (ya existe).

```
/login                       (existe)
/app   → shell.component + authGuard
   /clientes                 clientes-list (+ cliente-form en drawer)
   /pedidos/oc               oc-list (tabla densa + drawer de detalle)
   /pedidos/oc/nueva         oc-crear (wizard 4 pasos)
   /pedidos/oc/:id           oc-detalle → confirmar / generar OP
   /pedidos/op/:id           op-detalle (amarre) ⭐
   redirect '' → /pedidos/oc
```

## 7. Wizard Crear OC (4 pasos)

```
1. Cliente      → ui-combobox (buscar entre clientes)
2. Productos    → agregar líneas: ui-combobox de ProductoConfigurado
3. Curva tallas → por línea, ui-talla-grid (33-47)
4. Confirmar    → resumen; POST crea la OC en BORRADOR
```
Navegación con stepper (clase CSS). Estado del wizard en un signal local del componente.

## 8. Seed de demo (backend)

Script `prisma/seed-demo.ts` (idempotente con upsert, como `seed-catalogo.ts`):
- 5-6 **Clientes** con NIT, ciudad, `tipoCredito` variados.
- **Bodegas**: Ibagué (PROPIA, prioridad 100), Bogotá (HERMANA, prioridad 200).
- Reusa el catálogo del Módulo 1 (referencias, marcas, productos configurados).
- **Stock PT parcial** por talla, para que el amarre muestre mezcla de "en stock" y "a producir".
- Script `seed:demo` en package.json.

## 9. Testing (Karma/Jasmine, runner del repo)

- **Servicios API**: `HttpTestingController` — verifican URL, método y payload.
- **Componentes complejos**: lógica con signals — combobox filtra, talla-grid suma la curva,
  amarre-bar calcula porcentajes.
- **Smoke** por feature: renderiza sin romper.

## 10. Orden de construcción (fases incrementales)

| Fase | Entrega |
|------|---------|
| F1 Fundaciones | instalar `@angular/cdk`; montar tokens/components/shell en styles; `ThemeService` + toggle; app shell (sidebar+topbar); routing + guard |
| F2 Datos | modelos + servicios API + environment |
| F3 Seed demo | datos para ver todo funcionando |
| F4 Clientes | listar + crear (primer feature completo, valida el stack) |
| F5 Listado OC | tabla densa + detalle OC (confirmar / generar OP) |
| F6 Crear OC | wizard (combobox + talla-grid) |
| F7 OP / Amarre | pantalla estrella ⭐ |

## 11. Riesgos y notas

- **Endpoints de lectura del catálogo**: el wizard necesita listar productos configurados y
  tallas. Si falta algún GET en el backend, se agrega en F6 (extensión menor del Módulo 1).
- **CSS del design system como fuente de verdad**: `tokens/components/shell.css` se copian de
  `design-ref/`. Si el diseño cambia, se re-copian (no se editan a mano salvo ajustes puntuales
  documentados).
- **Deploy**: fuera del alcance de esta entrega; la demo corre local (front :4200 + back :3001).
  El deploy a Railway (front + `migrate deploy`) se planifica aparte.
