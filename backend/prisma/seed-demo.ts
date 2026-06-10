import 'dotenv/config';
import { PrismaClient, Celula, ClaseDano } from '@prisma/client';
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
}) {
  const oc = await prisma.ordenCompra.create({
    data: {
      consecutivo: opts.consecutivoOC,
      clienteId: opts.clienteId,
      estado: 'CONFIRMADA',
      lineas: {
        create: [
          {
            productoConfiguradoId: opts.productoConfiguradoId,
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
    const inv = await prisma.inventarioPT.findUnique({
      where: {
        productoConfiguradoId_tallaId_bodegaId: {
          productoConfiguradoId: opts.productoConfiguradoId,
          tallaId: t.tallaId,
          bodegaId: opts.bodegaId,
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
            productoConfiguradoId_tallaId_bodegaId: {
              productoConfiguradoId: p.id,
              tallaId: t.id,
              bodegaId: ibg.id,
            },
          },
          create: {
            productoConfiguradoId: p.id,
            tallaId: t.id,
            bodegaId: ibg.id,
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
  await prisma.maquina.deleteMany({});
  await prisma.operario.deleteMany({});

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
      lineas: {
        create: [
          {
            productoConfiguradoId: prodDiel.id,
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
    data: { consecutivo: 9003, ocId: oc9003.id, estado: 'EN_PRODUCCION' },
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
  for (const c of celulas) {
    await prisma.operario.create({ data: { nombre: nombresOperario[c], celula: c } });
    await prisma.maquina.create({
      data: { codigo: `MAQ-${c}`, nombre: nombresMaquina[c], celula: c },
    });
  }

  // Operarios extra de Guarnición para poblar el sub-tablero (D7)
  await prisma.operario.create({ data: { nombre: 'Sofía Costuras', celula: 'GUARNICION' } });
  await prisma.operario.create({ data: { nombre: 'Marta Hilván', celula: 'GUARNICION' } });

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
      lineas: {
        create: [
          {
            productoConfiguradoId: prodDiel.id,
            tallas: { create: [{ tallaId: tallaA.id, cantidad: 6 }, { tallaId: tallaB.id, cantidad: 6 }] },
          },
        ],
      },
    },
  });
  const op9005 = await prisma.ordenProduccion.create({
    data: { consecutivo: 9005, ocId: oc9005.id, estado: 'EN_PRODUCCION' },
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
      lineas: {
        create: [
          {
            productoConfiguradoId: prodDiel.id,
            tallas: { create: [{ tallaId: tallaA.id, cantidad: 6 }] },
          },
        ],
      },
    },
  });
  const op9006 = await prisma.ordenProduccion.create({
    data: { consecutivo: 9006, ocId: oc9006.id, estado: 'EN_PRODUCCION' },
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
    const par = await prisma.par.create({
      data: {
        codigo,
        ofId: of9006.id,
        productoConfiguradoId: prodDiel.id,
        tallaId: tallaA.id,
        estado: opts.estadoFinal as any,
        celulaActual: opts.celulaActual as Celula,
        subPasoActual: (opts.subPasoActual as any) ?? null,
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
