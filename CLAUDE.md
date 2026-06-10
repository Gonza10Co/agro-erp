# CLAUDE.md — agro-erp

ERP + MES para fabrica de botas de seguridad (make-to-order). Monorepo npm workspaces.

## Comandos

- Backend dev: `npm run dev:back` (NestJS en :3001 — NUNCA :3000, lo usa otro proyecto)
- Frontend dev: `npm run dev:front` (Angular en :4200)
- Tests: `npm test` (raiz) · solo back: `npm run test:back` · solo front: `npm run test:front`
- DB local: Docker `agro-erp-pg` en :5433 (`docker start agro-erp-pg`); el `.env` del backend apunta a local, NO a Railway.
- Migraciones: desde `backend/`, `npx prisma migrate dev`. SIEMPRE migraciones, nunca `db push`.

## Arquitectura

- `backend/src/<modulo>`: controller delgado + service con Prisma + logica pura en archivos `*-core.ts` / utilidades testeables sin BD.
- Consecutivos (OC/OP/OF/Despacho/Requerimiento): SIEMPRE via `siguienteConsecutivo()` de `backend/src/prisma/consecutivo.ts` (secuencias PG). PROHIBIDO el patron `aggregate _max + 1`.
- Amarre de inventario: las lecturas de `InventarioPT` para reservar van precedidas de `SELECT ... FOR UPDATE` dentro de la transaccion.
- Frontend: Angular 19 standalone + signals + control flow nuevo (`@if/@for`), plain CSS con design tokens (tema "Acero"), specs con `HttpTestingController` contra `http://localhost:3001`.

## Dominio (lo minimo)

OC (pedido del cliente) → OP (produccion, amarra stock PT) → OF (corrida de fabricacion) → pares con codigo `OF{n}-{seq}` escaneados por celula (CORTE→GUARNICION→ALMACEN→INYECCION→PT) → InventarioPT → Despacho (regla de cartera: cliente vencido bloquea, autoriza solo GERENTE/ADMIN).

## Workflow

- `develop` = construccion adelantada; `master` = lo mostrado al cliente (merge `--no-ff` + tag `demo-N`).
- TDD: test primero, implementacion minima, commit frecuente. Mensajes de commit y comentarios en espanol.
- Specs/planes historicos en `docs/superpowers/`.
