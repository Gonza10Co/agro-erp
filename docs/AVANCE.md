# AVANCE — agro-erp (Botas Agroindustrial · ERP + MES)

> **Única fuente de verdad del avance.** Foto de "hecho vs. falta" de un vistazo.
> Se actualiza al cierre de cada demo. El **git log** manda sobre el detalle fino
> (los commits `feat(...)` son el handoff real); este doc es el mapa ejecutivo.
>
> Última actualización: **2026-06-16** · Stack: Angular 19 + signals · NestJS + Prisma · PostgreSQL
> Deploy: front → Vercel · back → Railway (ver memoria `urls-produccion`).

---

## 📊 Foto del avance

```
   FUNCIONALIDAD (núcleo)        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░  ~90%
   ALCANCE DEL EXCEL DEL DUEÑO   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  ~70%
   DEPLOY / PRODUCCIÓN           ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░  ~45%
   GIT HIGIENE (merges + tags)   ▓▓▓▓▓░░░░░░░░░░░░░░░  ~25%
```

**Tests:** ~263 backend + ~189 frontend, verdes 🟢 · ambos builds limpios.

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

---

## 🔨 EN CURSO

- Nada activo en este momento. La Demo 14 cerró el 2026-06-16 (en `develop`).

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
- [ ] **Definir datos de prod** — ¿semilla demo o datos reales del cliente? (decisión + seed/limpieza).

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
| Frontend (Angular) | Vercel | Auto desde `master` (GitHub) | 🟡 Atrasado (commit setup inicial `985495e`) — falta re-deploy |
| Backend (NestJS) | Railway | Auto desde `master` (GitHub, conectado 2026-06-16) | ✅ Al día hasta Demo 13, DB migrada |
| DB (PostgreSQL) | Railway | Servicio `postgres-ssl:18` | ✅ Activo |

**Hito 2026-06-16:** el servicio `backend` se conectó a `Gonza10Co/agro-erp@master` (antes `source.repo=null`, deploy manual). El primer auto-deploy (commit `a39ebe5c`, Demo 13) aplicó **13 migraciones pendientes** (`migrate deploy` del Dockerfile) y arrancó OK; `POST /auth/login` responde 401 contra la DB. Producción backend pasó de ~Demo 4 (5-jun) a Demo 13.

> ⚠️ **Desbalance vivo:** backend en Demo 13, frontend (Vercel) aún en el setup inicial. Re-desplegar el frontend para igualar antes de mostrar en prod.

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
