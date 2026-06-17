import 'dotenv/config';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { leerCsv, num } from './lib/csv';

// Seed de PRODUCCIÓN: carga el catálogo real de Basarili desde CSVs limpios
// exportados del Drive. Es IDEMPOTENTE (upsert por código/valor) — se puede
// recorrer varias veces sin duplicar. NO carga clientes/proveedores/precios:
// esa data comercial se captura por el ABM (decisión de alcance).
//
// Coloca los CSVs en prisma/data/basarili/ (NO se commitean: son datos sensibles).
// El formato está documentado en los archivos *.example.csv de esa carpeta.

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const DIR = join(__dirname, 'data', 'basarili');
const ruta = (f: string) => join(DIR, f);

async function main() {
  console.log('Seed Basarili — cargando catálogo real desde', DIR);

  // 1. Tallas (valor, orden)
  const tallaPorValor = new Map<number, number>();
  for (const f of leerCsv(ruta('tallas.csv'))) {
    const valor = Number(f.valor);
    const t = await prisma.talla.upsert({
      where: { valor }, update: {}, create: { valor, orden: num(f.orden) ?? valor },
    });
    tallaPorValor.set(valor, t.id);
  }
  console.log(`  · tallas: ${tallaPorValor.size}`);

  // 2. Unidades de medida (codigo, nombre)
  const unidadPorCodigo = new Map<string, number>();
  for (const f of leerCsv(ruta('unidades.csv'))) {
    const u = await prisma.unidadMedida.upsert({
      where: { codigo: f.codigo }, update: { nombre: f.nombre }, create: { codigo: f.codigo, nombre: f.nombre },
    });
    unidadPorCodigo.set(f.codigo, u.id);
  }
  console.log(`  · unidades: ${unidadPorCodigo.size}`);

  // 3. Categorías de material (nombre)
  const categoriaPorNombre = new Map<string, number>();
  for (const f of leerCsv(ruta('categorias.csv'))) {
    const c = await prisma.categoriaMaterial.upsert({
      where: { nombre: f.nombre }, update: {}, create: { nombre: f.nombre },
    });
    categoriaPorNombre.set(f.nombre, c.id);
  }
  console.log(`  · categorías: ${categoriaPorNombre.size}`);

  // 4. Marcas (codigo, nombre, tipo)
  let marcas = 0;
  for (const f of leerCsv(ruta('marcas.csv'))) {
    const tipo = (f.tipo || 'PROPIA').toUpperCase() === 'MAQUILA' ? 'MAQUILA' : 'PROPIA';
    await prisma.marca.upsert({
      where: { codigo: f.codigo }, update: { nombre: f.nombre, tipo }, create: { codigo: f.codigo, nombre: f.nombre, tipo },
    });
    marcas++;
  }
  console.log(`  · marcas: ${marcas}`);

  // 5. Materiales (codigo, nombreCanonico, categoria, unidad, origen, claseBom, alias)
  const materialPorCodigo = new Map<string, number>();
  let materiales = 0, aliases = 0;
  for (const f of leerCsv(ruta('materiales.csv'))) {
    const categoriaId = categoriaPorNombre.get(f.categoria);
    const unidadMedidaId = unidadPorCodigo.get(f.unidad);
    if (!categoriaId || !unidadMedidaId) {
      console.warn(`  · material ${f.codigo}: categoría/unidad desconocida (${f.categoria}/${f.unidad}), omitido`);
      continue;
    }
    const origen = (f.origen || 'COMPRADO').toUpperCase() === 'FABRICADO' ? 'FABRICADO' : 'COMPRADO';
    const claseBom = ['DIRECTO_CURVA', 'DIRECTO_FIJO', 'INDIRECTO'].includes((f.claseBom || '').toUpperCase())
      ? (f.claseBom.toUpperCase() as 'DIRECTO_CURVA' | 'DIRECTO_FIJO' | 'INDIRECTO')
      : 'DIRECTO_FIJO';
    const m = await prisma.material.upsert({
      where: { codigo: f.codigo },
      update: { nombreCanonico: f.nombreCanonico, categoriaId, unidadMedidaId, origen, claseBom },
      create: { codigo: f.codigo, nombreCanonico: f.nombreCanonico, categoriaId, unidadMedidaId, origen, claseBom },
    });
    materialPorCodigo.set(f.codigo, m.id);
    materiales++;
    // Alias separados por ';' (textos legados del Drive → material canónico)
    for (const alias of (f.alias || '').split(';').map((a) => a.trim()).filter(Boolean)) {
      await prisma.materialAlias.upsert({
        where: { materialId_textoLegacy: { materialId: m.id, textoLegacy: alias } },
        update: {}, create: { materialId: m.id, textoLegacy: alias },
      });
      aliases++;
    }
  }
  console.log(`  · materiales: ${materiales} (alias: ${aliases})`);

  // 6. Referencias (codigo, nombreInterno, tallaMin, tallaMax)
  const referenciaPorCodigo = new Map<string, number>();
  for (const f of leerCsv(ruta('referencias.csv'))) {
    const tallaMinId = tallaPorValor.get(Number(f.tallaMin));
    const tallaMaxId = tallaPorValor.get(Number(f.tallaMax));
    if (!tallaMinId || !tallaMaxId) {
      console.warn(`  · referencia ${f.codigo}: talla min/max desconocida, omitida`);
      continue;
    }
    const r = await prisma.referencia.upsert({
      where: { codigo: f.codigo },
      update: { nombreInterno: f.nombreInterno, tallaMinId, tallaMaxId },
      create: { codigo: f.codigo, nombreInterno: f.nombreInterno, tallaMinId, tallaMaxId },
    });
    referenciaPorCodigo.set(f.codigo, r.id);
  }
  console.log(`  · referencias: ${referenciaPorCodigo.size}`);

  // 7. BOMs por referencia: líneas FIJO + líneas CURVA (agrupadas por material).
  // Idempotencia: se toma/crea el BOM activo y se recrean sus líneas.
  const fijos = leerCsv(ruta('bom-fijo.csv'));      // referencia, material, consumoFijo, mermaPct
  const curvas = leerCsv(ruta('bom-curva.csv'));    // referencia, material, talla, consumo

  const refsConBom = new Set<string>([...fijos, ...curvas].map((f) => f.referencia));
  let bomsCargados = 0;
  for (const refCod of refsConBom) {
    const referenciaId = referenciaPorCodigo.get(refCod);
    if (!referenciaId) { console.warn(`  · BOM ${refCod}: referencia inexistente, omitido`); continue; }

    const bom =
      (await prisma.bom.findFirst({ where: { referenciaId, activo: true } })) ??
      (await prisma.bom.create({ data: { referenciaId } }));
    await prisma.bomLineaTalla.deleteMany({ where: { bomLinea: { bomId: bom.id } } });
    await prisma.bomLinea.deleteMany({ where: { bomId: bom.id } });

    for (const f of fijos.filter((x) => x.referencia === refCod)) {
      const materialId = materialPorCodigo.get(f.material);
      if (!materialId) { console.warn(`  · BOM ${refCod}: material ${f.material} desconocido`); continue; }
      await prisma.bomLinea.create({
        data: { bomId: bom.id, materialId, claseConsumo: 'FIJO', consumoFijo: num(f.consumoFijo) ?? 0, mermaPct: num(f.mermaPct) },
      });
    }

    // Curvas: agrupar por material → una línea CURVA con sus tallas.
    const porMaterial = new Map<string, { talla: number; consumo: number }[]>();
    for (const c of curvas.filter((x) => x.referencia === refCod)) {
      const arr = porMaterial.get(c.material) ?? [];
      arr.push({ talla: Number(c.talla), consumo: num(c.consumo) ?? 0 });
      porMaterial.set(c.material, arr);
    }
    for (const [matCod, puntos] of porMaterial) {
      const materialId = materialPorCodigo.get(matCod);
      if (!materialId) { console.warn(`  · BOM ${refCod}: material ${matCod} desconocido`); continue; }
      const linea = await prisma.bomLinea.create({
        data: { bomId: bom.id, materialId, claseConsumo: 'CURVA' },
      });
      for (const p of puntos) {
        const tallaId = tallaPorValor.get(p.talla);
        if (!tallaId) continue;
        await prisma.bomLineaTalla.create({ data: { bomLineaId: linea.id, tallaId, consumo: p.consumo } });
      }
    }
    bomsCargados++;
  }
  console.log(`  · BOMs: ${bomsCargados}`);
  console.log('Seed Basarili OK ✅');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
