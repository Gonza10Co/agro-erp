# CLAUDE.md — agro-erp

ERP + MES para fábrica de botas de seguridad (make-to-order). Monorepo npm workspaces.

## Comandos

- Backend dev: `npm run dev:back` (NestJS en :3001 — NUNCA :3000, lo usa otro proyecto)
- Frontend dev: `npm run dev:front` (Angular en :4200)
- Tests: `npm test` (raíz) · solo back: `npm run test:back` · solo front: `npm run test:front`
- DB local: Docker `agro-erp-pg` en :5433 (`docker start agro-erp-pg`); el `.env` del backend apunta a local, NO a Railway.
- Migraciones: desde `backend/`, `npx prisma migrate dev`. SIEMPRE migraciones, nunca `db push`.

## Arquitectura

- `backend/src/<modulo>`: controller delgado + service con Prisma + lógica pura en archivos `*-core.ts` / utilidades testeables sin BD.
- Consecutivos (OC/OP/OF/Despacho/Requerimiento): SIEMPRE vía `siguienteConsecutivo()` de `backend/src/prisma/consecutivo.ts` (secuencias PG). PROHIBIDO el patrón `aggregate _max + 1`.
- Amarre de inventario: las lecturas de `InventarioPT` para reservar van precedidas de `SELECT ... FOR UPDATE` dentro de la transacción.
- Frontend: Angular 19 standalone + signals + control flow nuevo (`@if/@for`), plain CSS con design tokens (tema "Acero"), specs con `HttpTestingController` contra `http://localhost:3001`.

## Dominio (lo mínimo)

OC (pedido del cliente) → OP (producción, amarra stock PT) → OF (corrida de fabricación) → pares con código `OF{n}-{seq}` escaneados por célula (CORTE→GUARNICION→ALMACEN→INYECCION→PT) → InventarioPT → Despacho (regla de cartera: cliente vencido bloquea, autoriza solo GERENTE/ADMIN).

## Workflow

- `develop` = construcción adelantada; `master` = lo mostrado al cliente (merge `--no-ff` + tag `demo-N`).
- TDD: test primero, implementación mínima, commit frecuente. Mensajes de commit y comentarios en español.
- Specs/planes históricos en `docs/superpowers/`.
