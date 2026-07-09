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

  // 3b. Líneas de producción (Basarili, Agro, Alta, Feroz). Datos maestros fijos.
  // Feroz (capellada de Bogotá; hoy solo se le presta servicio de inyección)
  // arranca en INYECCION; las demás en CORTE. La línea de un pedido la decide
  // el cliente al pedir (una misma marca puede fabricarse por cualquier línea).
  const lineas: Array<{ codigo: string; nombre: string; celulaInicial: 'CORTE' | 'INYECCION' }> = [
    { codigo: 'BASARILI', nombre: 'Basarili', celulaInicial: 'CORTE' },
    { codigo: 'AGRO', nombre: 'Agro', celulaInicial: 'CORTE' },
    { codigo: 'ALTA', nombre: 'Alta', celulaInicial: 'CORTE' },
    { codigo: 'FEROZ', nombre: 'Feroz', celulaInicial: 'INYECCION' },
  ];
  for (const l of lineas) {
    await prisma.linea.upsert({
      where: { codigo: l.codigo },
      update: { nombre: l.nombre, celulaInicial: l.celulaInicial, activo: true },
      create: l,
    });
  }
  // La línea EXTERNA del kickoff murió (cliente, 2026-07-06): esos cortes no
  // vuelven y Feroz la reemplaza. En bases que ya la tienen queda desactivada.
  await prisma.linea.updateMany({ where: { codigo: 'EXTERNA' }, data: { activo: false } });
  console.log(`  · líneas: ${lineas.length} (+EXTERNA desactivada si existía)`);

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

  // 7. BOMs por referencia: líneas FIJO + líneas CURVA (agrupadas por material Y PIEZA).
  // Idempotencia: se toma/crea el BOM activo y se recrean sus líneas.
  const fijos = leerCsv(ruta('bom-fijo.csv'));      // referencia, material, consumoFijo, mermaPct
  const curvas = leerCsv(ruta('bom-curva.csv'));    // referencia, material, pieza, talla, consumo

  // El despiece: un mismo material puede ir en varias piezas con consumos distintos.
  const piezaPorCodigo = new Map<string, number>();
  for (const p of await prisma.pieza.findMany()) piezaPorCodigo.set(p.codigo, p.id);

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

    // Curvas: agrupar por (material, pieza) → una línea CURVA por pieza, con sus tallas.
    // Agrupar solo por material fundiría la micropiel de la capellada con la del talón.
    const porMaterialPieza = new Map<string, { talla: number; consumo: number }[]>();
    for (const c of curvas.filter((x) => x.referencia === refCod)) {
      const clave = `${c.material}|${c.pieza ?? ''}`;
      const arr = porMaterialPieza.get(clave) ?? [];
      arr.push({ talla: Number(c.talla), consumo: num(c.consumo) ?? 0 });
      porMaterialPieza.set(clave, arr);
    }
    for (const [clave, puntos] of porMaterialPieza) {
      const [matCod, piezaCod] = clave.split('|');
      const materialId = materialPorCodigo.get(matCod);
      if (!materialId) { console.warn(`  · BOM ${refCod}: material ${matCod} desconocido`); continue; }
      if (piezaCod && !piezaPorCodigo.has(piezaCod)) {
        console.warn(`  · BOM ${refCod}: pieza ${piezaCod} desconocida (corre seed:piezas)`);
        continue;
      }
      const linea = await prisma.bomLinea.create({
        data: {
          bomId: bom.id,
          materialId,
          piezaId: piezaCod ? piezaPorCodigo.get(piezaCod)! : null,
          claseConsumo: 'CURVA',
        },
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

  // 8. Inventario de materia prima (stock actual). codigo, cantDisponible.
  // Fuente: pestaña INVENTARIO del "CONTROL MATERIA PRIMA E INSUMOS" del cliente.
  // Idempotente: upsert por materialId (1:1). NO carga costo/proveedor (fase de costeo aparte).
  let stockMp = 0, stockOmitido = 0;
  for (const f of leerCsv(ruta('inventario-material.csv'))) {
    const materialId = materialPorCodigo.get(f.codigo);
    if (!materialId) {
      console.warn(`  · inventario MP ${f.codigo}: material inexistente, omitido`);
      stockOmitido++;
      continue;
    }
    const cantDisponible = num(f.cantDisponible) ?? 0;
    await prisma.inventarioMaterial.upsert({
      where: { materialId },
      update: { cantDisponible },
      create: { materialId, cantDisponible },
    });
    stockMp++;
  }
  console.log(`  · inventario MP: ${stockMp}${stockOmitido ? ` (omitidos: ${stockOmitido})` : ''}`);

  console.log('Seed Basarili OK ✅');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
