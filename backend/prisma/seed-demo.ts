import 'dotenv/config';
import { PrismaClient, Celula, ClaseDano, TipoMeta } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { siguienteConsecutivo } from '../src/prisma/consecutivo';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ─── Helper: crear una OP 100% amarrada ────────────────────────────────────────
async function crearOPAmarrada(opts: {
  clienteId: number;
  productoConfiguradoId: number;
  bodegaId: number;
  tallas: { tallaId: number; cantidad: number }[];
  consecutivoOC: number;
  consecutivoOP: number;
  lineaId?: number | null;
}) {
  const oc = await prisma.ordenCompra.create({
    data: {
      consecutivo: opts.consecutivoOC,
      clienteId: opts.clienteId,
      estado: 'CONFIRMADA',
      lineaId: opts.lineaId ?? null,
      lineas: {
        create: [
          {
            productoConfiguradoId: opts.productoConfiguradoId,
            precioUnitario: 85000, // precio pactado por par (bota de seguridad)
            tallas: {
              create: opts.tallas.map((t) => ({
                tallaId: t.tallaId,
                cantidad: t.cantidad,
              })),
            },
          },
        ],
      },
    },
  });

  const op = await prisma.ordenProduccion.create({
    data: {
      consecutivo: opts.consecutivoOP,
      ocId: oc.id,
      estado: 'AMARRADA',
      lineaId: opts.lineaId ?? null,
    },
  });

  await prisma.ordenCompra.update({
    where: { id: oc.id },
    data: { estado: 'EN_PRODUCCION' },
  });

  const opLinea = await prisma.ordenProduccionLinea.create({
    data: {
      opId: op.id,
      productoConfiguradoId: opts.productoConfiguradoId,
    },
  });

  for (const t of opts.tallas) {
    // Solo PRIMERA: el amarre de un pedido nunca toma segundas (igual que op.service).
    const inv = await prisma.inventarioPT.findUnique({
      where: {
        productoConfiguradoId_tallaId_bodegaId_calidad: {
          productoConfiguradoId: opts.productoConfiguradoId,
          tallaId: t.tallaId,
          bodegaId: opts.bodegaId,
          calidad: 'PRIMERA',
        },
      },
    });

    if (!inv || inv.cantDisponible - inv.cantReservada < t.cantidad)
      throw new Error(`Stock insuficiente para amarrar talla ${t.tallaId}`);

    const olt = await prisma.ordenProduccionLineaTalla.create({
      data: {
        opLineaId: opLinea.id,
        tallaId: t.tallaId,
        cantPedida: t.cantidad,
        cantAmarrada: t.cantidad,
        cantAProducir: 0,
      },
    });

    await prisma.inventarioPT.update({
      where: { id: inv.id },
      data: { cantReservada: { increment: t.cantidad } },
    });

    await prisma.reservaInventarioPT.create({
      data: {
        opLineaTallaId: olt.id,
        inventarioPTId: inv.id,
        cantidad: t.cantidad,
      },
    });
  }

  return op;
}

async function main() {
  // ── Clientes demo ────────────────────────────────────────────────────────────
  const clientes = [
    { nit: '900111222', nombre: 'Minera El Roble', ciudad: 'Medellín', tipoCredito: 'D60' as const },
    { nit: '900333444', nombre: 'Maquila Norte SAS', ciudad: 'Barranquilla', tipoCredito: 'D30' as const },
    { nit: '900555666', nombre: 'Constructora Yopal', ciudad: 'Yopal', tipoCredito: 'CONTADO' as const },
    { nit: '900777888', nombre: 'Agroindustrias del Llano', ciudad: 'Villavicencio', tipoCredito: 'D90' as const },
    { nit: '900999000', nombre: 'Petro Servicios SA', ciudad: 'Bogotá', tipoCredito: 'D60' as const },
  ];
  for (const c of clientes) {
    await prisma.cliente.upsert({ where: { nit: c.nit }, create: c, update: c });
  }

  // ── Bodegas ──────────────────────────────────────────────────────────────────
  await prisma.bodega.upsert({
    where: { codigo: 'IBG' },
    create: { codigo: 'IBG', nombre: 'Ibagué (Principal)', tipo: 'PROPIA', prioridad: 100 },
    update: { nombre: 'Ibagué (Principal)', tipo: 'PROPIA', prioridad: 100 },
  });
  await prisma.bodega.upsert({
    where: { codigo: 'BOG' },
    create: { codigo: 'BOG', nombre: 'Bogotá (Hermana)', tipo: 'HERMANA', prioridad: 200 },
    update: { nombre: 'Bogotá (Hermana)', tipo: 'HERMANA', prioridad: 200 },
  });

  // ── Rol + usuario GERENTE (idempotente) ──────────────────────────────────────
  const rolGerente = await prisma.role.upsert({
    where: { name: 'GERENTE' },
    update: {},
    create: { name: 'GERENTE' },
  });
  const passHashGerente = await argon2.hash('gerente123');
  await prisma.user.upsert({
    where: { username: 'gerente' },
    update: {},
    create: { username: 'gerente', passwordHash: passHashGerente, roleId: rolGerente.id },
  });

  // ── Productos configurados demo ────────────────────────────────────────────
  const ref = await prisma.referencia.findUnique({ where: { codigo: '101' } });
  const marca = await prisma.marca.findUnique({ where: { codigo: 'PODEROSA' } });
  if (ref && marca) {
    const productosDemo = [
      { codigo: 'PC-101-PODEROSA-DIEL', nombreComercial: 'Bota Dieléctrica Poderosa' },
      { codigo: 'PC-101-PODEROSA-PACE', nombreComercial: 'Bota Punta Acero Poderosa' },
      { codigo: 'PC-101-PODEROSA-NEGRA', nombreComercial: 'Bota Negra Industrial Poderosa' },
    ];
    for (const pc of productosDemo) {
      await prisma.productoConfigurado.upsert({
        where: { codigo: pc.codigo },
        create: { codigo: pc.codigo, nombreComercial: pc.nombreComercial, referenciaId: ref.id, marcaId: marca.id },
        update: { nombreComercial: pc.nombreComercial, referenciaId: ref.id, marcaId: marca.id },
      });
    }
  } else {
    console.warn('No se encontró Referencia 101 o Marca PODEROSA; corré seed:catalogo primero.');
  }

  const ibg = await prisma.bodega.findUniqueOrThrow({ where: { codigo: 'IBG' } });
  const productos = await prisma.productoConfigurado.findMany({
    include: { referencia: { include: { tallaMin: true, tallaMax: true } } },
  });
  const tallas = await prisma.talla.findMany({ orderBy: { orden: 'asc' } });

  // ── Stock suficiente + idempotente (resetear reservas para re-ejecución) ─────
  for (const p of productos) {
    const min = p.referencia.tallaMin.valor;
    const max = p.referencia.tallaMax.valor;
    const enRango = tallas.filter((t) => t.valor >= min && t.valor <= max);
    for (let i = 0; i < enRango.length; i++) {
      if (i % 2 === 0) {
        const t = enRango[i];
        await prisma.inventarioPT.upsert({
          where: {
            productoConfiguradoId_tallaId_bodegaId_calidad: {
              productoConfiguradoId: p.id,
              tallaId: t.id,
              bodegaId: ibg.id,
              calidad: 'PRIMERA',
            },
          },
          create: {
            productoConfiguradoId: p.id,
            tallaId: t.id,
            bodegaId: ibg.id,
            calidad: 'PRIMERA',
            cantDisponible: 100,
            cantReservada: 0,
          },
          update: { cantDisponible: 100, cantReservada: 0 },
        });
      }
    }
  }

  // ── Marcar Minera El Roble como VENCIDO (camino bloqueado) ───────────────────
  // Maquila Norte SAS queda AL_DIA (default) → camino feliz
  await prisma.cliente.update({
    where: { nit: '900111222' },
    data: { estadoCartera: 'VENCIDO' },
  });
  await prisma.cliente.update({
    where: { nit: '900333444' },
    data: { estadoCartera: 'AL_DIA' },
  });

  // ── Resolver IDs para las OPs demo ──────────────────────────────────────────
  const clienteAlDia = await prisma.cliente.findUniqueOrThrow({ where: { nit: '900333444' } });
  const clienteVencido = await prisma.cliente.findUniqueOrThrow({ where: { nit: '900111222' } });
  const prodDiel = await prisma.productoConfigurado.findUniqueOrThrow({
    where: { codigo: 'PC-101-PODEROSA-DIEL' },
    include: { referencia: { include: { tallaMin: true, tallaMax: true } } },
  });

  // ── Líneas de producción (la línea se decide POR PEDIDO) ────────────────────
  // Sembradas por seed:basarili; se resuelven por código porque los ids NO son
  // deterministas (SERIAL). Si faltan, las OCs demo quedan sin línea (nullable).
  const lineasDemo = await prisma.linea.findMany({
    where: { codigo: { in: ['BASARILI', 'AGRO', 'ALTA', 'FEROZ'] }, activo: true },
  });
  const lineaDe = (codigo: string) => lineasDemo.find((l) => l.codigo === codigo) ?? null;
  const linBasarili = lineaDe('BASARILI');
  const linAgro = lineaDe('AGRO');
  const linAlta = lineaDe('ALTA');
  const linFeroz = lineaDe('FEROZ');
  if (lineasDemo.length < 4) {
    console.warn(
      `Solo ${lineasDemo.length}/4 líneas de producción encontradas; corré seed:basarili primero. Las OCs demo de líneas faltantes quedan sin línea.`,
    );
  }

  // Tallas con stock: el seed pone stock en i%2===0 → tomamos las 2 primeras con stock
  const tallaMin = prodDiel.referencia.tallaMin.valor;
  const tallaMax = prodDiel.referencia.tallaMax.valor;
  const tallasEnRango = tallas.filter((t) => t.valor >= tallaMin && t.valor <= tallaMax);
  const tallasConStock = tallasEnRango.filter((_, i) => i % 2 === 0).slice(0, 2);

  if (tallasConStock.length < 2) {
    throw new Error('Se necesitan al menos 2 tallas con stock para armar las OPs demo');
  }

  const [tallaA, tallaB] = tallasConStock;

  // ── Limpieza idempotente (respetar orden de FKs) ─────────────────────────────

  // ── Limpieza MES (idempotente) ──
  await prisma.incidenciaCalidad.deleteMany({
    where: { par: { of: { op: { consecutivo: { in: [9001, 9002, 9003, 9005, 9006] } } } } },
  });
  await prisma.eventoTrazabilidad.deleteMany({
    where: { par: { of: { op: { consecutivo: { in: [9001, 9002, 9003, 9005, 9006] } } } } },
  });
  await prisma.par.deleteMany({
    where: { of: { op: { consecutivo: { in: [9001, 9002, 9003, 9005, 9006] } } } },
  });
  await prisma.ordenFabricacion.deleteMany({
    where: { op: { consecutivo: { in: [9001, 9002, 9003, 9005, 9006] } } },
  });
  // Limpieza idempotente de la actividad Demo 14: OPs de producción 9014/9018-9020
  // (una por línea) + cadenas de venta 9015-9017 + movimientos D14-*.
  const CONS_D14 = [9014, 9015, 9016, 9017, 9018, 9019, 9020];
  await prisma.pago.deleteMany({ where: { factura: { despacho: { op: { consecutivo: { in: CONS_D14 } } } } } });
  await prisma.facturaLinea.deleteMany({ where: { factura: { despacho: { op: { consecutivo: { in: CONS_D14 } } } } } });
  await prisma.factura.deleteMany({ where: { despacho: { op: { consecutivo: { in: CONS_D14 } } } } });
  await prisma.movimientoInventario.deleteMany({ where: { referencia: { startsWith: 'D14-' } } });
  await prisma.despachoLinea.deleteMany({ where: { despacho: { op: { consecutivo: { in: CONS_D14 } } } } });
  await prisma.despacho.deleteMany({ where: { op: { consecutivo: { in: CONS_D14 } } } });
  await prisma.eventoTrazabilidad.deleteMany({ where: { par: { of: { op: { consecutivo: { in: CONS_D14 } } } } } });
  // Antes que los pares: las incidencias de las segundas los referencian por FK.
  await prisma.incidenciaCalidad.deleteMany({ where: { par: { of: { op: { consecutivo: { in: CONS_D14 } } } } } });
  await prisma.par.deleteMany({ where: { of: { op: { consecutivo: { in: CONS_D14 } } } } });
  await prisma.ordenFabricacion.deleteMany({ where: { op: { consecutivo: { in: CONS_D14 } } } });
  await prisma.ordenProduccion.deleteMany({ where: { consecutivo: { in: CONS_D14 } } });
  await prisma.ordenCompraLineaTalla.deleteMany({ where: { ocLinea: { oc: { consecutivo: { in: CONS_D14 } } } } });
  await prisma.ordenCompraLinea.deleteMany({ where: { oc: { consecutivo: { in: CONS_D14 } } } });
  await prisma.ordenCompra.deleteMany({ where: { consecutivo: { in: CONS_D14 } } });

  await prisma.requerimientoCompraLinea.deleteMany({
    where: { requerimiento: { op: { consecutivo: { in: [9001, 9002, 9003, 9005, 9006] } } } },
  });
  await prisma.requerimientoCompra.deleteMany({
    where: { op: { consecutivo: { in: [9001, 9002, 9003, 9005, 9006] } } },
  });
  await prisma.despachoLinea.deleteMany({
    where: { despacho: { op: { consecutivo: { in: [9001, 9002, 9003, 9005, 9006] } } } },
  });
  await prisma.despacho.deleteMany({
    where: { op: { consecutivo: { in: [9001, 9002, 9003, 9005, 9006] } } },
  });
  await prisma.reservaInventarioPT.deleteMany({
    where: { opLineaTalla: { opLinea: { op: { consecutivo: { in: [9001, 9002, 9003, 9005, 9006] } } } } },
  });
  await prisma.ordenProduccionLineaTalla.deleteMany({
    where: { opLinea: { op: { consecutivo: { in: [9001, 9002, 9003, 9005, 9006] } } } },
  });
  await prisma.ordenProduccionLinea.deleteMany({
    where: { op: { consecutivo: { in: [9001, 9002, 9003, 9005, 9006] } } },
  });
  await prisma.ordenProduccion.deleteMany({
    where: { consecutivo: { in: [9001, 9002, 9003, 9005, 9006] } },
  });
  await prisma.ordenCompraLineaTalla.deleteMany({
    where: { ocLinea: { oc: { consecutivo: { in: [9001, 9002, 9003, 9005, 9006] } } } },
  });
  await prisma.ordenCompraLinea.deleteMany({
    where: { oc: { consecutivo: { in: [9001, 9002, 9003, 9005, 9006] } } },
  });
  await prisma.ordenCompra.deleteMany({
    where: { consecutivo: { in: [9001, 9002, 9003, 9005, 9006] } },
  });

  // ── OP 9001 — cliente AL_DIA → camino feliz ───────────────────────────────
  const op9001 = await crearOPAmarrada({
    clienteId: clienteAlDia.id,
    productoConfiguradoId: prodDiel.id,
    bodegaId: ibg.id,
    tallas: [
      { tallaId: tallaA.id, cantidad: 10 },
      { tallaId: tallaB.id, cantidad: 8 },
    ],
    consecutivoOC: 9001,
    consecutivoOP: 9001,
    lineaId: linAgro?.id,
  });

  // ── OP 9002 — cliente VENCIDO → camino bloqueado → autorizar ─────────────
  const op9002 = await crearOPAmarrada({
    clienteId: clienteVencido.id,
    productoConfiguradoId: prodDiel.id,
    bodegaId: ibg.id,
    tallas: [
      { tallaId: tallaA.id, cantidad: 6 },
      { tallaId: tallaB.id, cantidad: 6 },
    ],
    consecutivoOC: 9002,
    consecutivoOP: 9002,
    lineaId: linAlta?.id,
  });

  // ── OP 9003 — producción PENDIENTE (cantAProducir > 0) → driver de Compras ──
  // El cálculo de requerimientos solo explota tallas con cantAProducir > 0
  // (ComprasService.calcularRequerimiento). Las OPs 9001/9002 están 100%
  // amarradas (cantAProducir = 0) y no generarían requerimiento. Esta OP sí.
  const oc9003 = await prisma.ordenCompra.create({
    data: {
      consecutivo: 9003,
      clienteId: clienteAlDia.id,
      estado: 'EN_PRODUCCION',
      lineaId: linBasarili?.id ?? null,
      lineas: {
        create: [
          {
            productoConfiguradoId: prodDiel.id,
            precioUnitario: 85000,
            tallas: {
              create: [
                { tallaId: tallaA.id, cantidad: 100 },
                { tallaId: tallaB.id, cantidad: 100 },
              ],
            },
          },
        ],
      },
    },
  });
  const op9003 = await prisma.ordenProduccion.create({
    data: { consecutivo: 9003, ocId: oc9003.id, estado: 'EN_PRODUCCION', lineaId: linBasarili?.id ?? null },
  });
  const op9003Linea = await prisma.ordenProduccionLinea.create({
    data: { opId: op9003.id, productoConfiguradoId: prodDiel.id },
  });
  await prisma.ordenProduccionLineaTalla.createMany({
    data: [
      { opLineaId: op9003Linea.id, tallaId: tallaA.id, cantPedida: 100, cantAmarrada: 0, cantAProducir: 100 },
      { opLineaId: op9003Linea.id, tallaId: tallaB.id, cantPedida: 100, cantAmarrada: 0, cantAProducir: 100 },
    ],
  });

  // ── Demo 4: Proveedores + proveedor preferido + stock de insumos ────────────
  // Proveedores (upsert por NIT, idempotente)
  const curtiembre = await prisma.proveedor.upsert({
    where: { nit: '900111111-1' },
    update: {},
    create: { nit: '900111111-1', nombre: 'Curtiembre Andina', ciudad: 'Bogotá' },
  });
  const quimicos = await prisma.proveedor.upsert({
    where: { nit: '900222222-2' },
    update: {},
    create: { nit: '900222222-2', nombre: 'Químicos del Tolima', ciudad: 'Ibagué' },
  });
  const herrajes = await prisma.proveedor.upsert({
    where: { nit: '900333333-3' },
    update: {},
    create: { nit: '900333333-3', nombre: 'Herrajes y Avíos SAS', ciudad: 'Medellín' },
  });

  // Asignar proveedor preferido a materiales COMPRADOS existentes (por código real)
  async function asignarProveedor(codigo: string, proveedorId: number) {
    await prisma.material.updateMany({ where: { codigo }, data: { proveedorId } });
  }
  await asignarProveedor('MICRO-NEG', curtiembre.id); // cuero → curtiembre
  await asignarProveedor('MICRO-CAF', curtiembre.id); // cuero → curtiembre
  await asignarProveedor('POLIOL', quimicos.id);      // químico PU → químicos
  await asignarProveedor('SUELA-RIVER', herrajes.id); // suela alterna → herrajes
  // SUELA-BASE queda SIN proveedor a propósito → grupo "Sin proveedor" en la demo

  // Stock variado de insumos (upsert por materialId, idempotente)
  async function stock(codigo: string, cant: number) {
    const m = await prisma.material.findUnique({ where: { codigo } });
    if (!m) return;
    await prisma.inventarioMaterial.upsert({
      where: { materialId: m.id },
      update: { cantDisponible: cant },
      create: { materialId: m.id, cantDisponible: cant },
    });
  }
  // Requerimiento bruto de la OP 9003 (200 pares DIEL = base PODEROSA):
  //   MICRO-NEG  (curva)      → 100*0.104 + 100*0.105 = 20.9 m
  //   SUELA-BASE (fijo 1)     → 200 par
  //   POLIOL     (vía PLANT-PU FABRICADO, 0.04/par) → 8 kg   ← multinivel visible
  await stock('SUELA-BASE', 250); // ABUNDANTE → neto 0 (a comprar 0)  [sin proveedor]
  await stock('MICRO-NEG', 12);   // PARCIAL   → neto 8.9 m a comprar   [curtiembre]
  // POLIOL: SIN registro de InventarioMaterial → todo a comprar (8 kg) [químicos]

  // ── MES: operarios y máquinas (uno por célula) ──
  const celulas = ['CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION', 'PT'] as const;
  const nombresOperario: Record<(typeof celulas)[number], string> = {
    CORTE: 'Carlos Cortés',
    GUARNICION: 'Gloria Guarín',
    ALMACEN: 'Aldo Mena',
    INYECCION: 'Iván Yepes',
    PT: 'Patricia Téllez',
  };
  const nombresMaquina: Record<(typeof celulas)[number], string> = {
    CORTE: 'Cortadora CNC',
    GUARNICION: 'Máquina de costura plana',
    ALMACEN: 'Estación de armado',
    INYECCION: 'Inyectora robotizada',
    PT: 'Empacadora',
  };
  // Idempotente SIN borrado global: puede haber eventos de OPs no-demo que
  // referencian máquinas/operarios existentes (FK) y no hay que perderlos.
  async function upsertOperario(nombre: string, celula: Celula) {
    const ya = await prisma.operario.findFirst({ where: { nombre, celula } });
    if (!ya) await prisma.operario.create({ data: { nombre, celula } });
  }
  for (const c of celulas) {
    await upsertOperario(nombresOperario[c], c);
    await prisma.maquina.upsert({
      where: { codigo: `MAQ-${c}` },
      update: { nombre: nombresMaquina[c], celula: c },
      create: { codigo: `MAQ-${c}`, nombre: nombresMaquina[c], celula: c },
    });
  }

  // Operarios extra de Guarnición para poblar el sub-tablero (D7)
  await upsertOperario('Sofía Costuras', 'GUARNICION');
  await upsertOperario('Marta Hilván', 'GUARNICION');

  // ── Indicadores: umbrales de demora por célula (D8) ──
  const umbrales = [
    { celula: 'CORTE', minutos: 60 }, { celula: 'GUARNICION', minutos: 30 },
    { celula: 'ALMACEN', minutos: 30 }, { celula: 'INYECCION', minutos: 45 }, { celula: 'PT', minutos: 30 },
  ] as const;
  for (const u of umbrales) {
    await prisma.umbralDemora.upsert({ where: { celula: u.celula }, update: { minutos: u.minutos }, create: u });
  }

  // ── Calidad: catálogo de tipos de daño (briefing §5 / §Inyección) ──
  const tiposDano: { codigo: string; nombre: string; celulaCausante: Celula; clase: ClaseDano }[] = [
    { codigo: 'CORTE-PEQUENO',       nombre: 'Corte muy pequeño',          celulaCausante: Celula.CORTE,      clase: ClaseDano.BAJA      },
    { codigo: 'CORTE-GRANDE',        nombre: 'Corte muy grande',           celulaCausante: Celula.CORTE,      clase: ClaseDano.REPROCESO },
    { codigo: 'PIEZA-DANADA',        nombre: 'Pieza dañada en corte',      celulaCausante: Celula.CORTE,      clase: ClaseDano.BAJA      },
    { codigo: 'COSTURA-DEFECTUOSA',  nombre: 'Costura defectuosa',         celulaCausante: Celula.GUARNICION, clase: ClaseDano.REPROCESO },
    { codigo: 'STROBEL-RASGADO',     nombre: 'Strobel rasgado',            celulaCausante: Celula.GUARNICION, clase: ClaseDano.REPROCESO },
    { codigo: 'STROBEL-TORCIDO',     nombre: 'Strobel torcido',            celulaCausante: Celula.GUARNICION, clase: ClaseDano.REPROCESO },
    { codigo: 'ECONOMIZADOR-RASGADO',nombre: 'Economizador rasgado',       celulaCausante: Celula.INYECCION,  clase: ClaseDano.REPROCESO },
    { codigo: 'DANO-ROBOT',          nombre: 'Daño de robot en capellada', celulaCausante: Celula.INYECCION,  clase: ClaseDano.BAJA      },
    // SEGUNDA: el par no se pierde ni se reprocesa — se vende como segunda.
    { codigo: 'MANCHA-CUERO',        nombre: 'Mancha en el cuero',         celulaCausante: Celula.CORTE,      clase: ClaseDano.SEGUNDA   },
    { codigo: 'TONO-DISPAREJO',      nombre: 'Tono disparejo entre piezas',celulaCausante: Celula.GUARNICION, clase: ClaseDano.SEGUNDA   },
    { codigo: 'REBABA-SUELA',        nombre: 'Rebaba en la suela',         celulaCausante: Celula.INYECCION,  clase: ClaseDano.SEGUNDA   },
  ];
  for (const t of tiposDano) {
    await prisma.tipoDano.upsert({
      where: { codigo: t.codigo },
      update: { nombre: t.nombre, celulaCausante: t.celulaCausante, clase: t.clase },
      create: t,
    });
  }

  // ── OP 9005 — driver del MES (cantidades chicas para el tablero) ──
  const oc9005 = await prisma.ordenCompra.create({
    data: {
      consecutivo: 9005,
      clienteId: clienteAlDia.id,
      estado: 'EN_PRODUCCION',
      lineaId: linAgro?.id ?? null,
      lineas: {
        create: [
          {
            productoConfiguradoId: prodDiel.id,
            precioUnitario: 85000,
            tallas: { create: [{ tallaId: tallaA.id, cantidad: 6 }, { tallaId: tallaB.id, cantidad: 6 }] },
          },
        ],
      },
    },
  });
  const op9005 = await prisma.ordenProduccion.create({
    data: { consecutivo: 9005, ocId: oc9005.id, estado: 'EN_PRODUCCION', lineaId: linAgro?.id ?? null },
  });
  const op9005Linea = await prisma.ordenProduccionLinea.create({
    data: { opId: op9005.id, productoConfiguradoId: prodDiel.id },
  });
  await prisma.ordenProduccionLineaTalla.createMany({
    data: [
      { opLineaId: op9005Linea.id, tallaId: tallaA.id, cantPedida: 6, cantAmarrada: 0, cantAProducir: 6 },
      { opLineaId: op9005Linea.id, tallaId: tallaB.id, cantPedida: 6, cantAmarrada: 0, cantAProducir: 6 },
    ],
  });
  console.log('  OP-9005 (driver MES): 12 pares pendientes desde Corte');

  // ── OP 9006 — histórica con eventos (driver de Indicadores D8) ──
  // Pares con historial de EventoTrazabilidad para poblar el dashboard de
  // eficiencia: duraciones por célula, eficiencia y alertas de demora.
  const oc9006 = await prisma.ordenCompra.create({
    data: {
      consecutivo: 9006,
      clienteId: clienteAlDia.id,
      estado: 'EN_PRODUCCION',
      lineaId: linBasarili?.id ?? null,
      lineas: {
        create: [
          {
            productoConfiguradoId: prodDiel.id,
            precioUnitario: 85000,
            tallas: { create: [{ tallaId: tallaA.id, cantidad: 6 }] },
          },
        ],
      },
    },
  });
  const op9006 = await prisma.ordenProduccion.create({
    data: { consecutivo: 9006, ocId: oc9006.id, estado: 'EN_PRODUCCION', lineaId: linBasarili?.id ?? null },
  });
  const op9006Linea = await prisma.ordenProduccionLinea.create({
    data: { opId: op9006.id, productoConfiguradoId: prodDiel.id },
  });
  await prisma.ordenProduccionLineaTalla.createMany({
    data: [{ opLineaId: op9006Linea.id, tallaId: tallaA.id, cantPedida: 6, cantAmarrada: 0, cantAProducir: 6 }],
  });
  // OF vía secuencia (regla del proyecto: SIEMPRE siguienteConsecutivo, nunca _max+1)
  const consecutivoOF9006 = await siguienteConsecutivo(prisma, 'of');
  const of9006 = await prisma.ordenFabricacion.create({
    data: { consecutivo: consecutivoOF9006, opId: op9006.id, estado: 'ABIERTA' },
  });

  // Resolver operarios/máquinas por célula. Guarnición rota entre sus 3 operarios.
  const opDe = async (celula: string) =>
    (await prisma.operario.findFirst({ where: { celula: celula as Celula } }))!.id;
  const maqDe = async (celula: string) =>
    (await prisma.maquina.findFirst({ where: { celula: celula as Celula } }))!.id;
  const opsGuarn = await prisma.operario.findMany({ where: { celula: 'GUARNICION' } });

  const ids = {
    CORTE: { op: await opDe('CORTE'), maq: await maqDe('CORTE') },
    GUARNICION: { op: await opDe('GUARNICION'), maq: await maqDe('GUARNICION') },
    ALMACEN: { op: await opDe('ALMACEN'), maq: await maqDe('ALMACEN') },
    INYECCION: { op: await opDe('INYECCION'), maq: await maqDe('INYECCION') },
    PT: { op: await opDe('PT'), maq: await maqDe('PT') },
  };

  // Recorrido completo: cada entrada es [célula, subPaso] del evento (etapa COMPLETADA).
  const ORDEN: [string, string | null][] = [
    ['CORTE', null],
    ['GUARNICION', 'AREA'], ['GUARNICION', 'ARMADO'], ['GUARNICION', 'VISTAS'],
    ['GUARNICION', 'CIERRE'], ['GUARNICION', 'PREFORMADO'], ['GUARNICION', 'PERFORADO'],
    ['GUARNICION', 'REVISION'], ['GUARNICION', 'STROBEL'], ['GUARNICION', 'AMARRE'],
    ['ALMACEN', null], ['INYECCION', null], ['PT', null],
  ];

  let seqPar = 0;
  let eventosTotales = 0;
  // Crea un par y siembra sus eventos. `pasosACompletar` = nº de etapas de ORDEN con
  // evento registrado. `minInicioAtras` = minutos hacia atrás del PRIMER evento.
  // `gapMin` = separación entre eventos. El par queda en `estadoFinal`/`celulaActual`/`subPasoActual`.
  async function crearParHistorico(opts: {
    pasosACompletar: number;
    minInicioAtras: number;
    gapMin: number;
    estadoFinal: 'TERMINADO' | 'EN_PROCESO';
    celulaActual: string;
    subPasoActual: string | null;
  }) {
    seqPar++;
    const codigo = `OF9006-${String(seqPar).padStart(4, '0')}`;
    // El primer evento (CORTE, i=0) ocurre `minInicioAtras` min atrás. El par debe
    // crearse ANTES de ese evento para que el tramo de CORTE sea positivo y realista
    // (createdAt → primer evento). Lo ubicamos CORTE_MIN antes del primer evento.
    const CORTE_MIN = 15;
    const primerEventoTs = new Date(Date.now() - opts.minInicioAtras * 60000);
    const par = await prisma.par.create({
      data: {
        codigo,
        ofId: of9006.id,
        productoConfiguradoId: prodDiel.id,
        tallaId: tallaA.id,
        estado: opts.estadoFinal as any,
        celulaActual: opts.celulaActual as Celula,
        subPasoActual: (opts.subPasoActual as any) ?? null,
        lineaId: linBasarili?.id ?? null,
        createdAt: new Date(primerEventoTs.getTime() - CORTE_MIN * 60000),
      },
    });

    const eventos = [];
    for (let i = 0; i < opts.pasosACompletar; i++) {
      const [celula, subPaso] = ORDEN[i];
      const minutosAtras = opts.minInicioAtras - i * opts.gapMin;
      // Para Guarnición rotamos entre los 3 operarios para dar variedad al tablero.
      const operarioId =
        celula === 'GUARNICION'
          ? opsGuarn[i % opsGuarn.length].id
          : ids[celula as keyof typeof ids].op;
      eventos.push({
        parId: par.id,
        celula: celula as Celula,
        subPaso: (subPaso as any) ?? null,
        operarioId,
        maquinaId: ids[celula as keyof typeof ids].maq,
        timestamp: new Date(Date.now() - minutosAtras * 60000),
      });
    }
    await prisma.eventoTrazabilidad.createMany({ data: eventos });
    eventosTotales += eventos.length;
    return par;
  }

  // 3 pares TERMINADOS: recorrido completo (13 etapas), terminando "ayer".
  // Arranca ~26h atrás y termina ~24h atrás (gap 10 min × 12 ≈ 2h de recorrido).
  for (let k = 0; k < 3; k++) {
    await crearParHistorico({
      pasosACompletar: 13,
      minInicioAtras: 26 * 60 + k * 5, // escalona los 3 pares
      gapMin: 10,
      estadoFinal: 'TERMINADO',
      celulaActual: 'PT',
      subPasoActual: null,
    });
  }

  // 1 par DEMORADO en Guarnición/STROBEL: último evento (REVISION) hace ~3h
  // (umbral GUARNICION = 30 min → demorado).
  await crearParHistorico({
    pasosACompletar: 7, // hasta REVISION (índice 6)
    minInicioAtras: 3 * 60 + 60, // primer evento 4h atrás; último (REVISION) ~3h atrás
    gapMin: 10,
    estadoFinal: 'EN_PROCESO',
    celulaActual: 'GUARNICION',
    subPasoActual: 'STROBEL',
  });

  // 1 par DEMORADO en Inyección: último evento (ALMACEN) hace ~2h
  // (umbral INYECCION = 45 min → demorado).
  await crearParHistorico({
    pasosACompletar: 11, // hasta ALMACEN (índice 10)
    minInicioAtras: 2 * 60 + 100, // primer evento ~3h40 atrás; último (ALMACEN) ~2h atrás
    gapMin: 10,
    estadoFinal: 'EN_PROCESO',
    celulaActual: 'INYECCION',
    subPasoActual: null,
  });

  // 1 par RECIENTE (no demorado): último evento hace pocos minutos → sin alerta.
  await crearParHistorico({
    pasosACompletar: 4, // hasta CIERRE (índice 3)
    minInicioAtras: 35, // primer evento 35 min atrás; último (CIERRE) ~5 min atrás
    gapMin: 10,
    estadoFinal: 'EN_PROCESO',
    celulaActual: 'GUARNICION',
    subPasoActual: 'PREFORMADO',
  });

  console.log(`  OP-9006 (driver Indicadores): ${seqPar} pares históricos, ${eventosTotales} eventos`);

  // ── Historia de cartera: factura VENCIDA e impaga de Minera El Roble (driver de Cartera D10) ──
  // Venta pasada despachada y facturada hace ~105 días con plazo D60 → venció hace ~45 días.
  // Da soporte real al estado VENCIDO del cliente y al saldo vencido en el dashboard de cartera.

  // Limpieza idempotente de la cadena histórica 9000 (no estaba en la limpieza
  // general y rompía la re-ejecución del seed por el unique de consecutivo).
  await prisma.pago.deleteMany({ where: { factura: { despacho: { op: { consecutivo: 9000 } } } } });
  await prisma.facturaLinea.deleteMany({ where: { factura: { despacho: { op: { consecutivo: 9000 } } } } });
  await prisma.factura.deleteMany({ where: { despacho: { op: { consecutivo: 9000 } } } });
  await prisma.despachoLinea.deleteMany({ where: { despacho: { op: { consecutivo: 9000 } } } });
  await prisma.despacho.deleteMany({ where: { op: { consecutivo: 9000 } } });
  await prisma.ordenProduccion.deleteMany({ where: { consecutivo: 9000 } });
  await prisma.ordenCompraLineaTalla.deleteMany({ where: { ocLinea: { oc: { consecutivo: 9000 } } } });
  await prisma.ordenCompraLinea.deleteMany({ where: { oc: { consecutivo: 9000 } } });
  await prisma.ordenCompra.deleteMany({ where: { consecutivo: 9000 } });

  const ocHist = await prisma.ordenCompra.create({
    data: {
      consecutivo: 9000,
      clienteId: clienteVencido.id,
      estado: 'CERRADA',
      lineaId: linBasarili?.id ?? null,
      lineas: {
        create: [
          {
            productoConfiguradoId: prodDiel.id,
            precioUnitario: 85000,
            tallas: { create: [{ tallaId: tallaA.id, cantidad: 10 }] },
          },
        ],
      },
    },
  });
  const opHist = await prisma.ordenProduccion.create({
    data: { consecutivo: 9000, ocId: ocHist.id, estado: 'DESPACHADA', lineaId: linBasarili?.id ?? null },
  });
  const despHist = await prisma.despacho.create({
    data: {
      consecutivo: await siguienteConsecutivo(prisma, 'despacho'),
      opId: opHist.id,
      lineas: { create: [{ productoConfiguradoId: prodDiel.id, tallaId: tallaA.id, bodegaId: ibg.id, cantidad: 10 }] },
    },
  });
  const fechaHist = new Date();
  fechaHist.setDate(fechaHist.getDate() - 105);
  const vencHist = new Date(fechaHist);
  vencHist.setDate(vencHist.getDate() + 60); // D60
  const subtotalHist = 10 * 85000; // 850.000
  const ivaHist = Math.round(subtotalHist * 0.19); // 161.500
  await prisma.factura.create({
    data: {
      consecutivo: await siguienteConsecutivo(prisma, 'factura'),
      despachoId: despHist.id,
      fecha: fechaHist,
      fechaVencimiento: vencHist,
      ivaPct: 19,
      subtotal: subtotalHist,
      iva: ivaHist,
      total: subtotalHist + ivaHist,
      estado: 'EMITIDA',
      lineas: { create: [{ productoConfiguradoId: prodDiel.id, tallaId: tallaA.id, cantidad: 10, precioUnitario: 85000, subtotal: subtotalHist }] },
    },
  });
  console.log('  Cartera: factura vencida (impaga, ~45 días) de Minera El Roble');

  // ── Demo 12: kardex histórico de materia prima (coherente con el stock) ──
  // Los movimientos de PT los generan los hooks reales (producción/despacho);
  // acá solo se siembra la historia de MP. Idempotente: borra y recrea los de MP.
  await prisma.movimientoInventario.deleteMany({ where: { materialId: { not: null } } });
  const matPorCodigo = async (codigo: string) =>
    (await prisma.material.findUnique({ where: { codigo } }))!;
  const suelaBase = await matPorCodigo('SUELA-BASE');
  const microNeg = await matPorCodigo('MICRO-NEG');
  const diasAtras = (d: number) => new Date(Date.now() - d * 24 * 60 * 60000);
  await prisma.movimientoInventario.createMany({
    data: [
      // SUELA-BASE: +300 compra − 50 consumo = 250 (stock actual del seed)
      {
        tipo: 'ENTRADA', motivo: 'COMPRA', materialId: suelaBase.id, cantidad: 300,
        referencia: 'OC-PROV-101', observaciones: 'Recepción completa', createdAt: diasAtras(20),
      },
      {
        tipo: 'SALIDA', motivo: 'CONSUMO_PRODUCCION', materialId: suelaBase.id, cantidad: 50,
        referencia: 'OF-9001', createdAt: diasAtras(10),
      },
      // MICRO-NEG: +20 compra − 5 consumo − 3 devolución = 12 m (stock actual)
      {
        tipo: 'ENTRADA', motivo: 'COMPRA', materialId: microNeg.id, cantidad: 20,
        referencia: 'OC-PROV-102', observaciones: 'Recepción parcial: pedidos 30 m, llegaron 20 m', createdAt: diasAtras(15),
      },
      {
        tipo: 'SALIDA', motivo: 'CONSUMO_PRODUCCION', materialId: microNeg.id, cantidad: 5,
        referencia: 'OF-9005', createdAt: diasAtras(6),
      },
      {
        tipo: 'SALIDA', motivo: 'DEVOLUCION_PROVEEDOR', materialId: microNeg.id, cantidad: 3,
        referencia: 'DEV-PROV-01', observaciones: 'Lote con defectos de calidad — devuelto a Curtiembre Andina', createdAt: diasAtras(4),
      },
    ],
  });
  console.log('  Demo 12: 5 movimientos de kardex MP (compra, recepción parcial, consumo, devolución a proveedor)');

  // ── Demo 13: OCP a proveedor con recepción parcial + devolución ──
  // Le pone documentos reales a la historia del kardex de Demo 12: la entrada
  // parcial de 20 m de MICRO-NEG y la devolución de 3 m ahora salen de una OCP.
  // Idempotente: borra y recrea (hijos primero por FK).
  await prisma.recepcionCompraLinea.deleteMany({});
  await prisma.recepcionCompra.deleteMany({});
  await prisma.devolucionProveedorLinea.deleteMany({});
  await prisma.devolucionProveedor.deleteMany({});
  await prisma.ordenCompraProveedorLinea.deleteMany({});
  await prisma.ordenCompraProveedor.deleteMany({});

  const consecOcp = await siguienteConsecutivo(prisma, 'ocp');
  const ocpDemo = await prisma.ordenCompraProveedor.create({
    data: {
      consecutivo: consecOcp,
      proveedorId: curtiembre.id,
      estado: 'PARCIAL', // histórico sembrado; en runtime el estado lo deriva el service
      fecha: diasAtras(16),
      observaciones: 'Microfibra negra para producción (pedido 30 m)',
      lineas: { create: [{ materialId: microNeg.id, cantPedida: 30, cantRecibida: 20 }] },
    },
    include: { lineas: true },
  });
  await prisma.recepcionCompra.create({
    data: {
      consecutivo: await siguienteConsecutivo(prisma, 'recepcion'),
      ocpId: ocpDemo.id,
      fecha: diasAtras(15),
      observaciones: 'Llegaron 20 de 30 m — backorder de 10 m',
      lineas: { create: [{ ocpLineaId: ocpDemo.lineas[0].id, cantidad: 20 }] },
    },
  });
  await prisma.devolucionProveedor.create({
    data: {
      consecutivo: await siguienteConsecutivo(prisma, 'devolucion'),
      ocpId: ocpDemo.id,
      fecha: diasAtras(4),
      causa: 'Lote con defectos de calidad',
      observaciones: 'Devuelto a Curtiembre Andina',
      lineas: { create: [{ materialId: microNeg.id, cantidad: 3 }] },
    },
  });
  // Alinear las referencias del kardex de Demo 12 con la OCP real
  await prisma.movimientoInventario.updateMany({
    where: { referencia: { in: ['OC-PROV-102', 'DEV-PROV-01'] } },
    data: { referencia: `OCP-${consecOcp}` },
  });
  console.log(`  Demo 13: OCP-${consecOcp} (Curtiembre, 30 m pedidos / 20 recibidos, PARCIAL) + recepción + devolución`);

  // ───────── Demo 14: Reporte diario gerencial — metas + actividad del mes ─────────
  // Genera actividad distribuida a lo largo del MES ACTUAL (el que el endpoint
  // consulta por defecto) para que el reporte luzca como el Excel del dueño:
  // producción por célula/día, pares vendidos + valor, kardex PT y % de metas.
  const ahora = new Date();
  const anioRep = ahora.getUTCFullYear();
  const mesRep = ahora.getUTCMonth() + 1; // 1..12
  const diaUTC = (d: number, h = 8) => new Date(Date.UTC(anioRep, mesRep - 1, d, h, 0, 0));

  // Metas del mes según el Excel del dueño. Upsert MANUAL (mismo patrón que el
  // service): el unique compuesto anio+mes+tipo+lineaId no cubre lineaId NULL en PG.
  async function upsertMeta(tipo: TipoMeta, valor: number, lineaId: number | null) {
    const existente = await prisma.meta.findFirst({
      where: { anio: anioRep, mes: mesRep, tipo, lineaId },
    });
    if (existente) await prisma.meta.update({ where: { id: existente.id }, data: { valor } });
    else await prisma.meta.create({ data: { anio: anioRep, mes: mesRep, tipo, valor, lineaId } });
  }

  // Metas globales (lineaId NULL = las del Excel).
  // Guarnición e Inyección salen del Excel del dueño. Corte, Almacén y PT son
  // metas por célula nuevas (Entrega 5): se siembran al mismo ritmo de la cadena
  // (una bota pasa por las 5) hasta que JP pase la hoja con los objetivos reales.
  const META_CADENA = 20160;
  await upsertMeta('CORTE', META_CADENA, null);
  await upsertMeta('GUARNICION', META_CADENA, null);
  await upsertMeta('ALMACEN', META_CADENA, null);
  await upsertMeta('INYECCION', META_CADENA, null);
  await upsertMeta('PT', META_CADENA, null);
  await upsertMeta('FACTURACION_PARES', 30240, null);
  await upsertMeta('FACTURACION_VALOR', 1445895360, null);

  // Metas por línea (reporte por línea, Entrega 3). Feroz arranca en INYECCIÓN
  // (servicio a la capellada de Bogotá): no tiene metas de corte, guarnición ni
  // almacén, ni de facturación de pares — su servicio se factura aparte.
  const METAS_LINEA: {
    linea: typeof linBasarili;
    cadena: number | null; // corte + guarnición + almacén (las células de arranque)
    inyeccion: number;
    factPares: number | null;
    factValor: number | null;
  }[] = [
    { linea: linBasarili, cadena: 9072, inyeccion: 9072, factPares: 15120, factValor: 722947680 },
    { linea: linAgro, cadena: 6048, inyeccion: 6048, factPares: 10080, factValor: 481965120 },
    { linea: linAlta, cadena: 3024, inyeccion: 3024, factPares: 5040, factValor: 240982560 },
    { linea: linFeroz, cadena: null, inyeccion: 2016, factPares: null, factValor: null },
  ];
  for (const m of METAS_LINEA) {
    if (!m.linea) continue;
    if (m.cadena != null) {
      await upsertMeta('CORTE', m.cadena, m.linea.id);
      await upsertMeta('GUARNICION', m.cadena, m.linea.id);
      await upsertMeta('ALMACEN', m.cadena, m.linea.id);
    }
    await upsertMeta('INYECCION', m.inyeccion, m.linea.id);
    await upsertMeta('PT', m.inyeccion, m.linea.id); // todo lo inyectado termina en PT
    if (m.factPares != null) await upsertMeta('FACTURACION_PARES', m.factPares, m.linea.id);
    if (m.factValor != null) await upsertMeta('FACTURACION_VALOR', m.factValor, m.linea.id);
  }

  // (La limpieza idempotente de las OPs de producción D14 ocurre arriba, junto a la
  //  limpieza MES, para liberar las FKs de máquinas/operarios antes de su borrado global.)

  // inventarioPT destino (talla A del producto DIEL en Ibagué — tiene stock por el seed).
  const invPT = await prisma.inventarioPT.findUniqueOrThrow({
    where: {
      productoConfiguradoId_tallaId_bodegaId_calidad: {
        productoConfiguradoId: prodDiel.id,
        tallaId: tallaA.id,
        bodegaId: ibg.id,
        calidad: 'PRIMERA',
      },
    },
  });

  // Producción del mes: cantidades por día hábil (≈ Excel del dueño, ~20.000 pares para
  // que el % contra las metas reales sea creíble). Cada par recorre las 5 células ese día.
  const PRODUCCION_DIA: { d: number; cant: number }[] = [
    { d: 2, cant: 1200 }, { d: 3, cant: 1440 }, { d: 4, cant: 1440 }, { d: 5, cant: 1522 },
    { d: 6, cant: 1440 }, { d: 9, cant: 1276 }, { d: 10, cant: 1608 }, { d: 11, cant: 1440 },
    { d: 12, cant: 1440 }, { d: 13, cant: 1440 }, { d: 16, cant: 1343 }, { d: 17, cant: 1440 },
    { d: 18, cant: 1440 }, { d: 19, cant: 1451 },
  ];

  async function enLotes<T>(items: T[], tam: number, fn: (lote: T[]) => Promise<unknown>) {
    for (let i = 0; i < items.length; i += tam) await fn(items.slice(i, i + tam));
  }

  // 1) La producción del mes se reparte entre las 4 líneas (reporte por línea,
  // Entrega 3): una cadena OC→OP→OF por línea. Basarili absorbe el residuo del
  // redondeo para que el total del día no cambie.
  const PROD_LINEAS: { cons: number; linea: typeof linBasarili; frac: number }[] = [
    { cons: 9014, linea: linBasarili, frac: 0.45 },
    { cons: 9018, linea: linAgro, frac: 0.3 },
    { cons: 9019, linea: linAlta, frac: 0.15 },
    { cons: 9020, linea: linFeroz, frac: 0.1 },
  ];
  const repartoDia = PRODUCCION_DIA.map(({ d, cant }) => {
    const agro = Math.round(cant * 0.3);
    const alta = Math.round(cant * 0.15);
    const feroz = Math.round(cant * 0.1);
    const porCons: Record<number, number> = {
      9014: cant - agro - alta - feroz,
      9018: agro,
      9019: alta,
      9020: feroz,
    };
    return { d, porCons };
  });

  // Un evento por par en cada célula (Guarnición solo AMARRE), todos en el día del par.
  // Feroz arranca en INYECCION (capellada llega de Bogotá): sin corte/guarnición/almacén.
  const ETAPAS: { cel: Celula; sub: string | null; h: number }[] = [
    { cel: Celula.CORTE, sub: null, h: 6 },
    { cel: Celula.GUARNICION, sub: 'AMARRE', h: 8 },
    { cel: Celula.ALMACEN, sub: null, h: 10 },
    { cel: Celula.INYECCION, sub: null, h: 12 },
    { cel: Celula.PT, sub: null, h: 14 },
  ];

  // Segundas de la demo: 1 de cada 60 pares (≈1,7%), repartidas entre los 3 motivos
  // del catálogo. La célula de detección es la que causa el defecto.
  const TASA_SEGUNDAS = 60;
  const TIPOS_SEGUNDA: { codigo: string; deteccion: Celula; descripcion: string }[] = [
    { codigo: 'MANCHA-CUERO', deteccion: Celula.CORTE, descripcion: 'Mancha visible en la pieza de caña' },
    { codigo: 'TONO-DISPAREJO', deteccion: Celula.GUARNICION, descripcion: 'Diferencia de tono entre lateral y talón' },
    { codigo: 'REBABA-SUELA', deteccion: Celula.INYECCION, descripcion: 'Rebaba de PU en el borde de la suela' },
  ];
  const tiposSegundaBD = await prisma.tipoDano.findMany({
    where: { codigo: { in: TIPOS_SEGUNDA.map((t) => t.codigo) } },
    select: { id: true, codigo: true },
  });
  const idsTipoSegunda = Object.fromEntries(tiposSegundaBD.map((t) => [t.codigo, t.id]));

  let totalParesD14 = 0;
  let totalSegundasD14 = 0;
  for (const cadena of PROD_LINEAS) {
    const totalCadena = repartoDia.reduce((a, r) => a + r.porCons[cadena.cons], 0);
    const ocProd = await prisma.ordenCompra.create({
      data: {
        consecutivo: cadena.cons,
        clienteId: clienteAlDia.id,
        estado: 'EN_PRODUCCION',
        lineaId: cadena.linea?.id ?? null,
        lineas: {
          create: [
            {
              productoConfiguradoId: prodDiel.id,
              precioUnitario: 85000,
              tallas: { create: [{ tallaId: tallaA.id, cantidad: totalCadena }] },
            },
          ],
        },
      },
    });
    const opProd = await prisma.ordenProduccion.create({
      data: { consecutivo: cadena.cons, ocId: ocProd.id, estado: 'EN_PRODUCCION', lineaId: cadena.linea?.id ?? null },
    });
    const ofProd = await prisma.ordenFabricacion.create({
      data: { consecutivo: await siguienteConsecutivo(prisma, 'of'), opId: opProd.id, estado: 'TERMINADA' },
    });

    // Pares terminados (en lotes para no exceder el límite de parámetros de Postgres).
    let seq = 0;
    const paresData: any[] = [];
    for (const r of repartoDia) {
      for (let i = 0; i < r.porCons[cadena.cons]; i++) {
        seq++;
        paresData.push({
          codigo: `OF${cadena.cons}-${String(seq).padStart(5, '0')}`,
          ofId: ofProd.id,
          productoConfiguradoId: prodDiel.id,
          tallaId: tallaA.id,
          estado: 'TERMINADO' as const,
          celulaActual: Celula.PT,
          // 1 de cada 60 sale de segunda (≈1,7%): determinista para que el seed
          // sea reproducible, y en el orden de magnitud del dato real de Feroz.
          calidad: seq % TASA_SEGUNDAS === 0 ? 'SEGUNDA' as const : 'PRIMERA' as const,
          lineaId: cadena.linea?.id ?? null,
          createdAt: diaUTC(r.d, 5),
        });
      }
    }
    await enLotes(paresData, 2000, (lote) => prisma.par.createMany({ data: lote }));
    const pares = await prisma.par.findMany({
      where: { ofId: ofProd.id },
      select: { id: true, createdAt: true, calidad: true },
    });
    totalParesD14 += pares.length;

    // Cada segunda lleva su incidencia: sin motivo registrado, el % de segundas
    // por centro de costo saldría en cero y la columna quedaría sin explicación.
    const segundasCadena = pares.filter((p) => p.calidad === 'SEGUNDA');
    const incidenciasSegunda = segundasCadena.map((p, i) => {
      const tipo = TIPOS_SEGUNDA[i % TIPOS_SEGUNDA.length];
      return {
        parId: p.id,
        tipoDanoId: idsTipoSegunda[tipo.codigo],
        celulaDeteccion: tipo.deteccion,
        operarioId: ids[tipo.deteccion].op,
        descripcion: tipo.descripcion,
        timestamp: new Date(new Date(p.createdAt).getTime() + 6 * 3600_000),
      };
    });
    await enLotes(incidenciasSegunda, 2000, (lote) =>
      prisma.incidenciaCalidad.createMany({ data: lote }),
    );
    totalSegundasD14 += segundasCadena.length;

    const etapas =
      cadena.linea?.celulaInicial === 'INYECCION'
        ? ETAPAS.filter((e) => e.cel === Celula.INYECCION || e.cel === Celula.PT)
        : ETAPAS;
    const eventosCadena: any[] = [];
    for (const p of pares) {
      const dia = new Date(p.createdAt).getUTCDate();
      for (const e of etapas) {
        eventosCadena.push({
          parId: p.id,
          celula: e.cel,
          subPaso: (e.sub as any) ?? null,
          operarioId: ids[e.cel].op,
          maquinaId: ids[e.cel].maq,
          timestamp: diaUTC(dia, e.h),
        });
      }
    }
    await enLotes(eventosCadena, 5000, (lote) => prisma.eventoTrazabilidad.createMany({ data: lote }));
    console.log(
      `  Demo 14: OP-${cadena.cons} → ${cadena.linea?.codigo ?? 'SIN LÍNEA'}: ${pares.length} pares (${etapas.length} etapas/par, ${segundasCadena.length} de segunda)`,
    );
  }

  // 3) Entrada de producción al kardex de PT: una por día y por línea (no una por par).
  // La línea queda sellada en el movimiento (kardex PT por línea); el total diario
  // no cambia porque el reparto ya cuadra el residuo del redondeo en Basarili.
  const movProdD14 = repartoDia.flatMap(({ d, porCons }) =>
    PROD_LINEAS.map((cadena) => ({
      tipo: 'ENTRADA' as const,
      motivo: 'PRODUCCION' as const,
      inventarioPTId: invPT.id,
      cantidad: porCons[cadena.cons],
      referencia: 'D14-PROD',
      lineaId: cadena.linea?.id ?? null,
      createdAt: diaUTC(d, 14),
    })),
  );
  await prisma.movimientoInventario.createMany({ data: movProdD14 });

  // Saldo inicial de bodega al arrancar el mes (último día del mes previo), para soportar
  // ventas que salen de stock acumulado (como en el Excel: la bodega ronda ~25.000 pares).
  // Repartido por línea (40/30/20/10) para que el kardex filtrado nunca quede negativo:
  // Alta vende sobre su meta (7.500) y necesita colchón mayor que su 15% de producción.
  const SALDO_INI_LINEAS = [
    { linea: linBasarili, cant: 12000 },
    { linea: linAgro, cant: 9000 },
    { linea: linAlta, cant: 6000 },
    { linea: linFeroz, cant: 3000 },
  ];
  await prisma.movimientoInventario.createMany({
    data: SALDO_INI_LINEAS.map(({ linea, cant }) => ({
      tipo: 'ENTRADA' as const,
      motivo: 'PRODUCCION' as const,
      inventarioPTId: invPT.id,
      cantidad: cant,
      referencia: 'D14-SALDOINI',
      lineaId: linea?.id ?? null,
      createdAt: new Date(Date.UTC(anioRep, mesRep - 1, 0, 12)),
    })),
  });

  // Saldo de SEGUNDAS en bodega: mismo producto/talla/bodega, otro grado. Se ve en
  // el inventario como una fila aparte con su badge, nunca mezclado con las primeras
  // (y el amarre de pedidos jamás lo toca).
  const invPTSegunda = await prisma.inventarioPT.upsert({
    where: {
      productoConfiguradoId_tallaId_bodegaId_calidad: {
        productoConfiguradoId: prodDiel.id,
        tallaId: tallaA.id,
        bodegaId: ibg.id,
        calidad: 'SEGUNDA',
      },
    },
    update: { cantDisponible: totalSegundasD14 },
    create: {
      productoConfiguradoId: prodDiel.id,
      tallaId: tallaA.id,
      bodegaId: ibg.id,
      calidad: 'SEGUNDA',
      cantDisponible: totalSegundasD14,
    },
  });
  await prisma.movimientoInventario.create({
    data: {
      tipo: 'ENTRADA',
      motivo: 'PRODUCCION',
      inventarioPTId: invPTSegunda.id,
      cantidad: totalSegundasD14,
      referencia: 'D14-SEGUNDAS',
      createdAt: new Date(Date.UTC(anioRep, mesRep - 1, 0, 12)),
    },
  });

  // Ventas del mes: 3 cadenas OC→OP→Despacho→Factura (Despacho tiene opId único,
  // por eso cada venta lleva su propia OP) en días dispersos. ~25.500 pares (≈84% de la
  // meta) al precio medio implícito en la meta del Excel ($1.445.895.360 / 30.240).
  // Cada venta sale por una línea distinta (facturación por línea vía despacho.op.lineaId):
  // Alta queda SOBRE su meta y Basarili por debajo — variedad para el reporte por línea.
  // Feroz no factura pares (el servicio de inyección se factura aparte, aún sin modelar).
  const PRECIO_PAR = 47814;
  const VENTAS_D14 = [
    { cons: 9015, d: 6, cant: 9000, linea: linBasarili },
    { cons: 9016, d: 12, cant: 9000, linea: linAgro },
    { cons: 9017, d: 19, cant: 7500, linea: linAlta },
  ];
  for (const v of VENTAS_D14) {
    const ocv = await prisma.ordenCompra.create({
      data: {
        consecutivo: v.cons,
        clienteId: clienteAlDia.id,
        estado: 'CERRADA',
        lineaId: v.linea?.id ?? null,
        lineas: {
          create: [
            {
              productoConfiguradoId: prodDiel.id,
              precioUnitario: PRECIO_PAR,
              tallas: { create: [{ tallaId: tallaA.id, cantidad: v.cant }] },
            },
          ],
        },
      },
    });
    const opv = await prisma.ordenProduccion.create({
      data: { consecutivo: v.cons, ocId: ocv.id, estado: 'DESPACHADA', lineaId: v.linea?.id ?? null },
    });
    const desp = await prisma.despacho.create({
      data: {
        consecutivo: await siguienteConsecutivo(prisma, 'despacho'),
        opId: opv.id,
        fecha: diaUTC(v.d, 15),
        lineas: { create: [{ productoConfiguradoId: prodDiel.id, tallaId: tallaA.id, bodegaId: ibg.id, cantidad: v.cant }] },
      },
    });
    const subtotal = v.cant * PRECIO_PAR;
    const iva = Math.round(subtotal * 0.19);
    const venc = diaUTC(v.d, 16);
    venc.setUTCDate(venc.getUTCDate() + 30);
    await prisma.factura.create({
      data: {
        consecutivo: await siguienteConsecutivo(prisma, 'factura'),
        despachoId: desp.id,
        fecha: diaUTC(v.d, 16),
        fechaVencimiento: venc,
        ivaPct: 19,
        subtotal,
        iva,
        total: subtotal + iva,
        estado: 'EMITIDA',
        lineas: { create: [{ productoConfiguradoId: prodDiel.id, tallaId: tallaA.id, cantidad: v.cant, precioUnitario: PRECIO_PAR, subtotal }] },
      },
    });
    await prisma.movimientoInventario.create({
      data: {
        tipo: 'SALIDA',
        motivo: 'DESPACHO',
        inventarioPTId: invPT.id,
        cantidad: v.cant,
        referencia: 'D14-DESP',
        lineaId: v.linea?.id ?? null,
        createdAt: diaUTC(v.d, 15),
      },
    });
  }
  const totalVendidos = VENTAS_D14.reduce((a, v) => a + v.cant, 0);
  console.log(
    `  Demo 14 (reporte diario): metas Excel del mes ${mesRep}/${anioRep} (globales + por célula + por línea) + ${totalParesD14} pares producidos en ${PRODUCCION_DIA.length} días repartidos en ${PROD_LINEAS.length} líneas (${totalSegundasD14} de segunda, con su incidencia), ${VENTAS_D14.length} facturas (${totalVendidos} pares vendidos)`,
  );

  console.log('Seed demo OK:', {
    clientes: clientes.length,
    productos: productos.length,
    gerente: 'gerente / gerente123',
    clienteAlDia: `${clienteAlDia.nombre} (NIT ${clienteAlDia.nit})`,
    clienteVencido: `${clienteVencido.nombre} (NIT ${clienteVencido.nit})`,
    tallasDemo: `${tallaA.valor} y ${tallaB.valor}`,
    op9001: `OP#${op9001.consecutivo} → ${clienteAlDia.nombre} (AL_DIA) — camino feliz`,
    op9002: `OP#${op9002.consecutivo} → ${clienteVencido.nombre} (VENCIDO) — camino bloqueado`,
    op9003: `OP#${op9003.consecutivo} → ${clienteAlDia.nombre} — 200 pares A PRODUCIR (driver de Compras)`,
    op9005: `OP#${op9005.consecutivo} → ${clienteAlDia.nombre} — 12 pares A PRODUCIR (driver MES)`,
    op9006: 'OF histórica: 6 pares con eventos para indicadores',
    umbrales: `${umbrales.length} umbrales de demora por célula`,
    tiposDano: tiposDano.length,
    proveedores: `${curtiembre.nombre}, ${quimicos.nombre}, ${herrajes.nombre}`,
    stockInsumos: 'SUELA-BASE=250 (neto 0), MICRO-NEG=12 (parcial), POLIOL=sin stock (todo a comprar)',
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
