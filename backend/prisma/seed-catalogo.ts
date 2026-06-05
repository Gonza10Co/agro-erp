import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Tallas 38..46
  const tallas: Record<number, number> = {};
  for (let v = 38; v <= 46; v++) {
    const t = await prisma.talla.upsert({
      where: { valor: v }, update: {}, create: { valor: v, orden: v },
    });
    tallas[v] = t.id;
  }

  const uMetro = await prisma.unidadMedida.upsert({
    where: { codigo: 'M' }, update: {}, create: { codigo: 'M', nombre: 'Metros' },
  });
  const uPar = await prisma.unidadMedida.upsert({
    where: { codigo: 'PAR' }, update: {}, create: { codigo: 'PAR', nombre: 'Pares' },
  });
  const uKg = await prisma.unidadMedida.upsert({
    where: { codigo: 'KG' }, update: {}, create: { codigo: 'KG', nombre: 'Kilogramos' },
  });

  const catCuero = await prisma.categoriaMaterial.upsert({
    where: { nombre: 'Cuero' }, update: {}, create: { nombre: 'Cuero' },
  });
  const catSuela = await prisma.categoriaMaterial.upsert({
    where: { nombre: 'Suela' }, update: {}, create: { nombre: 'Suela' },
  });
  const catSemi = await prisma.categoriaMaterial.upsert({
    where: { nombre: 'Semielaborado' }, update: {}, create: { nombre: 'Semielaborado' },
  });

  const mat = async (codigo: string, nombre: string, catId: number, uId: number, origen: 'COMPRADO' | 'FABRICADO', claseBom: 'DIRECTO_CURVA' | 'DIRECTO_FIJO' | 'INDIRECTO') =>
    prisma.material.upsert({
      where: { codigo },
      update: {},
      create: { codigo, nombreCanonico: nombre, categoriaId: catId, unidadMedidaId: uId, origen, claseBom },
    });

  const micropielNegra = await mat('MICRO-NEG', 'MICROPIEL NEGRA', catCuero.id, uMetro.id, 'COMPRADO', 'DIRECTO_CURVA');
  const micropielCafe = await mat('MICRO-CAF', 'MICROPIEL CAFÉ', catCuero.id, uMetro.id, 'COMPRADO', 'DIRECTO_CURVA');
  const suelaBase = await mat('SUELA-BASE', 'SUELA BASE', catSuela.id, uPar.id, 'COMPRADO', 'DIRECTO_FIJO');
  const suelaRiver = await mat('SUELA-RIVER', 'SUELA RIVER CREEK', catSuela.id, uPar.id, 'COMPRADO', 'DIRECTO_FIJO');
  const plantillaPU = await mat('PLANT-PU', 'PLANTILLA PU', catSemi.id, uPar.id, 'FABRICADO', 'DIRECTO_FIJO');
  const poliol = await mat('POLIOL', 'POLIOL JF', catSemi.id, uKg.id, 'COMPRADO', 'DIRECTO_FIJO');

  // BOM propio de la plantilla (FABRICADO): 0.04 kg de poliol por par
  const bomPlantilla = await prisma.bom.upsert({
    where: { materialId: plantillaPU.id }, update: {}, create: { materialId: plantillaPU.id },
  });
  // Idempotencia: limpiar líneas previas de este BOM (y sus tallas) antes de recrear.
  await prisma.bomLineaTalla.deleteMany({ where: { bomLinea: { bomId: bomPlantilla.id } } });
  await prisma.bomLinea.deleteMany({ where: { bomId: bomPlantilla.id } });
  await prisma.bomLinea.create({
    data: { bomId: bomPlantilla.id, materialId: poliol.id, claseConsumo: 'FIJO', consumoFijo: 0.04 },
  });

  // Referencia 101
  const ref = await prisma.referencia.upsert({
    where: { codigo: '101' },
    update: {},
    create: { codigo: '101', nombreInterno: 'PODEROSA base', tallaMinId: tallas[38], tallaMaxId: tallas[46] },
  });

  // BOM base de la 101: micropiel negra (curva) + suela base (fija)
  const bom101 = await prisma.bom.upsert({
    where: { referenciaId: ref.id }, update: {}, create: { referenciaId: ref.id },
  });
  // Idempotencia: limpiar líneas previas de este BOM (y sus tallas) antes de recrear.
  await prisma.bomLineaTalla.deleteMany({ where: { bomLinea: { bomId: bom101.id } } });
  await prisma.bomLinea.deleteMany({ where: { bomId: bom101.id } });
  const lineaMicro = await prisma.bomLinea.create({
    data: { bomId: bom101.id, materialId: micropielNegra.id, claseConsumo: 'CURVA' },
  });
  const curva: Record<number, number> = { 38: 0.104, 39: 0.105, 40: 0.105, 41: 0.107, 42: 0.107, 43: 0.108, 44: 0.110, 45: 0.111, 46: 0.112 };
  for (const [v, c] of Object.entries(curva)) {
    await prisma.bomLineaTalla.create({ data: { bomLineaId: lineaMicro.id, tallaId: tallas[+v], consumo: c } });
  }
  await prisma.bomLinea.create({
    data: { bomId: bom101.id, materialId: suelaBase.id, claseConsumo: 'FIJO', consumoFijo: 1 },
  });

  // Ejes de configuración
  const grupoColor = await prisma.grupoOpcion.upsert({
    where: { codigo: 'COLOR' }, update: {}, create: { codigo: 'COLOR', nombre: 'Color', orden: 1 },
  });
  const grupoSuela = await prisma.grupoOpcion.upsert({
    where: { codigo: 'SUELA' }, update: {}, create: { codigo: 'SUELA', nombre: 'Suela', orden: 2 },
  });
  const opColorCafe = await prisma.opcion.upsert({
    where: { grupoOpcionId_codigo: { grupoOpcionId: grupoColor.id, codigo: 'CAFE' } },
    update: {}, create: { grupoOpcionId: grupoColor.id, codigo: 'CAFE', nombre: 'Café' },
  });
  const opSuelaRiver = await prisma.opcion.upsert({
    where: { grupoOpcionId_codigo: { grupoOpcionId: grupoSuela.id, codigo: 'RIVER' } },
    update: {}, create: { grupoOpcionId: grupoSuela.id, codigo: 'RIVER', nombre: 'River Creek' },
  });

  // Marca PODEROSA
  const marca = await prisma.marca.upsert({
    where: { codigo: 'PODEROSA' }, update: {}, create: { codigo: 'PODEROSA', nombre: 'Poderosa', tipo: 'PROPIA' },
  });

  // Ejes de configuración de la referencia 101 (qué grupos aplican y si son obligatorios)
  await prisma.referenciaEje.upsert({
    where: { referenciaId_grupoOpcionId: { referenciaId: ref.id, grupoOpcionId: grupoColor.id } },
    update: { obligatorio: true },
    create: { referenciaId: ref.id, grupoOpcionId: grupoColor.id, obligatorio: true },
  });
  await prisma.referenciaEje.upsert({
    where: { referenciaId_grupoOpcionId: { referenciaId: ref.id, grupoOpcionId: grupoSuela.id } },
    update: { obligatorio: true },
    create: { referenciaId: ref.id, grupoOpcionId: grupoSuela.id, obligatorio: true },
  });

  // Marca disponible para la referencia 101
  await prisma.referenciaMarca.upsert({
    where: { referenciaId_marcaId: { referenciaId: ref.id, marcaId: marca.id } },
    update: {},
    create: { referenciaId: ref.id, marcaId: marca.id },
  });

  // Overrides (idempotencia: borrar los de esta referencia y recrear)
  await prisma.reglaOverride.deleteMany({ where: { referenciaId: ref.id } });
  await prisma.reglaOverride.create({
    data: { referenciaId: ref.id, opcionId: opColorCafe.id, accion: 'REPLACE', materialObjetivoId: micropielNegra.id, materialNuevoId: micropielCafe.id, heredaCurva: true },
  });
  await prisma.reglaOverride.create({
    data: { referenciaId: ref.id, opcionId: opSuelaRiver.id, accion: 'REPLACE', materialObjetivoId: suelaBase.id, materialNuevoId: suelaRiver.id, consumoFijo: 1, heredaCurva: false },
  });
  await prisma.reglaOverride.create({
    data: { referenciaId: ref.id, marcaId: marca.id, accion: 'ADD', materialNuevoId: plantillaPU.id, consumoFijo: 1, heredaCurva: false },
  });

  console.log(`Seed catálogo OK -> referencia ${ref.id} (101), marca ${marca.id} (PODEROSA), opciones CAFE=${opColorCafe.id} RIVER=${opSuelaRiver.id}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
