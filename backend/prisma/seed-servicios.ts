/**
 * Catálogo de servicios facturables (ServicioCatalogo).
 *
 * Existe aparte de `seed-demo` porque el catálogo hay que sembrarlo en PRODUCCIÓN
 * y `seed-demo` no sirve para eso: borra las facturas de tipo SERVICIO sin filtrar
 * por sus propios datos de demo (`seed-demo.ts`, "limpieza"), además de rehacer
 * pedidos, despachos y producción. Este seed solo hace upserts: no borra nada.
 *
 * Uso:  npm run seed:servicios          (usa DATABASE_URL del entorno)
 *
 * `precioBase` solo prellena el campo en la pantalla de facturación; el valor
 * definitivo lo digita quien factura.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SERVICIOS = [
  {
    codigo: 'INY-CAPELLADA',
    nombre: 'Inyección de suela a capellada de tercero',
    unidad: 'PAR',
    precioBase: 4200,
  },
  {
    codigo: 'MANT-INYECTORA',
    nombre: 'Mantenimiento de inyectora',
    unidad: 'SERVICIO',
    precioBase: 350000,
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  // Se imprime solo el host: la contraseña no debe quedar en el log de la consola.
  const host = url.replace(/^.*@/, '').replace(/\?.*$/, '') || '(sin DATABASE_URL)';
  console.log(`Seed servicios — base: ${host}`);

  for (const s of SERVICIOS) {
    const { codigo, ...datos } = s;
    const antes = await prisma.servicioCatalogo.findUnique({ where: { codigo } });
    await prisma.servicioCatalogo.upsert({
      where: { codigo },
      update: datos,
      create: { codigo, ...datos },
    });
    console.log(`  · ${codigo} ${antes ? 'actualizado' : 'creado'} — ${s.nombre}`);
  }

  const total = await prisma.servicioCatalogo.count();
  console.log(`Seed servicios OK ✅ — ${total} servicios en el catálogo`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
