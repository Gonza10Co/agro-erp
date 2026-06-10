# agro-erp

ERP + MES para Botas Agroindustrial S.A.S (Ibagué). Monorepo npm workspaces:
`backend/` (NestJS + Prisma + PostgreSQL) y `frontend/` (Angular 19).

## Setup local (primera vez)

1. **Base de datos** — Postgres en Docker, puerto **5433**:
   `docker run -d --name agro-erp-pg -p 5433:5432 -e POSTGRES_PASSWORD=postgres postgres:16`
   (si ya existe: `docker start agro-erp-pg`)
2. **Dependencias**: `npm install` en la raiz (instala ambos workspaces).
3. **Variables**: copiar `backend/.env.example` a `backend/.env` (la `DATABASE_URL` local apunta a `localhost:5433`).
4. **Migraciones + seed**: desde `backend/`: `npx prisma migrate dev` y `npm run seed`.

## Dia a dia

| Comando (raiz)        | Que hace                                   |
|-----------------------|--------------------------------------------|
| `npm run dev:back`    | Backend NestJS en **:3001**                |
| `npm run dev:front`   | Frontend Angular en **:4200**              |
| `npm test`            | Suite completa (back Jest + front Karma)   |
| `npm run build`       | Compila ambos                              |
| `npm run seed`        | Re-seed de la base local                   |

Usuarios seed: `admin/admin123`, `gerente/gerente123`.

## Workflow de ramas

- `develop`: construccion adelantada (varias demos pueden convivir).
- `master`: lo ya mostrado al cliente. Se avanza por demo con merge `--no-ff` + tag `demo-N`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) corre build + tests de backend y frontend
en cada push a `master` o `develop` y en cada pull request.

## Deploy

- **Frontend**: Vercel (config en `frontend/vercel.json`).
- **Backend**: Railway (config en `railway.json`; `.railwayignore` excluye el lockfile por binarios win32 — no tocar sin leer su comentario).

## Gotchas

- El backend NO emite `dist/` si queda un `.tsbuildinfo` viejo: borrar `backend/dist` y el `.tsbuildinfo` y rebuild.
- El puerto 3000 lo usa otro proyecto: este backend SIEMPRE en 3001.
