import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { describirBase, esBaseDeProduccion } from '../src/prisma/base-url';

/**
 * Limpia de la base los datos de DEMOSTRACIÓN (seed:demo + seed:catalogo + órdenes de corte de
 * ejemplo) y deja intactos los maestros reales del cliente: clientes, catálogo, BOM, marcas,
 * líneas, inventario de MP, operarios, máquinas, tipos de daño, metas, bodegas, servicios,
 * calendario y usuarios. Es el paso previo al arranque en uso real (2026-09-07).
 *
 *   npm run limpiar:demo                       → DRY-RUN: cuenta y lista, no borra nada
 *   npm run limpiar:demo -- --ejecutar         → borra (en una sola transacción)
 *   npm run limpiar:demo -- --ejecutar --prod-confirmado   → obligatorio además si la base es Railway
 *   --sin-reiniciar-consecutivos               → no vuelve a 1 las secuencias de las tablas que quedan vacías
 *
 * Qué es "demo" (marcadores, todos verificables en seed-demo.ts / seed-catalogo.ts / seed-corte.ts):
 *   · productos configurados con código `PC-…` (el generador real nunca produce ese prefijo)
 *   · los 5 clientes y 3 proveedores ficticios (por NIT) · 6 materiales inventados (por código)
 *   · ejes COLOR/SUELA · movimientos `D14-…` · OCs con consecutivo 9000–9999
 *   · órdenes de corte de ejemplo AGR-862/863/880/881 (AGR-861 es la real)
 * Una OC se considera demo si su consecutivo es 9xxx, o su cliente es demo, o TODAS sus líneas
 * son productos demo. Una OC de cliente real con algún producto real NO se toca y se lista.
 */

const CLIENTES_DEMO_NIT = ['900111222', '900333444', '900555666', '900777888', '900999000'];
const PROVEEDORES_DEMO_NIT = ['900111111-1', '900222222-2', '900333333-3'];
const MATERIALES_DEMO = ['MICRO-NEG', 'MICRO-CAF', 'SUELA-BASE', 'SUELA-RIVER', 'PLANT-PU', 'POLIOL'];
const CATEGORIAS_DEMO = ['Cuero', 'Suela', 'Semielaborado'];
const GRUPOS_DEMO = ['COLOR', 'SUELA'];
const ORDENES_CORTE_EJEMPLO = ['AGR-862', 'AGR-863', 'AGR-880', 'AGR-881'];
const REFERENCIAS_MOV_DEMO = ['OC-PROV-101', 'OC-PROV-102', 'OF-9001', 'OF-9005', 'DEV-PROV-01'];
const RANGO_OC_DEMO = { gte: 9000, lte: 9999 };

interface Plan {
  ids: Record<string, number[]>;
  avisos: string[];
  ocsReales: number;
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function clasificar(): Promise<Plan> {
  const ids: Record<string, number[]> = {};
  const avisos: string[] = [];
  const id = (rows: { id: number }[]) => rows.map((r) => r.id);

  // ── Maestros ficticios ──────────────────────────────────────────────────────
  ids.clientes = id(await prisma.cliente.findMany({ where: { nit: { in: CLIENTES_DEMO_NIT } }, select: { id: true } }));
  ids.proveedores = id(await prisma.proveedor.findMany({ where: { nit: { in: PROVEEDORES_DEMO_NIT } }, select: { id: true } }));
  ids.materiales = id(await prisma.material.findMany({ where: { codigo: { in: MATERIALES_DEMO } }, select: { id: true } }));
  ids.productos = id(await prisma.productoConfigurado.findMany({ where: { codigo: { startsWith: 'PC-' } }, select: { id: true } }));
  ids.grupos = id(await prisma.grupoOpcion.findMany({ where: { codigo: { in: GRUPOS_DEMO } }, select: { id: true } }));
  ids.opciones = id(await prisma.opcion.findMany({ where: { grupoOpcionId: { in: ids.grupos } }, select: { id: true } }));

  // ── Pedidos: OC → OP → OF → pares, despachos, facturas ───────────────────────
  const ocs = await prisma.ordenCompra.findMany({
    select: { id: true, consecutivo: true, clienteId: true, lineas: { select: { productoConfiguradoId: true } } },
  });
  const esProductoDemo = new Set(ids.productos);
  const esClienteDemo = new Set(ids.clientes);
  const ocsDemo: number[] = [];
  const mezcladas: number[] = [];
  let ocsReales = 0;
  for (const oc of ocs) {
    const productosDemo = oc.lineas.filter((l) => esProductoDemo.has(l.productoConfiguradoId)).length;
    const todasDemo = oc.lineas.length > 0 && productosDemo === oc.lineas.length;
    if ((oc.consecutivo >= RANGO_OC_DEMO.gte && oc.consecutivo <= RANGO_OC_DEMO.lte) || esClienteDemo.has(oc.clienteId) || todasDemo) {
      ocsDemo.push(oc.id);
    } else if (productosDemo > 0) {
      mezcladas.push(oc.consecutivo);
    } else {
      ocsReales++;
    }
  }
  if (mezcladas.length) {
    avisos.push(`OCs de cliente real que mezclan productos demo y reales, NO se tocan: ${mezcladas.map((c) => `OC-${c}`).join(', ')}`);
  }
  ids.ocs = ocsDemo;
  ids.ocLineas = id(await prisma.ordenCompraLinea.findMany({ where: { ocId: { in: ids.ocs } }, select: { id: true } }));
  ids.ocLineaTallas = id(await prisma.ordenCompraLineaTalla.findMany({ where: { ocLineaId: { in: ids.ocLineas } }, select: { id: true } }));
  ids.ops = id(await prisma.ordenProduccion.findMany({ where: { ocId: { in: ids.ocs } }, select: { id: true } }));
  ids.opLineas = id(await prisma.ordenProduccionLinea.findMany({ where: { opId: { in: ids.ops } }, select: { id: true } }));
  ids.opLineaTallas = id(await prisma.ordenProduccionLineaTalla.findMany({ where: { opLineaId: { in: ids.opLineas } }, select: { id: true } }));
  ids.reservasPT = id(await prisma.reservaInventarioPT.findMany({ where: { opLineaTallaId: { in: ids.opLineaTallas } }, select: { id: true } }));
  ids.requerimientos = id(await prisma.requerimientoCompra.findMany({ where: { opId: { in: ids.ops } }, select: { id: true } }));
  ids.requerimientoLineas = id(await prisma.requerimientoCompraLinea.findMany({
    where: { OR: [{ requerimientoId: { in: ids.requerimientos } }, { materialId: { in: ids.materiales } }] }, select: { id: true },
  }));
  ids.ofs = id(await prisma.ordenFabricacion.findMany({ where: { opId: { in: ids.ops } }, select: { id: true } }));
  ids.pares = id(await prisma.par.findMany({ where: { ofId: { in: ids.ofs } }, select: { id: true } }));
  ids.eventos = id(await prisma.eventoTrazabilidad.findMany({ where: { parId: { in: ids.pares } }, select: { id: true } }));
  ids.incidencias = id(await prisma.incidenciaCalidad.findMany({
    where: { OR: [{ parId: { in: ids.pares } }, { parReposicionId: { in: ids.pares } }] }, select: { id: true },
  }));
  ids.despachos = id(await prisma.despacho.findMany({ where: { opId: { in: ids.ops } }, select: { id: true } }));
  ids.despachoLineas = id(await prisma.despachoLinea.findMany({ where: { despachoId: { in: ids.despachos } }, select: { id: true } }));
  // Facturas de esos despachos + facturas (de producto o de servicio) a clientes ficticios.
  ids.facturas = id(await prisma.factura.findMany({
    where: { OR: [{ despachoId: { in: ids.despachos } }, { clienteId: { in: ids.clientes } }] }, select: { id: true },
  }));
  ids.facturaLineas = id(await prisma.facturaLinea.findMany({ where: { facturaId: { in: ids.facturas } }, select: { id: true } }));
  ids.pagos = id(await prisma.pago.findMany({ where: { facturaId: { in: ids.facturas } }, select: { id: true } }));

  // ── Compras a proveedor ficticio (o nacidas de un requerimiento demo) ────────
  const ocps = await prisma.ordenCompraProveedor.findMany({
    where: { OR: [{ proveedorId: { in: ids.proveedores } }, { requerimientoId: { in: ids.requerimientos } }] },
    select: { id: true, consecutivo: true },
  });
  ids.ocps = id(ocps);
  ids.ocpLineas = id(await prisma.ordenCompraProveedorLinea.findMany({ where: { ocpId: { in: ids.ocps } }, select: { id: true } }));
  ids.recepciones = id(await prisma.recepcionCompra.findMany({ where: { ocpId: { in: ids.ocps } }, select: { id: true } }));
  ids.recepcionLineas = id(await prisma.recepcionCompraLinea.findMany({ where: { recepcionId: { in: ids.recepciones } }, select: { id: true } }));
  ids.devoluciones = id(await prisma.devolucionProveedor.findMany({ where: { ocpId: { in: ids.ocps } }, select: { id: true } }));
  ids.devolucionLineas = id(await prisma.devolucionProveedorLinea.findMany({ where: { devolucionId: { in: ids.devoluciones } }, select: { id: true } }));

  // ── Inventario y kardex ────────────────────────────────────────────────────
  ids.inventarioPT = id(await prisma.inventarioPT.findMany({ where: { productoConfiguradoId: { in: ids.productos } }, select: { id: true } }));
  ids.movimientos = id(await prisma.movimientoInventario.findMany({
    where: {
      OR: [
        { referencia: { startsWith: 'D14-' } },
        { referencia: { in: [...REFERENCIAS_MOV_DEMO, ...ocps.map((o) => `OCP-${o.consecutivo}`)] } },
        { materialId: { in: ids.materiales } },
        { inventarioPTId: { in: ids.inventarioPT } },
        { ofId: { in: ids.ofs } },
      ],
    },
    select: { id: true },
  }));
  ids.inventarioMaterial = id(await prisma.inventarioMaterial.findMany({ where: { materialId: { in: ids.materiales } }, select: { id: true } }));

  // ── Catálogo ficticio (configurador, BOM, materiales) ─────────────────────────
  ids.productoOpciones = id(await prisma.productoConfiguradoOpcion.findMany({ where: { productoConfiguradoId: { in: ids.productos } }, select: { id: true } }));
  ids.reglas = id(await prisma.reglaOverride.findMany({
    where: { OR: [{ opcionId: { in: ids.opciones } }, { materialNuevoId: { in: ids.materiales } }, { materialObjetivoId: { in: ids.materiales } }] },
    select: { id: true },
  }));
  ids.reglaTallas = id(await prisma.reglaOverrideTalla.findMany({ where: { reglaOverrideId: { in: ids.reglas } }, select: { id: true } }));
  ids.referenciaEjes = id(await prisma.referenciaEje.findMany({ where: { grupoOpcionId: { in: ids.grupos } }, select: { id: true } }));
  ids.boms = id(await prisma.bom.findMany({ where: { materialId: { in: ids.materiales } }, select: { id: true } }));
  ids.bomLineas = id(await prisma.bomLinea.findMany({
    where: { OR: [{ bomId: { in: ids.boms } }, { materialId: { in: ids.materiales } }] }, select: { id: true },
  }));
  ids.bomLineaTallas = id(await prisma.bomLineaTalla.findMany({ where: { bomLineaId: { in: ids.bomLineas } }, select: { id: true } }));
  ids.materialAlias = id(await prisma.materialAlias.findMany({ where: { materialId: { in: ids.materiales } }, select: { id: true } }));
  ids.sedes = id(await prisma.sedeCliente.findMany({ where: { clienteId: { in: ids.clientes } }, select: { id: true } }));
  ids.ordenesCorte = id(await prisma.ordenCorte.findMany({ where: { codigo: { in: ORDENES_CORTE_EJEMPLO } }, select: { id: true } }));
  // Las categorías ficticias solo se van si no les queda ningún material real colgando.
  const categorias = await prisma.categoriaMaterial.findMany({
    where: { nombre: { in: CATEGORIAS_DEMO } },
    select: { id: true, nombre: true, _count: { select: { materiales: { where: { codigo: { notIn: MATERIALES_DEMO } } } } } },
  });
  ids.categorias = categorias.filter((c) => c._count.materiales === 0).map((c) => c.id);
  for (const c of categorias.filter((c) => c._count.materiales > 0)) {
    avisos.push(`Categoría "${c.nombre}" tiene ${c._count.materiales} material(es) real(es): se conserva`);
  }

  // Lo que a propósito NO se toca, para que quede dicho en el dry-run.
  avisos.push('Se conservan: usuarios (incluido "gerente"), operarios, máquinas, tipos de daño, umbrales, metas, bodegas, servicios, calendario, BOM real y ReferenciaMarca.');
  return { ids, avisos, ocsReales };
}

const ETIQUETAS: [keyof Plan['ids'], string][] = [
  ['ocs', 'Órdenes de compra (OC)'], ['ops', 'Órdenes de producción (OP)'], ['ofs', 'Órdenes de fabricación (OF)'],
  ['pares', 'Pares'], ['eventos', 'Eventos de trazabilidad'], ['incidencias', 'Incidencias de calidad'],
  ['despachos', 'Despachos'], ['facturas', 'Facturas'], ['pagos', 'Pagos'], ['requerimientos', 'Requerimientos de compra'],
  ['ocps', 'Órdenes de compra a proveedor'], ['recepciones', 'Recepciones'], ['devoluciones', 'Devoluciones a proveedor'],
  ['movimientos', 'Movimientos de inventario (kardex)'], ['inventarioPT', 'Inventario PT'], ['reservasPT', 'Reservas de PT'],
  ['productos', 'Productos configurados PC-*'], ['grupos', 'Ejes COLOR/SUELA'], ['reglas', 'Reglas de override'],
  ['boms', 'BOM de materiales demo'], ['bomLineas', 'Líneas de BOM con material demo'],
  ['materiales', 'Materiales'], ['categorias', 'Categorías de material'], ['clientes', 'Clientes'], ['sedes', 'Sedes'],
  ['proveedores', 'Proveedores'], ['ordenesCorte', 'Órdenes de corte de ejemplo'],
];

function imprimirPlan(plan: Plan): number {
  console.log('\nQué se borraría (solo lo marcado como demo):');
  let total = 0;
  for (const [k, etiqueta] of ETIQUETAS) {
    const n = plan.ids[k]?.length ?? 0;
    total += n;
    if (n > 0) console.log(`  ${etiqueta.padEnd(38, '.')} ${String(n).padStart(6)}`);
  }
  console.log(`  ${'TOTAL de registros'.padEnd(38, '.')} ${String(total).padStart(6)}`);
  console.log(`\nOCs reales que quedan: ${plan.ocsReales}`);
  for (const a of plan.avisos) console.log(`  ⚠ ${a}`);
  return total;
}

async function ejecutar(plan: Plan, reiniciarConsecutivos: boolean): Promise<void> {
  const { ids } = plan;
  const en = (lista: number[]) => ({ id: { in: lista } });
  await prisma.$transaction(
    async (tx) => {
      // Hijos antes que padres: en este schema solo el módulo de corte tiene cascadas.
      await tx.eventoTrazabilidad.deleteMany({ where: en(ids.eventos) });
      await tx.incidenciaCalidad.deleteMany({ where: en(ids.incidencias) });
      await tx.pago.deleteMany({ where: en(ids.pagos) });
      await tx.facturaLinea.deleteMany({ where: en(ids.facturaLineas) });
      await tx.factura.deleteMany({ where: en(ids.facturas) });
      await tx.despachoLinea.deleteMany({ where: en(ids.despachoLineas) });
      await tx.despacho.deleteMany({ where: en(ids.despachos) });
      await tx.movimientoInventario.deleteMany({ where: en(ids.movimientos) });
      await tx.par.deleteMany({ where: en(ids.pares) });
      await tx.ordenFabricacion.deleteMany({ where: en(ids.ofs) });
      await tx.reservaInventarioPT.deleteMany({ where: en(ids.reservasPT) });
      await tx.recepcionCompraLinea.deleteMany({ where: en(ids.recepcionLineas) });
      await tx.recepcionCompra.deleteMany({ where: en(ids.recepciones) });
      await tx.devolucionProveedorLinea.deleteMany({ where: en(ids.devolucionLineas) });
      await tx.devolucionProveedor.deleteMany({ where: en(ids.devoluciones) });
      await tx.ordenCompraProveedorLinea.deleteMany({ where: en(ids.ocpLineas) });
      await tx.ordenCompraProveedor.deleteMany({ where: en(ids.ocps) });
      await tx.requerimientoCompraLinea.deleteMany({ where: en(ids.requerimientoLineas) });
      await tx.requerimientoCompra.deleteMany({ where: en(ids.requerimientos) });
      await tx.ordenProduccionLineaTalla.deleteMany({ where: en(ids.opLineaTallas) });
      await tx.ordenProduccionLinea.deleteMany({ where: en(ids.opLineas) });
      await tx.ordenProduccion.deleteMany({ where: en(ids.ops) });
      await tx.ordenCompraLineaTalla.deleteMany({ where: en(ids.ocLineaTallas) });
      await tx.ordenCompraLinea.deleteMany({ where: en(ids.ocLineas) });
      await tx.ordenCompra.deleteMany({ where: en(ids.ocs) });
      await tx.inventarioPT.deleteMany({ where: en(ids.inventarioPT) });
      await tx.productoConfiguradoOpcion.deleteMany({ where: en(ids.productoOpciones) });
      await tx.productoConfigurado.deleteMany({ where: en(ids.productos) });
      await tx.reglaOverrideTalla.deleteMany({ where: en(ids.reglaTallas) });
      await tx.reglaOverride.deleteMany({ where: en(ids.reglas) });
      await tx.referenciaEje.deleteMany({ where: en(ids.referenciaEjes) });
      await tx.opcion.deleteMany({ where: en(ids.opciones) });
      await tx.grupoOpcion.deleteMany({ where: en(ids.grupos) });
      await tx.bomLineaTalla.deleteMany({ where: en(ids.bomLineaTallas) });
      await tx.bomLinea.deleteMany({ where: en(ids.bomLineas) });
      await tx.bom.deleteMany({ where: en(ids.boms) });
      await tx.materialAlias.deleteMany({ where: en(ids.materialAlias) });
      await tx.inventarioMaterial.deleteMany({ where: en(ids.inventarioMaterial) });
      await tx.material.deleteMany({ where: en(ids.materiales) });
      await tx.categoriaMaterial.deleteMany({ where: en(ids.categorias) });
      await tx.sedeCliente.deleteMany({ where: en(ids.sedes) });
      await tx.cliente.deleteMany({ where: en(ids.clientes) });
      await tx.proveedor.deleteMany({ where: en(ids.proveedores) });
      await tx.ordenCorte.deleteMany({ where: en(ids.ordenesCorte) }); // líneas y avances caen en cascada

      if (reiniciarConsecutivos) {
        // Solo las tablas que quedaron vacías vuelven a 1: si sobrevivió algo real, su numeración sigue.
        const secuencias: [string, () => Promise<number>][] = [
          ['oc_consecutivo_seq', () => tx.ordenCompra.count()],
          ['op_consecutivo_seq', () => tx.ordenProduccion.count()],
          ['of_consecutivo_seq', () => tx.ordenFabricacion.count()],
          ['despacho_consecutivo_seq', () => tx.despacho.count()],
          ['req_consecutivo_seq', () => tx.requerimientoCompra.count()],
          ['factura_consecutivo_seq', () => tx.factura.count()],
          ['ocp_consecutivo_seq', () => tx.ordenCompraProveedor.count()],
          ['recepcion_consecutivo_seq', () => tx.recepcionCompra.count()],
          ['devolucion_consecutivo_seq', () => tx.devolucionProveedor.count()],
        ];
        for (const [seq, count] of secuencias) {
          if ((await count()) === 0) {
            await tx.$executeRawUnsafe(`ALTER SEQUENCE IF EXISTS "${seq}" RESTART WITH 1`);
            console.log(`  · ${seq} → 1`);
          }
        }
      }
    },
    { maxWait: 10_000, timeout: 300_000 },
  );
}

async function main() {
  const args = process.argv.slice(2);
  const ejecutarDeVerdad = args.includes('--ejecutar');
  const prodConfirmado = args.includes('--prod-confirmado');
  const reiniciar = !args.includes('--sin-reiniciar-consecutivos');
  const prod = esBaseDeProduccion();

  console.log(`Limpiar demo — base: ${describirBase()}${prod ? '  ⚠ PRODUCCIÓN' : ''}`);
  console.log(ejecutarDeVerdad ? 'Modo: EJECUTAR (borra)' : 'Modo: dry-run (no borra nada; agrega --ejecutar para borrar)');
  if (ejecutarDeVerdad && prod && !prodConfirmado) {
    console.error('✖ La base es producción: para borrar hay que pasar también --prod-confirmado.');
    process.exit(2);
  }

  const plan = await clasificar();
  const total = imprimirPlan(plan);
  if (!ejecutarDeVerdad || total === 0) {
    if (total === 0) console.log('\nNada que borrar.');
    return;
  }
  console.log('\nBorrando…');
  await ejecutar(plan, reiniciar);
  console.log(`✔ Listo: ${total} registros demo eliminados en una transacción.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
