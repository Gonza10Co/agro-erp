import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Catálogo del despiece de la bota. Sale de la hoja CONSUMOSXREFERENCIA del Excel
 * "CONTROL_PRODUCCIÓN_AGROINDUSTRIAL" del cliente: ahí cada material se lista por la pieza
 * a la que va (la micropiel de la capellada consume distinto que la del talón).
 *
 * `orden` sigue el recorrido natural del corte, de la puntera hacia atrás y de afuera
 * hacia adentro; solo afecta cómo se listan.
 *
 * Idempotente por `codigo`. Correr: npm run seed:piezas
 */
const PIEZAS: { codigo: string; nombre: string; orden: number }[] = [
  { codigo: 'CAPELLADA', nombre: 'Capellada', orden: 10 },
  { codigo: 'EMPEINE', nombre: 'Empeine', orden: 20 },
  { codigo: 'LATERAL', nombre: 'Lateral', orden: 30 },
  { codigo: 'SOPORTE_LATERAL', nombre: 'Soporte lateral', orden: 40 },
  { codigo: 'TALON', nombre: 'Talón', orden: 50 },
  { codigo: 'BOTELLA', nombre: 'Botella', orden: 60 },
  { codigo: 'CANA', nombre: 'Caña', orden: 70 },
  { codigo: 'FUELLE', nombre: 'Fuelle', orden: 80 },
  { codigo: 'CUELLO', nombre: 'Cuello', orden: 90 },
  { codigo: 'LENGUA', nombre: 'Lengua', orden: 100 },
  { codigo: 'VISTA', nombre: 'Vista', orden: 110 },
  { codigo: 'CHAPETA', nombre: 'Chapeta', orden: 120 },
  { codigo: 'CORDONERA', nombre: 'Cordonera', orden: 130 },
  { codigo: 'PLANTILLA', nombre: 'Plantilla', orden: 140 },
  { codigo: 'ECONOMIZADOR', nombre: 'Economizador', orden: 150 },
];

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    let creadas = 0;
    let actualizadas = 0;
    for (const p of PIEZAS) {
      const existe = await prisma.pieza.findUnique({ where: { codigo: p.codigo } });
      if (existe) {
        await prisma.pieza.update({
          where: { codigo: p.codigo },
          data: { nombre: p.nombre, orden: p.orden, activo: true },
        });
        actualizadas++;
      } else {
        await prisma.pieza.create({ data: p });
        creadas++;
      }
    }
    console.log(`Piezas del despiece: ${creadas} creadas · ${actualizadas} actualizadas`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
