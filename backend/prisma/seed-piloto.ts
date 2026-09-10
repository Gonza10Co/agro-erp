/**
 * SEED DEL PILOTO (2026-09-09) — una orden de producción lista para nacer pares.
 *
 * Crea, sin tocar inventario ni amarres (por eso NO pasa por el wizard):
 *   1. Un ProductoConfigurado `PC-PILOTO-<ref>-<marca>` de la línea BASARILI.
 *   2. Una OC EN_PRODUCCION + su OP EN_PRODUCCION con la curva real del cuaderno
 *      del cortador (orden #061: 1.206 pares, tallas 36–43) y una OF ABIERTA
 *      SIN pares: los pares nacen en Preparación, con su etiqueta.
 *
 * Uso:
 *   npm run seed:piloto                       # referencia 101, marca de Basarili
 *   npm run seed:piloto -- --referencia 102   # otra referencia del catálogo
 *   npm run seed:piloto -- --marca WORKBOOTS  # marca por código
 *   npm run seed:piloto -- --limpiar          # borra la OC/OP/OF del piloto y sus pares
 *
 * Idempotente: si la OC del piloto ya existe, no crea otra. Corre contra la base
 * que diga DATABASE_URL (en prod se usa a propósito el día de la demo).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { siguienteConsecutivo } from '../src/prisma/consecutivo';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const args = process.argv.slice(2);
const opt = (k: string, def: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const LIMPIAR = args.includes('--limpiar');
const REF = opt('referencia', '101');
const MARCA = opt('marca', '');
/** Marca en la OC para reconocer la orden del piloto (y poder limpiarla). */
const OC_CLIENTE = 'PILOTO AGR-899';

/** Curva del cuaderno del cortador, orden #061 (foto 07 de la visita): 1.206 pares. */
const CURVA: Record<number, number> = { 36: 20, 37: 80, 38: 200, 40: 346, 41: 150, 42: 250, 43: 160 };

async function limpiar() {
  const ocs = await prisma.ordenCompra.findMany({
    where: { ocCliente: OC_CLIENTE },
    include: { ordenProduccion: { include: { ordenesFabricacion: true } } },
  });
  for (const oc of ocs) {
    const op = oc.ordenProduccion;
    for (const of of op?.ordenesFabricacion ?? []) {
      await prisma.eventoTrazabilidad.deleteMany({ where: { par: { ofId: of.id } } });
      await prisma.incidenciaCalidad.deleteMany({ where: { par: { ofId: of.id } } });
      await prisma.movimientoInventario.deleteMany({ where: { ofId: of.id } });
      await prisma.par.deleteMany({ where: { ofId: of.id } });
      await prisma.ordenFabricacion.delete({ where: { id: of.id } });
    }
    if (op) {
      await prisma.ordenProduccionLineaTalla.deleteMany({ where: { opLinea: { opId: op.id } } });
      await prisma.ordenProduccionLinea.deleteMany({ where: { opId: op.id } });
      await prisma.ordenProduccion.delete({ where: { id: op.id } });
    }
    await prisma.ordenCompraLineaTalla.deleteMany({ where: { ocLinea: { ocId: oc.id } } });
    await prisma.ordenCompraLinea.deleteMany({ where: { ocId: oc.id } });
    await prisma.ordenCompra.delete({ where: { id: oc.id } });
    console.log(`  · OC-${oc.consecutivo} del piloto borrada con su OP, OF y pares`);
  }
  if (!ocs.length) console.log('  · no había orden del piloto');
}

async function sembrar() {
  const existente = await prisma.ordenCompra.findFirst({
    where: { ocCliente: OC_CLIENTE },
    include: { ordenProduccion: { include: { ordenesFabricacion: true } } },
  });
  if (existente) {
    const of = existente.ordenProduccion?.ordenesFabricacion[0];
    console.log(`  · ya existe: OC-${existente.consecutivo} · OP-${existente.ordenProduccion?.consecutivo} · OF-${of?.consecutivo}. Nada que hacer (--limpiar para rehacer).`);
    return;
  }

  const linea = await prisma.linea.findUnique({ where: { codigo: 'BASARILI' } });
  if (!linea) throw new Error('No existe la línea BASARILI: corre seed:basarili primero');
  const referencia = await prisma.referencia.findUnique({ where: { codigo: REF } });
  if (!referencia) throw new Error(`No existe la referencia ${REF}`);
  const marca = MARCA
    ? await prisma.marca.findUnique({ where: { codigo: MARCA } })
    : await prisma.marca.findFirst({ where: { activo: true, lineaId: linea.id }, orderBy: { id: 'asc' } }) ??
      await prisma.marca.findFirst({ where: { activo: true }, orderBy: { id: 'asc' } });
  if (!marca) throw new Error('No hay ninguna marca activa');
  const cliente = await prisma.cliente.findFirst({ orderBy: { id: 'asc' } });
  if (!cliente) throw new Error('No hay clientes: corre seed:clientes primero');

  const codigoPc = `PC-PILOTO-${referencia.codigo}-${marca.codigo}`;
  const producto = await prisma.productoConfigurado.upsert({
    where: { codigo: codigoPc },
    create: {
      codigo: codigoPc,
      nombreComercial: `Bota ${marca.nombre} ${referencia.codigo}`,
      referenciaId: referencia.id,
      marcaId: marca.id,
    },
    update: { activo: true },
  });

  const tallas = await prisma.talla.findMany({ where: { valor: { in: Object.keys(CURVA).map(Number) } } });
  const porValor = new Map(tallas.map((t) => [t.valor, t.id]));
  const faltan = Object.keys(CURVA).map(Number).filter((v) => !porValor.has(v));
  if (faltan.length) throw new Error(`Faltan tallas en el catálogo: ${faltan.join(', ')}`);
  const curva = Object.entries(CURVA).map(([v, n]) => ({ tallaId: porValor.get(Number(v))!, n }));
  const total = curva.reduce((a, c) => a + c.n, 0);

  const resultado = await prisma.$transaction(async (tx) => {
    const oc = await tx.ordenCompra.create({
      data: {
        consecutivo: await siguienteConsecutivo(tx, 'oc'),
        ocCliente: OC_CLIENTE,
        clienteId: cliente.id,
        estado: 'EN_PRODUCCION',
        fechaConfirmacion: new Date(),
        lineaId: linea.id,
        observaciones: 'Orden del piloto de planta (2026-09-09): la curva del cuaderno del cortador, #061.',
        lineas: {
          create: [{
            productoConfiguradoId: producto.id,
            precioUnitario: 85000,
            tallas: { create: curva.map((c) => ({ tallaId: c.tallaId, cantidad: c.n })) },
          }],
        },
      },
    });
    const op = await tx.ordenProduccion.create({
      data: {
        consecutivo: await siguienteConsecutivo(tx, 'op'),
        ocId: oc.id,
        estado: 'EN_PRODUCCION',
        lineaId: linea.id,
        lineas: {
          create: [{
            productoConfiguradoId: producto.id,
            tallas: {
              create: curva.map((c) => ({ tallaId: c.tallaId, cantPedida: c.n, cantAmarrada: 0, cantAProducir: c.n })),
            },
          }],
        },
      },
    });
    const of = await tx.ordenFabricacion.create({
      data: { consecutivo: await siguienteConsecutivo(tx, 'of'), opId: op.id, estado: 'ABIERTA' },
    });
    return { oc, op, of };
  });

  console.log(`  · producto ${producto.codigo} (${producto.nombreComercial}) · cliente ${cliente.nombre}`);
  console.log(`  · OC-${resultado.oc.consecutivo} → OP-${resultado.op.consecutivo} → OF-${resultado.of.consecutivo} (id ${resultado.of.id}) · ${total} pares programados, 0 nacidos`);
  console.log('  · curva: ' + Object.entries(CURVA).map(([v, n]) => `${v}:${n}`).join(' · '));
}

async function main() {
  const host = (process.env.DATABASE_URL ?? '').replace(/^.*@/, '').replace(/\?.*$/, '');
  console.log(`seed:piloto → ${host || '(DATABASE_URL vacía)'}`);
  if (LIMPIAR) await limpiar();
  else await sembrar();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
