import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { describirBase, esBaseDeProduccion } from '../src/prisma/base-url';
import { FAMILIAS_TALLA, planearEtiquetado } from '../src/catalog/material/familia-talla-core';

/**
 * Etiqueta los materiales que existen uno POR TALLA (plantillas PU/EVA/KEVLAR) con su
 * `familiaTalla` y `tallaId`, para que el resolvedor del BOM descuente la plantilla de la
 * talla pedida y no la de la línea del BOM. Idempotente: lo ya etiquetado igual no se toca.
 *
 *   npm run etiquetar:familias-talla                        → DRY-RUN: lista qué etiquetaría
 *   npm run etiquetar:familias-talla -- --ejecutar          → escribe (en una transacción)
 *   npm run etiquetar:familias-talla -- --ejecutar --prod-confirmado   → obligatorio si la base es Railway
 *
 * Regla: nombre "<FAMILIA> [TALLA] <nn>" con FAMILIA en FAMILIAS_TALLA
 * (src/catalog/material/familia-talla-core.ts). Si la talla no existe en la tabla Talla,
 * se reporta y no se etiqueta.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const args = process.argv.slice(2);
  const ejecutarDeVerdad = args.includes('--ejecutar');
  const prodConfirmado = args.includes('--prod-confirmado');
  const prod = esBaseDeProduccion();

  console.log(`Etiquetar familias por talla — base: ${describirBase()}${prod ? '  ⚠ PRODUCCIÓN' : ''}`);
  console.log(ejecutarDeVerdad ? 'Modo: EJECUTAR (escribe)' : 'Modo: dry-run (no escribe nada; agrega --ejecutar para escribir)');
  console.log(`Familias: ${FAMILIAS_TALLA.join(', ')}`);
  if (ejecutarDeVerdad && prod && !prodConfirmado) {
    console.error('✖ La base es producción: para escribir hay que pasar también --prod-confirmado.');
    process.exit(2);
  }

  const [materiales, tallas] = await Promise.all([
    prisma.material.findMany({
      where: { OR: FAMILIAS_TALLA.map((f) => ({ nombreCanonico: { startsWith: f.split(' ')[0], mode: 'insensitive' as const } })) },
      select: { id: true, codigo: true, nombreCanonico: true, familiaTalla: true, tallaId: true },
      orderBy: { codigo: 'asc' },
    }),
    prisma.talla.findMany({ select: { id: true, valor: true } }),
  ]);

  const plan = planearEtiquetado(materiales, tallas);

  console.log(`\nA etiquetar: ${plan.etiquetar.length}`);
  for (const e of plan.etiquetar)
    console.log(`  ${e.codigo.padEnd(10)} ${e.nombre.padEnd(30)} → ${e.familiaTalla} · T${e.talla}`);
  console.log(`Ya etiquetados (sin cambios): ${plan.yaEtiquetados}`);
  if (plan.sinTalla.length) {
    console.log(`⚠ Sin talla en la tabla Talla (NO se etiquetan): ${plan.sinTalla.length}`);
    for (const s of plan.sinTalla) console.log(`  ${s.codigo.padEnd(10)} ${s.nombre} (talla ${s.talla})`);
  }

  if (!ejecutarDeVerdad || plan.etiquetar.length === 0) {
    if (plan.etiquetar.length === 0) console.log('\nNada que etiquetar.');
    return;
  }
  await prisma.$transaction(
    plan.etiquetar.map((e) =>
      prisma.material.update({
        where: { id: e.id },
        data: { familiaTalla: e.familiaTalla, tallaId: e.tallaId },
      }),
    ),
    // Contra Railway por internet, 66 updates pasan de los 5 s por defecto (P2028).
    { timeout: 120_000 },
  );
  console.log(`\n✔ Listo: ${plan.etiquetar.length} materiales etiquetados en una transacción.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
