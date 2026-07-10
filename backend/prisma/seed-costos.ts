import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Siembra `Material.costoBase` desde el maestro de costos del cliente (columna
 * $UNITARIO de la hoja INVENTARIO del Google Sheet "CONTROL MATERIA PRIMA E INSUMOS").
 *
 * CSV esperado en `prisma/data/material-costos.csv` con header `codigo,costoBase`.
 * Solo ACTUALIZA materiales existentes (no crea): la llave es `Material.codigo`.
 *
 * Los materiales que quedan en $0 son **muestras** y no se costean (el cliente lo confirmó
 * el 2026-07-09): ARTECLEAN DS 102, cera de abejas, MB-11 marrón, pigmento blanco azulín y
 * PU CS blanco. Las plantillas EVA (T34-46), que también venían en $0, valen $282 el par.
 *
 * Correr (local): npm run seed:costos
 * Correr (prod):  ver método de carga quirúrgica en la memoria de inventarios.
 */
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const ruta = join(__dirname, 'data', 'material-costos.csv');
    const csv = readFileSync(ruta, 'utf8');
    const filas = csv.trim().split(/\r?\n/).slice(1); // salta el header

    let actualizados = 0;
    let sinCosto = 0;
    const sinMaterial: string[] = [];

    for (const fila of filas) {
      const [codigoRaw, costoRaw] = fila.split(',');
      const codigo = codigoRaw?.trim();
      const costo = Number(costoRaw);
      if (!codigo) continue;
      if (!Number.isFinite(costo) || costo <= 0) {
        sinCosto++;
        continue;
      }
      const res = await prisma.material.updateMany({
        where: { codigo },
        data: { costoBase: costo },
      });
      if (res.count > 0) actualizados++;
      else sinMaterial.push(codigo);
    }

    console.log(
      `Costos sembrados: ${actualizados} materiales · ${sinCosto} en $0 (omitidos) · ${sinMaterial.length} sin material en BD`,
    );
    if (sinMaterial.length) console.log('Sin match:', sinMaterial.join(', '));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
