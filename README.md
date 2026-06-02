# agro-erp

ERP + MES para Botas Agroindustrial S.A.S. Monorepo: `backend` (NestJS + Prisma) y `frontend` (Angular).

## Desarrollo local
1. `cd backend && npm install` · copiar `.env.example` a `.env` y completar `DATABASE_URL` (Railway) y secrets.
2. `npx prisma migrate dev` · `npm run seed`
3. Backend: `npm run dev:back` (raíz) · Frontend: `npm run dev:front` (raíz)
