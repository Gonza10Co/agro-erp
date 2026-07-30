/**
 * Carga la cartera de clientes reales desde el CSV que sale de la plantilla que
 * llena el área comercial del cliente (la misma de donde salen las sedes).
 *
 * CSV esperado en `prisma/data/clientes.csv` con header:
 *   nit,nombre,ciudad
 *
 * Existe porque `seed:sedes` **nunca inventa un cliente**: solo carga sedes de los
 * que ya están en la base. Este seed va antes, y después el de sedes.
 *
 * Condición comercial: todos entran **CONTADO y sin cupo** (el default del modelo).
 * La plantilla de sedes no trae crédito ni cupo, y darle crédito a alguien que nadie
 * autorizó haría que la regla de cartera dejara pasar despachos que debía frenar.
 * El cliente los ajusta uno por uno desde el ABM.
 *
 * Idempotente: si el NIT ya existe se actualiza nombre y ciudad, y **no se toca su
 * condición comercial** — para no pisarle a un cliente el cupo que ya le dieron.
 *
 * Correr:  npm run seed:clientes
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parsearLineaCSV } from '../src/clientes/sedes-import';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const host = (process.env.DATABASE_URL ?? '').replace(/^.*@/, '').replace(/\?.*$/, '');
  console.log(`Seed clientes — base: ${host}`);

  const csv = readFileSync(join(__dirname, 'data', 'clientes.csv'), 'utf8');
  const lineas = csv.trim().split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = parsearLineaCSV(lineas[0]).map((h) => h.toLowerCase());
  const idx = {
    nit: header.indexOf('nit'),
    nombre: header.indexOf('nombre'),
    ciudad: header.indexOf('ciudad'),
  };
  if (idx.nit < 0 || idx.nombre < 0) {
    console.error('El CSV debe tener al menos las columnas nit y nombre');
    process.exit(1);
  }

  // Se valida todo antes de escribir: media cartera cargada es peor que ninguna.
  const filas: { nit: string; nombre: string; ciudad: string | null }[] = [];
  const errores: string[] = [];
  const vistos = new Set<string>();
  lineas.slice(1).forEach((l, i) => {
    const c = parsearLineaCSV(l);
    const nit = (c[idx.nit] ?? '').trim();
    const nombre = (c[idx.nombre] ?? '').trim();
    const ciudad = (c[idx.ciudad] ?? '').trim();
    const fila = i + 2;
    if (!nit) return errores.push(`Fila ${fila}: falta el NIT`);
    if (!nombre) return errores.push(`Fila ${fila}: falta el nombre`);
    if (nit.includes('E+'))
      return errores.push(`Fila ${fila}: el NIT "${nit}" quedó en notación científica; formatea la columna como Texto`);
    if (vistos.has(nit)) return errores.push(`Fila ${fila}: el NIT ${nit} está repetido`);
    vistos.add(nit);
    filas.push({ nit, nombre, ciudad: ciudad || null });
  });

  if (errores.length) {
    console.error('El archivo tiene problemas; no se cargó nada:');
    errores.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  let creados = 0;
  let actualizados = 0;
  for (const f of filas) {
    const existente = await prisma.cliente.findUnique({ where: { nit: f.nit } });
    if (existente) {
      // Ojo: no se tocan tipoCredito ni cupo — pueden haberse ajustado a mano.
      await prisma.cliente.update({
        where: { nit: f.nit },
        data: { nombre: f.nombre, ciudad: f.ciudad },
      });
      actualizados++;
    } else {
      await prisma.cliente.create({
        data: { nit: f.nit, nombre: f.nombre, ciudad: f.ciudad },
      });
      creados++;
    }
  }

  const total = await prisma.cliente.count();
  console.log(`  · creados: ${creados} · actualizados: ${actualizados}`);
  console.log(`Seed clientes OK ✅ — ${total} clientes en la base`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
