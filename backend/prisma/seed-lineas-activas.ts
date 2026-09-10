import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Deja activas SOLO las líneas de producción que se pasen por argumento y desactiva las
 * demás. Es el interruptor del arranque en uso real por una sola línea (Basarili primero,
 * 2026-09-07): todo lo que ofrece líneas para elegir (OC, tablero de corte, reporte diario,
 * kardex, factura de servicio) lee `GET /catalog/lineas`, que solo devuelve activas.
 *
 * Correr:  npm run seed:lineas-activas -- BASARILI
 *          npm run seed:lineas-activas -- BASARILI AGRO ALTA FEROZ   (para volver a abrir todas)
 * Sin argumentos no hace nada (nunca desactiva todo por accidente). Idempotente.
 */
async function main() {
  const activas = process.argv.slice(2).map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (activas.length === 0) {
    console.error('Uso: npm run seed:lineas-activas -- CODIGO [CODIGO...]   (p. ej. BASARILI)');
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const existentes = await prisma.linea.findMany({ select: { codigo: true } });
    const desconocidas = activas.filter((c) => !existentes.some((l) => l.codigo === c));
    if (desconocidas.length) throw new Error(`Líneas desconocidas: ${desconocidas.join(', ')}`);

    const on = await prisma.linea.updateMany({ where: { codigo: { in: activas } }, data: { activo: true } });
    const off = await prisma.linea.updateMany({ where: { codigo: { notIn: activas } }, data: { activo: false } });
    console.log(`Líneas activas: ${activas.join(', ')} (${on.count} activadas · ${off.count} desactivadas)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
