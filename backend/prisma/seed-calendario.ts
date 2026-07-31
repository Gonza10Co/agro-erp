/**
 * Siembra el calendario laboral: la config de días de la semana (si no existe) y
 * los festivos colombianos del año pedido y del siguiente.
 *
 * Sin esto el reporte diario mide la meta contra el mes entero, que el día 3 se ve
 * en 10% aunque la planta vaya perfecta.
 *
 * Correr:  npm run seed:calendario           (año actual y el siguiente)
 *          npm run seed:calendario -- 2027   (un año puntual y el siguiente)
 *
 * Idempotente: los festivos se upsertan por fecha, así que se puede correr las
 * veces que haga falta. NO pisa la config de días de la semana si ya existe — el
 * cliente pudo haber apagado el sábado desde la pantalla.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { festivosColombia } from '../src/reportes/festivos-colombia';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const host = (process.env.DATABASE_URL ?? '').replace(/^.*@/, '').replace(/\?.*$/, '');
  console.log(`Seed calendario — base: ${host}`);

  const base = Number(process.argv[2]) || new Date().getUTCFullYear();
  const anios = [base, base + 1];

  const config = await prisma.calendarioLaboral.findUnique({ where: { id: 1 } });
  if (config) {
    console.log('  · config de días de la semana: ya existe, no se toca');
  } else {
    await prisma.calendarioLaboral.create({ data: { id: 1 } });
    console.log('  · config de días de la semana creada (lun-sáb; el sábado está por confirmar)');
  }

  let creados = 0;
  let actualizados = 0;
  for (const anio of anios) {
    for (const f of festivosColombia(anio)) {
      const fecha = new Date(`${f.fecha}T00:00:00Z`);
      const existente = await prisma.diaNoHabil.findUnique({ where: { fecha } });
      if (existente) {
        await prisma.diaNoHabil.update({ where: { fecha }, data: { motivo: f.motivo } });
        actualizados++;
      } else {
        await prisma.diaNoHabil.create({ data: { fecha, motivo: f.motivo } });
        creados++;
      }
    }
  }

  const total = await prisma.diaNoHabil.count();
  console.log(`  · festivos ${anios.join(' y ')}: ${creados} creados · ${actualizados} actualizados`);
  console.log(`Seed calendario OK ✅ — ${total} días no hábiles en la base`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
