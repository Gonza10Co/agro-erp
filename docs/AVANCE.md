# AVANCE — agro-erp (Botas Agroindustrial · ERP + MES)

> **Única fuente de verdad del avance.** Foto de "hecho vs. falta" de un vistazo.
> Se actualiza al cierre de cada demo. El **git log** manda sobre el detalle fino
> (los commits `feat(...)` son el handoff real); este doc es el mapa ejecutivo.
>
> Última actualización: **2026-06-17** · Stack: Angular 19 + signals · NestJS + Prisma · PostgreSQL
> Deploy: front → Vercel · back → Railway (ver memoria `urls-produccion`).

---

## 📊 Foto del avance

```
   FUNCIONALIDAD (núcleo)        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░  ~90%
   ALCANCE DEL EXCEL DEL DUEÑO   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  ~70%
   DEPLOY / PRODUCCIÓN           ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░  ~45%
   GIT HIGIENE (merges + tags)   ▓▓▓▓▓░░░░░░░░░░░░░░░  ~25%
```

**Tests:** ~320 backend + ~247 frontend (+13 e2e), verdes 🟢 · ambos builds limpios.

---

## ✅ HECHO (verificado E2E)

Cada demo está implementada con TDD y verificada de punta a punta (API + browser).

| Demo | Módulo / Entrega | Estado funcional |
|------|------------------|------------------|
| 1 | **Flujo de pedidos** — auth/roles, clientes, wizard "Nueva OC" (4 pasos), OP automática, amarre de inventario por talla/bodega, anular | ✅ |
| 2 | **Catálogos + BOM** — referencias, marcas, tallas, materiales, productos, resolvedor BOM multinivel | ✅ |
| 5–6 | **MES / trazabilidad** — código por par, escaneo por célula (Corte→Guarnición→Almacén→Inyección→PT), timeline | ✅ |
| 7 | **Detalle fino de Guarnición** — 9 sub-pasos (Área…Strobel…Amarre), kanban | ✅ |
| 7 | **Calidad** — daños/reprocesos tipificados, imputación a centro de costo | ✅ |
| 8 | **Indicadores de eficiencia** — tiempo por etapa, operario/máquina, alertas de demora | ✅ |
| 9 | **Facturación** — factura sobre despacho, precio pactado en OC + IVA | ✅ |
| 10 | **Cartera / CxC** — vencimientos, pagos, estadoCartera dinámico, bloqueo de despacho | ✅ |
| 11 | **Dashboard gerencial** — KPIs agregados de todo el sistema | ✅ |
| 12 | **Inventario consolidado + kardex MP** — movimientos, kardex, hooks en producción/despacho | ✅ |
| 13 | **Compras lado proveedor** — OCP por proveedor, recepción parcial (backorder), devolución a proveedor | ✅ |
| 14 | **Reporte Diario Gerencial** — replica el Excel del dueño: producción por célula/día, acumulado, metas vs. real con %, kardex PT | ✅ |

### 🏭 Bloque "Núcleo Real" (2026-06-17) — de demo a producto usable con data real

Paquete para que el cliente **opere con su catálogo real**. Todo en `develop`, TDD, 7 commits.

| Fase | Entrega | Estado |
|------|---------|--------|
| 0 | **Seguridad backend** — `RolesGuard` activo; escritura de maestros solo ADMIN/GERENTE (el gating dejó de ser solo de UI) | ✅ |
| 1 | **Versionado de BOM** — índice único parcial (un BOM activo por ref) + editor de BOM con curva de tallas y drawer | ✅ |
| 2 | **ABM de catálogo** — marcas, materiales (+alias), referencias, grupos/opciones (back + 4 pantallas, menú Maestros) | ✅ |
| 3 | **Clientes editable + Proveedores** — PATCH/desactivar clientes; módulo Proveedores nuevo | ✅ |
| 4 | **ProductoConfigurado real** — crear producto desde el configurador (valida ejes/marca), habilita OCs reales | ✅ |
| 5 | **Carga de data real del Drive** — cargador `seed-basarili` + ETL del Drive: 110 marcas · 319 materiales · 5 referencias · 5 BOMs | ✅ |
| 6 | **Editar OC en BORRADOR** — ajustar cantidades/precios antes de confirmar (inline en oc-detalle) | ✅ |

> ⚠️ **Consumos de BOM:** el MRP del Drive no traía cantidades → los 5 BOMs se cargaron con
> consumo placeholder (1). Los consumos reales se capturan en el **editor de BOM** (fase 1).

---

## 🔨 EN CURSO

- Nada activo. El bloque "Núcleo Real" (fases 0-6) cerró el 2026-06-17 (en `develop`).

---

## ⏳ FALTA (backlog priorizado)

### 1) Modelado de negocio — conceptos del Excel aún sin modelar
- [ ] **EXTERNO / tercerización** — hoy la columna va en 0 con nota "pendiente de captura".
- [ ] **SEGUNDAS** — categoría de calidad vendible; no existe en el modelo.
- [ ] **SERVICIOS / MANTENIMIENTO** — línea de ingreso aparte, no modelada.
- [ ] **Metas por célula** — el Reporte usa metas mensuales por tipo; falta el desglose por célula.

> ⚠️ Estos tres conceptos hay que **definirlos con el cliente** antes de modelar.

### 2) Deploy a producción
- [x] **Conectar el servicio `backend` de Railway a GitHub (branch `master`)** ✅ 2026-06-16 — backend auto-despliega desde `master` e igual que Vercel; el primer deploy aplicó las 13 migraciones pendientes (DB al día).
- [ ] **Re-desplegar el frontend (Vercel)** — quedó atrás del backend (commit setup inicial). Redeploy en Vercel o push a `master`.
- [x] **Datos de prod definidos** ✅ 2026-06-17 — catálogo real del cliente cargado en local vía `seed:basarili` (CSVs del Drive). En prod se corre el seed **una vez** contra Railway.
- [ ] **Capturar consumos de BOM** — los 5 BOMs reales están con placeholder; el cliente carga los consumos por talla en el editor de BOM.
- [ ] **ABM de usuarios** (diferido) — hoy operan con usuarios sembrados; falta pantalla para que el cliente cree sus operarios/gerentes.

### 3) Git — `develop` muy adelantado vs `master`
- [ ] Tags presentes: **solo `demo-1` y `demo-13`**. Faltan/verificar: `demo-9`, `demo-10`, `demo-11`, `demo-12`, `demo-14`.
- [ ] Varias demos sin merge `--no-ff` confirmado a `master`. Poner al día merges + tags.

### 4) Deudas técnicas menores (anotadas, no bloquean)
- [ ] `op-detalle` muestra flash de skeleton al recargar tras Anular.
- [ ] Anular OP es destructivo y no pide confirmación (validar con cliente).
- [ ] `ui-drawer` focus-trap → ✅ resuelto · `InventarioApi` tipado → ✅ resuelto.
- [ ] Futuros anotados: precio en línea de OCP (costos de compra), nota crédito proveedor (Gálago), anulación de OCP, abonos a cuenta no ligados a factura, cron de recálculo de cartera, retenciones (reteFuente/IVA/ICA).

---

## 🚀 PRODUCCIÓN

**Flujo de deploy real** (verificado 2026-06-16):

```
   merge demo-N → master
        ├──► Vercel (frontend)  ✅ AUTO-DEPLOY desde master (conectado a GitHub)
        └──► Railway (backend)  ✅ AUTO-DEPLOY desde master (conectado 2026-06-16 vía MCP)
```

| Servicio | Plataforma | Deploy | Estado |
|----------|-----------|--------|--------|
| Frontend (Angular) | Vercel | Auto desde `master` (GitHub, conectado 2026-06-16) | ✅ Al día, con gating por rol |
| Backend (NestJS) | Railway | Auto desde `master` (GitHub, conectado 2026-06-16) | ✅ Al día, DB migrada |
| DB (PostgreSQL) | Railway | Servicio `postgres-ssl:18` | ✅ Activo |

**Hito 2026-06-16 — CI/CD integrado:** ambos servicios auto-despliegan desde `master`.
- **Backend:** conectado a `Gonza10Co/agro-erp@master` vía Railway MCP (antes `source.repo=null`). El `Dockerfile` corre `migrate deploy` al arrancar → cada deploy aplica migraciones solo.
- **Frontend:** conectado a GitHub vía `vercel git connect` (antes era deploy manual por CLI). Root Directory = `frontend/`.
- **Gating por rol en prod:** usuario `cliente`/`botas2026` (rol CLIENTE) ve solo demos 1-2; `admin`/`admin123` (ADMIN) ve todo. Verificado: login de ambos responde con su rol. Credenciales en memoria `credenciales-demo-prod`.

- **URLs y logins demo:** ver memoria `urls-produccion`.
- **Backend Railway:** proyecto `agro-erp` (renombrado el 2026-06-16, antes `considerate-compassion`), servicio `backend`, dominio `backend-production-a89d.up.railway.app`. El CORS se autoriza por env var `CORS_ORIGINS` (no commiteada).
- **Migraciones:** el `Dockerfile` corre `npx prisma migrate deploy` al arrancar → cada deploy del backend aplica las migraciones pendientes (idempotente). No hay paso manual.
- **Para subir una demo a prod operable:** (1) `master` al día hasta esa demo, (2) backend conectado a `master` o `railway up` a mano, (3) el deploy aplica migraciones solo.

---

## ▶️ Cómo correr local

```bash
# DB (Docker): contenedor agro-erp-pg en localhost:5433
docker start agro-erp-pg

# Backend (:3001) — NUNCA :3000
cd agro-erp/backend
npm run start:dev
# seeds (si la DB está limpia):
#   npm run seed          # usuario admin / admin123
#   npm run seed:catalogo
#   npm run seed:demo

# Frontend (:4200)
cd agro-erp/frontend
npm start
# login: admin / admin123
```

Más comandos y convenciones en `agro-erp/CLAUDE.md`. Planes por demo en `agro-erp/docs/plans/`.
