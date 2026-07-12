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

**Líneas de producción:** cada par pertenece a una `Linea` (vía `productoConfigurado.marca.linea`) que define su `celulaInicial`. El orden de células es forward-only (`siguienteCelula` en `fabricacion-core.ts`), pero el **punto de arranque varía por línea**: la línea **Feroz** (capellada de Bogotá; hoy solo servicio de inyección) arranca en INYECCIÓN, no en CORTE. La línea EXTERNA del kickoff quedó **desactivada** (cliente 2026-07-06: esos cortes no vuelven; Feroz la reemplaza). `Par.lineaId` se denormaliza al crear el par (reportes `?lineaId`). **El mapeo marca→línea NO es fijo** (cliente 2026-07-06): la línea se decide **por pedido** — implementado 2026-07-12: la OC captura `lineaId` (selector EN_STAGE en el wizard), la OP lo hereda y cada par nace con la línea del pedido; `Marca.lineaId` es solo fallback histórico. El reporte diario acepta `?lineaId` y las metas se segmentan con `Meta.lineaId` (NULL = global). El kardex de bodega PT aún NO distingue línea.

## Workflow

- `develop` = construcción adelantada; `master` = lo mostrado al cliente (merge `--no-ff` + tag `demo-N`).
- TDD: test primero, implementación mínima, commit frecuente. Mensajes de commit y comentarios en español.
- Specs/planes históricos en `docs/superpowers/`.

## Niveles de liberación: la próxima demo nace en EN_STAGE

`frontend/src/app/core/auth/modulos.ts` define `ENTREGADO < EN_STAGE < INTERNO`; cada rol ve
hasta su alcance (`CLIENTE→ENTREGADO`, `STAGE→EN_STAGE`, internos→`INTERNO`). **"Mergear stage a
cliente" no es mergear ramas: es subir el nivel de `EN_STAGE` a `ENTREGADO`.**

Todo lo de la **próxima** demo se construye en `EN_STAGE` y solo sube a `ENTREGADO` **el día que
se muestra** (así los deploys intermedios a `master` no espoilean al cliente). Excepción: si algo
**rompe** al cliente (cambio de modelo, fix de un bug que él ya sufre) va a `ENTREGADO` de una.

> ⚠️ El nivel de MÓDULO no alcanza. Lo nuevo que aterriza dentro de un módulo que el cliente ya
> tiene (`pedidos`, `clientes`, `catalogo`, `maestros`) queda visible apenas se despliega. Gatear
> por **sección** con `puedeVerNivel(rol, 'EN_STAGE')` — como el bloque costo/utilidad de la OC.
> El gating es solo de interfaz: el backend no bloquea esos endpoints.
