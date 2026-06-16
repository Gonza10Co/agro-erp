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
  // Limpieza idempotente de la actividad Demo 14: OP de producción 9014 + cadenas
  // de venta 9015-9017 + movimientos D14-*. Va ANTES del borrado global de
  // máquinas/operarios: los eventos de la 9014 los referencian.
  const CONS_D14 = [9014, 9015, 9016, 9017];
  await prisma.pago.deleteMany({ where: { factura: { despacho: { op: { consecutivo: { in: CONS_D14 } } } } } });
  await prisma.facturaLinea.deleteMany({ where: { factura: { despacho: { op: { consecutivo: { in: CONS_D14 } } } } } });
  await prisma.factura.deleteMany({ where: { despacho: { op: { consecutivo: { in: CONS_D14 } } } } });
  await prisma.movimientoInventario.deleteMany({ where: { referencia: { startsWith: 'D14-' } } });
  await prisma.despachoLinea.deleteMany({ where: { despacho: { op: { consecutivo: { in: CONS_D14 } } } } });
  await prisma.despacho.deleteMany({ where: { op: { consecutivo: { in: CONS_D14 } } } });
  await prisma.eventoTrazabilidad.deleteMany({ where: { par: { of: { op: { consecutivo: 9014 } } } } });
  await prisma.par.deleteMany({ where: { of: { op: { consecutivo: 9014 } } } });
  await prisma.ordenFabricacion.deleteMany({ where: { op: { consecutivo: 9014 } } });
  await prisma.ordenProduccion.deleteMany({ where: { consecutivo: { in: CONS_D14 } } });
  await prisma.ordenCompraLineaTalla.deleteMany({ where: { ocLinea: { oc: { consecutivo: { in: CONS_D14 } } } } });
  await prisma.ordenCompraLinea.deleteMany({ where: { oc: { consecutivo: { in: CONS_D14 } } } });
  await prisma.ordenCompra.deleteMany({ where: { consecutivo: { in: CONS_D14 } } });

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
            precioUnitario: 85000,
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
            precioUnitario: 85000,
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
    data: { consecutivo: 9000, ocId: ocHist.id, estado: 'DESPACHADA' },
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

  // Metas del mes (idempotente por unique anio+mes+tipo). Calibradas a ~76-80% de cumplimiento.
  const metasDemo = [
    { tipo: 'GUARNICION' as const, valor: 60 },
    { tipo: 'INYECCION' as const, valor: 60 },
    { tipo: 'FACTURACION_PARES' as const, valor: 25 },
    { tipo: 'FACTURACION_VALOR' as const, valor: 2400000 },
  ];
  for (const m of metasDemo) {
    await prisma.meta.upsert({
      where: { anio_mes_tipo: { anio: anioRep, mes: mesRep, tipo: m.tipo } },
      update: { valor: m.valor },
      create: { anio: anioRep, mes: mesRep, tipo: m.tipo, valor: m.valor },
    });
  }

  // (La limpieza idempotente de la OP 9014 ocurre arriba, junto a la limpieza MES,
  //  para liberar las FKs de máquinas/operarios antes de su borrado global.)
  const oc9014 = await prisma.ordenCompra.create({
    data: {
      consecutivo: 9014,
      clienteId: clienteAlDia.id,
      estado: 'EN_PRODUCCION',
      lineas: {
        create: [
          {
            productoConfiguradoId: prodDiel.id,
            precioUnitario: 85000,
            tallas: { create: [{ tallaId: tallaA.id, cantidad: 60 }] },
          },
        ],
      },
    },
  });
  const op9014 = await prisma.ordenProduccion.create({
    data: { consecutivo: 9014, ocId: oc9014.id, estado: 'EN_PRODUCCION' },
  });
  const of9014 = await prisma.ordenFabricacion.create({
    data: { consecutivo: await siguienteConsecutivo(prisma, 'of'), opId: op9014.id, estado: 'TERMINADA' },
  });

  // inventarioPT destino (talla A del producto DIEL en Ibagué — tiene stock por el seed).
  const invPT = await prisma.inventarioPT.findUniqueOrThrow({
    where: {
      productoConfiguradoId_tallaId_bodegaId: {
        productoConfiguradoId: prodDiel.id,
        tallaId: tallaA.id,
        bodegaId: ibg.id,
      },
    },
  });

  // Pares terminados, 4 por día hábil, recorriendo todas las células ese mismo día.
  const DIAS_ACTIVOS = [2, 3, 4, 5, 6, 9, 10, 11, 12, 13];
  const PARES_DIA = 4;
  let seqD14 = 0;
  for (const d of DIAS_ACTIVOS) {
    const paresData = [];
    for (let i = 0; i < PARES_DIA; i++) {
      seqD14++;
      paresData.push({
        codigo: `OF9014-${String(seqD14).padStart(4, '0')}`,
        ofId: of9014.id,
        productoConfiguradoId: prodDiel.id,
        tallaId: tallaA.id,
        estado: 'TERMINADO' as const,
        celulaActual: Celula.PT,
        createdAt: diaUTC(d, 5),
      });
    }
    await prisma.par.createMany({ data: paresData });
  }
  const paresD14 = await prisma.par.findMany({ where: { ofId: of9014.id }, select: { id: true, createdAt: true } });

  // Un evento por par en cada célula, todos en el día del par (distintas horas).
  const ETAPAS: { cel: Celula; sub: string | null; h: number }[] = [
    { cel: Celula.CORTE, sub: null, h: 6 },
    { cel: Celula.GUARNICION, sub: 'AMARRE', h: 8 },
    { cel: Celula.ALMACEN, sub: null, h: 10 },
    { cel: Celula.INYECCION, sub: null, h: 12 },
    { cel: Celula.PT, sub: null, h: 14 },
  ];
  const eventosD14 = [];
  const movProdD14 = [];
  for (const p of paresD14) {
    const dia = new Date(p.createdAt).getUTCDate();
    for (const e of ETAPAS) {
      eventosD14.push({
        parId: p.id,
        celula: e.cel,
        subPaso: (e.sub as any) ?? null,
        operarioId: ids[e.cel].op,
        maquinaId: ids[e.cel].maq,
        timestamp: diaUTC(dia, e.h),
      });
    }
    // Cada par que llega a PT genera una entrada de producción al kardex.
    movProdD14.push({
      tipo: 'ENTRADA' as const,
      motivo: 'PRODUCCION' as const,
      inventarioPTId: invPT.id,
      cantidad: 1,
      referencia: 'D14-PROD',
      createdAt: diaUTC(dia, 14),
    });
  }
  await prisma.eventoTrazabilidad.createMany({ data: eventosD14 });
  await prisma.movimientoInventario.createMany({ data: movProdD14 });

  // Saldo inicial de PT al arrancar el mes (entrada de ajuste el último día del mes previo).
  await prisma.movimientoInventario.create({
    data: {
      tipo: 'ENTRADA',
      motivo: 'PRODUCCION',
      inventarioPTId: invPT.id,
      cantidad: 500,
      referencia: 'D14-SALDOINI',
      createdAt: new Date(Date.UTC(anioRep, mesRep - 1, 0, 12)), // día 0 = último del mes anterior
    },
  });

  // Ventas del mes: 3 cadenas OC→OP→Despacho→Factura (Despacho tiene opId único,
  // por eso cada venta lleva su propia OP) en días dispersos.
  const VENTAS_D14 = [
    { cons: 9015, d: 5, cant: 8 },
    { cons: 9016, d: 9, cant: 6 },
    { cons: 9017, d: 12, cant: 5 },
  ];
  for (const v of VENTAS_D14) {
    const ocv = await prisma.ordenCompra.create({
      data: {
        consecutivo: v.cons,
        clienteId: clienteAlDia.id,
        estado: 'CERRADA',
        lineas: {
          create: [
            {
              productoConfiguradoId: prodDiel.id,
              precioUnitario: 85000,
              tallas: { create: [{ tallaId: tallaA.id, cantidad: v.cant }] },
            },
          ],
        },
      },
    });
    const opv = await prisma.ordenProduccion.create({
      data: { consecutivo: v.cons, ocId: ocv.id, estado: 'DESPACHADA' },
    });
    const desp = await prisma.despacho.create({
      data: {
        consecutivo: await siguienteConsecutivo(prisma, 'despacho'),
        opId: opv.id,
        fecha: diaUTC(v.d, 15),
        lineas: { create: [{ productoConfiguradoId: prodDiel.id, tallaId: tallaA.id, bodegaId: ibg.id, cantidad: v.cant }] },
      },
    });
    const subtotal = v.cant * 85000;
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
        lineas: { create: [{ productoConfiguradoId: prodDiel.id, tallaId: tallaA.id, cantidad: v.cant, precioUnitario: 85000, subtotal }] },
      },
    });
    await prisma.movimientoInventario.create({
      data: {
        tipo: 'SALIDA',
        motivo: 'DESPACHO',
        inventarioPTId: invPT.id,
        cantidad: v.cant,
        referencia: 'D14-DESP',
        createdAt: diaUTC(v.d, 15),
      },
    });
  }
  console.log(
    `  Demo 14 (reporte diario): metas del mes ${mesRep}/${anioRep} + ${paresD14.length} pares en ${DIAS_ACTIVOS.length} días, 3 facturas (19 pares vendidos)`,
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
