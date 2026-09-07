/**
 * Siembra la programación de corte de agosto 2026 para que el tablero `/corte`
 * tenga de qué hablar: sin esto los indicadores salen en cero y la pantalla no
 * demuestra nada.
 *
 * Correr:  npm run seed:corte              (siembra)
 *          npm run seed:corte -- --limpiar (borra SOLO estas órdenes y se va)
 *
 * Idempotente: cada orden se borra y se recrea por código, así que se puede
 * correr las veces que haga falta. El borrado es en cascada (líneas, avances y
 * consumos cuelgan de la orden), y **no toca nada más**: el módulo de corte no
 * escribe inventario ni pares, así que sembrarlo en prod es reversible.
 *
 * ⚠️ Solo AGR-861 trae la programación real que mandó JP (formato de agosto,
 * columnas 34…46, 1.206 pares). Las demás son órdenes de ejemplo para que el
 * tablero muestre un cierre sano, una desviación, WIP en piso y una alerta de
 * demora — van rotuladas como tales en `observaciones`.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { lineasDesdeProgramacion, fechaDeJornada } from '../src/corte/orden-corte-core';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * Respaldo si la referencia no informa `piezasPorPar` (dato de planta, JP 19-ago).
 * El valor real viene del despiece: seed:basarili → piezas-por-par.csv → Referencia.
 */
const PIEZAS_POR_PAR_RESPALDO = 24;

const NOTA_EJEMPLO = 'Orden de ejemplo cargada para demostrar el tablero de corte.';
const NOTA_REAL = 'Programación real del formato de agosto (columnas 34–46).';

/**
 * La programación tal como llega del cliente: una fila por orden, una columna
 * por talla. AGR-861 es la fila que mandó JP; su total son los 1.206 pares.
 */
const PROGRAMACION = [
  {
    codigo: 'AGR-861',
    fecha: '2026-08-03',
    real: true,
    tallas: { 34: 40, 35: 40, 36: 60, 37: 80, 38: 160, 39: 240, 40: 240, 41: 240, 42: 80, 43: 26 },
    // Cerrada y sana: cortó casi todo lo programado y ya pasó por guarnición.
    cortadoPct: 0.983,
    amarradoPct: 0.983,
    toques: {
      inicioCorte: '2026-08-03T06:10:00',
      entregaCorte: '2026-08-03T16:40:00',
      inicioGuarnicion: '2026-08-04T06:05:00',
      cierreGuarnicion: '2026-08-06T15:20:00',
    },
    estado: 'CERRADA' as const,
    avances: [
      { fecha: '2026-08-03T11:00:00', pares: 620, danadas: 14, repuestas: 14 },
      { fecha: '2026-08-03T16:30:00', pares: 566, danadas: 9, repuestas: 9 },
    ],
  },
  {
    codigo: 'AGR-862',
    fecha: '2026-08-04',
    real: false,
    tallas: { 35: 60, 36: 80, 37: 120, 38: 180, 39: 200, 40: 180, 41: 120, 42: 40 },
    // Entregada muy por debajo de lo programado: dispara la alerta de desviación.
    cortadoPct: 0.624,
    amarradoPct: 0.6,
    toques: {
      inicioCorte: '2026-08-04T06:15:00',
      entregaCorte: '2026-08-04T17:50:00',
      inicioGuarnicion: '2026-08-05T06:10:00',
      cierreGuarnicion: '2026-08-07T16:00:00',
    },
    estado: 'CERRADA' as const,
    avances: [
      { fecha: '2026-08-04T12:00:00', pares: 380, danadas: 41, repuestas: 41 },
      { fecha: '2026-08-04T17:40:00', pares: 244, danadas: 33, repuestas: 33 },
    ],
  },
  {
    codigo: 'AGR-863',
    fecha: '2026-08-05',
    real: false,
    tallas: { 36: 60, 37: 100, 38: 180, 39: 220, 40: 220, 41: 160, 42: 60, 43: 20 },
    // Cortada completa y entregada, guarnición todavía no la cierra: esto es el WIP en piso.
    cortadoPct: 1,
    amarradoPct: 0.71,
    toques: {
      inicioCorte: '2026-08-05T06:05:00',
      entregaCorte: '2026-08-05T15:30:00',
      inicioGuarnicion: '2026-08-06T06:00:00',
      cierreGuarnicion: null,
    },
    estado: 'EN_GUARNICION' as const,
    avances: [
      { fecha: '2026-08-05T11:30:00', pares: 540, danadas: 12, repuestas: 12 },
      { fecha: '2026-08-05T15:20:00', pares: 480, danadas: 8, repuestas: 8 },
    ],
  },
  {
    codigo: 'AGR-880',
    fecha: '2026-08-24',
    real: false,
    tallas: { 37: 80, 38: 160, 39: 200, 40: 200, 41: 140, 42: 60 },
    // Arrancó y no ha entregado: pasa el umbral de horas en corte → alerta de demora.
    cortadoPct: 0,
    amarradoPct: 0,
    toques: {
      inicioCorte: '2026-08-24T06:20:00',
      entregaCorte: null,
      inicioGuarnicion: null,
      cierreGuarnicion: null,
    },
    estado: 'EN_CORTE' as const,
    avances: [{ fecha: '2026-08-24T12:10:00', pares: 410, danadas: 11, repuestas: 11 }],
  },
  {
    codigo: 'AGR-881',
    fecha: '2026-08-25',
    real: false,
    tallas: { 38: 140, 39: 200, 40: 200, 41: 160, 42: 80, 43: 40 },
    // En el plan del día, la mesa no ha arrancado.
    cortadoPct: 0,
    amarradoPct: 0,
    toques: { inicioCorte: null, entregaCorte: null, inicioGuarnicion: null, cierreGuarnicion: null },
    estado: 'PROGRAMADA' as const,
    avances: [],
  },
];

/** Materiales del consumo de corte, con su consumo teórico por par (m² o unidades). */
const MATERIALES_CORTE = [
  { nombre: 'MICROPIEL NEGRA', teoricoPorPar: 0.42, desviacion: 1.06 },
  { nombre: 'MICROPIEL CAFÉ', teoricoPorPar: 0.18, desviacion: 0.98 },
  { nombre: 'PLANTILLA PU', teoricoPorPar: 1, desviacion: 1.02 },
];

async function main() {
  const host = (process.env.DATABASE_URL ?? '').replace(/^.*@/, '').replace(/\?.*$/, '');
  const limpiar = process.argv.includes('--limpiar');
  console.log(`Seed corte — base: ${host}${limpiar ? ' (MODO LIMPIAR)' : ''}`);

  const codigos = PROGRAMACION.map((p) => p.codigo);
  const borradas = await prisma.ordenCorte.deleteMany({ where: { codigo: { in: codigos } } });
  console.log(`  Órdenes previas borradas: ${borradas.count}`);
  if (limpiar) {
    console.log('Listo: solo se limpió. Nada más se tocó.');
    return;
  }

  // Todo se resuelve por código/valor: los ids no son deterministas entre entornos.
  const linea = await prisma.linea.findUnique({ where: { codigo: 'AGRO' } });
  if (!linea) throw new Error('No existe la línea AGRO. Correr antes el seed de líneas.');

  const tallas = await prisma.talla.findMany({ select: { id: true, valor: true } });
  const idPorTalla = new Map(tallas.map((t) => [t.valor, t.id]));

  const producto = await prisma.productoConfigurado.findFirst({
    orderBy: { id: 'asc' },
    select: { id: true, marcaId: true, referencia: { select: { nombreInterno: true, piezasPorPar: true } } },
  });
  if (!producto) throw new Error('No hay ningún ProductoConfigurado. Correr antes seed:basarili.');
  const piezasPorPar = producto.referencia.piezasPorPar ?? PIEZAS_POR_PAR_RESPALDO;
  console.log(`  Producto de la programación: ${producto.referencia.nombreInterno} (id ${producto.id}, ${piezasPorPar} piezas/par)`);

  const materiales = await prisma.material.findMany({
    where: { nombreCanonico: { in: MATERIALES_CORTE.map((m) => m.nombre) } },
    select: { id: true, nombreCanonico: true },
  });
  const idPorMaterial = new Map(materiales.map((m) => [m.nombreCanonico, m.id]));
  const faltantes = MATERIALES_CORTE.filter((m) => !idPorMaterial.has(m.nombre));
  if (faltantes.length) {
    console.log(`  ⚠️ Materiales no encontrados, se omiten del consumo: ${faltantes.map((f) => f.nombre).join(', ')}`);
  }

  const operario = await prisma.operario.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });

  for (const p of PROGRAMACION) {
    const lineas = lineasDesdeProgramacion({ codigo: p.codigo, tallas: p.tallas }, producto.id, idPorTalla);
    const programado = lineas.reduce((s, l) => s + l.cantProgramada, 0);

    const orden = await prisma.ordenCorte.create({
      data: {
        codigo: p.codigo,
        fecha: fechaDeJornada(p.fecha),
        lineaId: linea.id,
        marcaId: producto.marcaId,
        estado: p.estado,
        inicioCorte: p.toques.inicioCorte ? new Date(p.toques.inicioCorte) : null,
        entregaCorte: p.toques.entregaCorte ? new Date(p.toques.entregaCorte) : null,
        inicioGuarnicion: p.toques.inicioGuarnicion ? new Date(p.toques.inicioGuarnicion) : null,
        cierreGuarnicion: p.toques.cierreGuarnicion ? new Date(p.toques.cierreGuarnicion) : null,
        observaciones: p.real ? NOTA_REAL : NOTA_EJEMPLO,
        lineas: {
          create: lineas.map((l) => ({
            productoConfiguradoId: l.productoConfiguradoId,
            tallaId: l.tallaId,
            cantProgramada: l.cantProgramada,
            cantCortada: Math.round(l.cantProgramada * p.cortadoPct),
            cantAmarrada: Math.round(l.cantProgramada * p.amarradoPct),
          })),
        },
      },
    });

    for (const a of p.avances) {
      const avance = await prisma.avanceCorte.create({
        data: {
          ordenCorteId: orden.id,
          fecha: new Date(a.fecha),
          piezasCortadas: a.pares * piezasPorPar,
          piezasDanadas: a.danadas,
          piezasRepuestas: a.repuestas,
          operarioId: operario?.id ?? null,
          observaciones: p.real ? null : NOTA_EJEMPLO,
        },
      });

      for (const m of MATERIALES_CORTE) {
        const materialId = idPorMaterial.get(m.nombre);
        if (!materialId) continue;
        const teorica = a.pares * m.teoricoPorPar;
        await prisma.consumoCorteMaterial.create({
          data: {
            avanceCorteId: avance.id,
            materialId,
            cantTeorica: teorica.toFixed(4),
            cantReal: (teorica * m.desviacion).toFixed(4),
          },
        });
      }
    }

    const cortado = lineas.reduce((s, l) => s + Math.round(l.cantProgramada * p.cortadoPct), 0);
    console.log(
      `  ${p.codigo}  ${p.fecha}  ${p.estado.padEnd(14)} programado ${String(programado).padStart(5)} · cortado ${String(cortado).padStart(5)}`,
    );
  }

  const total = await prisma.ordenCorte.count();
  console.log(`Listo. Órdenes de corte en la base: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
