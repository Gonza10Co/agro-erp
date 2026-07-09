import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parsearFilasSedes } from '../src/clientes/sedes-import';

/**
 * Carga las sedes de entrega de los clientes desde la plantilla que llena el área
 * comercial del cliente.
 *
 * CSV esperado en `prisma/data/sedes-clientes.csv` con header:
 *   nit,cliente,sede,ciudad,direccion,telefono,principal
 *
 * La llave es `Cliente.nit`. Solo crea sedes de clientes que ya existan; las filas
 * huérfanas se reportan y se omiten (nunca se inventa un cliente).
 *
 * Idempotente: una sede que ya exista (mismo nit + mismo nombre) se actualiza.
 *
 * Correr (local): npm run seed:sedes
 */
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const ruta = join(__dirname, 'data', 'sedes-clientes.csv');
    const csv = readFileSync(ruta, 'utf8');

    const { sedes, errores } = parsearFilasSedes(csv);
    if (errores.length) {
      console.error('El archivo tiene problemas; no se cargó nada:');
      for (const e of errores) console.error(`  - ${e}`);
      process.exit(1);
    }

    let creadas = 0;
    let actualizadas = 0;
    const sinCliente = new Set<string>();

    for (const s of sedes) {
      const cliente = await prisma.cliente.findUnique({ where: { nit: s.nit } });
      if (!cliente) {
        sinCliente.add(s.nit);
        continue;
      }

      const existente = await prisma.sedeCliente.findFirst({
        where: { clienteId: cliente.id, nombre: s.nombre },
      });

      // La principal se escribe al final de la tanda del cliente para no chocar con el
      // índice único parcial mientras la anterior todavía la tiene.
      if (s.esPrincipal)
        await prisma.sedeCliente.updateMany({
          where: { clienteId: cliente.id, esPrincipal: true },
          data: { esPrincipal: false },
        });

      const datos = {
        nombre: s.nombre,
        ciudad: s.ciudad,
        direccion: s.direccion,
        telefono: s.telefono,
        esPrincipal: s.esPrincipal,
        activo: true,
      };

      if (existente) {
        await prisma.sedeCliente.update({ where: { id: existente.id }, data: datos });
        actualizadas++;
      } else {
        await prisma.sedeCliente.create({ data: { clienteId: cliente.id, ...datos } });
        creadas++;
      }
    }

    console.log(
      `Sedes cargadas: ${creadas} creadas · ${actualizadas} actualizadas · ${sinCliente.size} NIT sin cliente en BD`,
    );
    if (sinCliente.size) console.log('NIT sin cliente:', [...sinCliente].join(', '));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
