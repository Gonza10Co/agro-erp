# Demo 11 — Dashboard gerencial (KPIs) · Implementation Plan

> TDD task-by-task. Test primero, implementación mínima, commit frecuente. Comentarios/commits en español.

**Goal:** Una home ejecutiva con los KPIs que resumen TODO el sistema en un vistazo, servidos por
**un solo endpoint agregador** `GET /dashboard` (una llamada, todo calculado en el back).

**KPIs:**
- **Pedidos:** OCs por estado (BORRADOR/CONFIRMADA/EN_PRODUCCION/CERRADA) + en curso (no cerradas/anuladas).
- **Producción/MES:** OFs activas (ABIERTA/EN_PROCESO) + pares EN_PROCESO por célula (CORTE…PT).
- **Despachos del mes** (cantidad).
- **Facturación del mes** (total $ + cantidad).
- **Cartera:** saldo total por cobrar, saldo vencido, # clientes vencidos/bloqueados.

**Arquitectura:** módulo `dashboard` con `DashboardService.resumen()` (queries Prisma:
groupBy/count/aggregate + reutiliza `cartera-core` para saldos). Núcleo puro `dashboard-core`
(`rangoMes(hoy)`). Front: `DashboardApi` + `dashboard.component` (cards), home `/` → dashboard.

---

## Tasks
- [ ] **T1** `dashboard-core.ts(+spec)`: `rangoMes(hoy)` → { desde: 1° del mes, hasta: 1° del mes siguiente }.
- [ ] **T2** `dashboard.service.ts(+spec)`: `resumen()` arma el objeto KPI (prisma mock verifica forma).
- [ ] **T3** `dashboard.controller.ts` (`GET /dashboard`, JwtGuard) + `dashboard.module.ts` + app.module.
- [ ] **T4** Front: modelos `DashboardResumen` + `DashboardApi.resumen()` (+spec HttpTestingController).
- [ ] **T5** Front: `dashboard.component` (cards de KPIs, links a cada módulo) + spec.
- [ ] **T6** Ruta `/` → dashboard (hoy redirige a pedidos/oc) + ítem "Inicio" en el sidebar.
- [ ] **T7** Verificación: tests verdes + build + E2E browser (screenshot).

## Notas
- "Mes" = mes calendario actual (rango [1° mes, 1° mes siguiente)).
- Saldos de cartera reutilizan `saldoFactura`/`resumenCartera` de `cartera-core`.
- `start:dev` backend crashea: build + start:prod (limpiar tsbuildinfo + dist si falta dist/main).
