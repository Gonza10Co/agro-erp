/**
 * Aplanado de los pedidos para bajarlos a Excel (Juan Pablo los lee con Power Query).
 * Lógica pura, sin BD: el servicio hace UNA consulta con todos los include y esto
 * la convierte en dos tablas planas, una fila por pedido y una por pedido × producto × talla.
 *
 * Las fechas salen como día calendario 'YYYY-MM-DD':
 *  - `fecha` y `fechaConfirmacion` son instantes: se pasan a hora Colombia (UTC-5).
 *  - `fechaEntrega` y `fechaPedidoCliente` son @db.Date (medianoche UTC): se cortan tal cual.
 */

type Decimalish = { toString(): string } | number | string | null | undefined;

interface TallaOC { cantidad: number; talla: { valor: number; orden: number } }
interface LineaOC {
  productoConfiguradoId: number;
  calidad: string;
  precioUnitario: Decimalish;
  productoConfigurado: {
    codigo: string;
    nombreComercial: string;
    referencia: { codigo: string };
    marca: { nombre: string };
  };
  tallas: TallaOC[];
}
interface OPExport {
  consecutivo: number;
  estado: string;
  lineas: {
    productoConfiguradoId: number;
    calidad: string;
    tallas: { cantAmarrada: number; cantAProducir: number; talla: { valor: number } }[];
  }[];
  despacho: {
    lineas: { productoConfiguradoId: number; calidad: string; cantidad: number; talla: { valor: number } }[];
  } | null;
}
export interface OCParaExportar {
  consecutivo: number;
  ocCliente: string | null;
  estado: string;
  paraStock: boolean;
  fecha: Date;
  fechaConfirmacion: Date | null;
  fechaEntrega: Date | null;
  fechaPedidoCliente: Date | null;
  observaciones: string | null;
  cliente: { nit: string | null; nombre: string };
  sedeEntrega: { nombre: string; ciudad: string } | null;
  linea: { nombre: string } | null;
  lineas: LineaOC[];
  ordenProduccion: OPExport | null;
}

export interface FilaPedidoExport {
  consecutivo: number;
  ocCliente: string | null;
  cliente: string;
  nit: string | null;
  sede: string | null;
  ciudadEntrega: string | null;
  linea: string | null;
  paraStock: boolean;
  estado: string;
  fechaPedidoCliente: string | null;
  fechaSubida: string;
  fechaConfirmacion: string | null;
  fechaEntrega: string | null;
  opConsecutivo: number | null;
  opEstado: string | null;
  referencias: string;
  marcas: string;
  productos: string;
  totalPares: number;
  deBodega: number;
  aProducir: number;
  despachados: number;
  pendientes: number;
  valor: number | null;
  observaciones: string | null;
}

export interface FilaPedidoTallaExport {
  consecutivo: number;
  ocCliente: string | null;
  cliente: string;
  nit: string | null;
  linea: string | null;
  paraStock: boolean;
  estado: string;
  fechaPedidoCliente: string | null;
  fechaSubida: string;
  fechaConfirmacion: string | null;
  fechaEntrega: string | null;
  referencia: string;
  marca: string;
  producto: string;
  codigo: string;
  calidad: string;
  talla: number;
  cantidad: number;
  deBodega: number;
  aProducir: number;
  despachados: number;
  pendientes: number;
  opConsecutivo: number | null;
  opEstado: string | null;
  precioUnitario: number | null;
  valor: number | null;
  observaciones: string | null;
}

export interface PedidosExport {
  pedidos: FilaPedidoExport[];
  tallas: FilaPedidoTallaExport[];
}

const COLOMBIA_MS = 5 * 3_600_000;

/** Instante → día en hora Colombia. */
export function diaColombia(d: Date | null | undefined): string | null {
  return d ? new Date(d.getTime() - COLOMBIA_MS).toISOString().slice(0, 10) : null;
}

/** @db.Date (medianoche UTC) → 'YYYY-MM-DD' sin correrse de día. */
export function diaCalendario(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function aNumero(v: Decimalish): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : null;
}

const clave = (productoId: number, calidad: string, talla: number) => `${productoId}|${calidad}|${talla}`;
const unicos = (xs: string[]) => [...new Set(xs)].join(', ');

export function aplanarPedidos(ocs: OCParaExportar[]): PedidosExport {
  const pedidos: FilaPedidoExport[] = [];
  const tallas: FilaPedidoTallaExport[] = [];

  for (const oc of ocs) {
    const op = oc.ordenProduccion;
    // Una OP anulada soltó su amarre y ya no va a producir: cuenta como si no hubiera.
    const opViva = op && op.estado !== 'ANULADA' ? op : null;
    const amarre = new Map<string, { deBodega: number; aProducir: number }>();
    for (const l of opViva?.lineas ?? []) {
      for (const t of l.tallas) {
        amarre.set(clave(l.productoConfiguradoId, l.calidad, t.talla.valor), {
          deBodega: t.cantAmarrada,
          aProducir: t.cantAProducir,
        });
      }
    }
    const despachado = new Map<string, number>();
    for (const d of op?.despacho?.lineas ?? []) {
      const k = clave(d.productoConfiguradoId, d.calidad, d.talla.valor);
      despachado.set(k, (despachado.get(k) ?? 0) + d.cantidad);
    }

    const comun = {
      consecutivo: oc.consecutivo,
      ocCliente: oc.ocCliente,
      cliente: oc.cliente.nombre,
      nit: oc.cliente.nit || null,
      linea: oc.linea?.nombre ?? null,
      paraStock: oc.paraStock,
      estado: oc.estado,
      fechaPedidoCliente: diaCalendario(oc.fechaPedidoCliente),
      fechaSubida: diaColombia(oc.fecha)!,
      fechaConfirmacion: diaColombia(oc.fechaConfirmacion),
      fechaEntrega: diaCalendario(oc.fechaEntrega),
    };
    const opCampos = { opConsecutivo: op?.consecutivo ?? null, opEstado: op?.estado ?? null };

    const filasOC: FilaPedidoTallaExport[] = [];
    for (const l of oc.lineas) {
      const pc = l.productoConfigurado;
      const precio = aNumero(l.precioUnitario);
      const ordenadas = [...l.tallas].sort((a, b) => a.talla.orden - b.talla.orden);
      for (const t of ordenadas) {
        const k = clave(l.productoConfiguradoId, l.calidad, t.talla.valor);
        const a = amarre.get(k);
        const desp = despachado.get(k) ?? 0;
        filasOC.push({
          ...comun,
          referencia: pc.referencia.codigo,
          marca: pc.marca.nombre,
          producto: pc.nombreComercial,
          codigo: pc.codigo,
          calidad: l.calidad,
          talla: t.talla.valor,
          cantidad: t.cantidad,
          deBodega: a?.deBodega ?? 0,
          aProducir: a?.aProducir ?? 0,
          despachados: desp,
          pendientes: Math.max(0, t.cantidad - desp),
          ...opCampos,
          precioUnitario: precio,
          valor: precio === null ? null : precio * t.cantidad,
          observaciones: oc.observaciones,
        });
      }
    }
    tallas.push(...filasOC);

    const suma = (f: (x: FilaPedidoTallaExport) => number) => filasOC.reduce((acc, x) => acc + f(x), 0);
    const conPrecio = filasOC.filter((x) => x.valor !== null);
    const { fechaPedidoCliente, fechaSubida, fechaConfirmacion, fechaEntrega, ...cabeza } = comun;
    pedidos.push({
      ...cabeza,
      sede: oc.sedeEntrega?.nombre ?? null,
      ciudadEntrega: oc.sedeEntrega?.ciudad ?? null,
      fechaPedidoCliente,
      fechaSubida,
      fechaConfirmacion,
      fechaEntrega,
      ...opCampos,
      referencias: unicos(filasOC.map((x) => x.referencia)),
      marcas: unicos(filasOC.map((x) => x.marca)),
      productos: unicos(filasOC.map((x) => x.producto)),
      totalPares: suma((x) => x.cantidad),
      deBodega: suma((x) => x.deBodega),
      aProducir: suma((x) => x.aProducir),
      despachados: suma((x) => x.despachados),
      pendientes: suma((x) => x.pendientes),
      valor: conPrecio.length ? conPrecio.reduce((acc, x) => acc + x.valor!, 0) : null,
      observaciones: oc.observaciones,
    });
  }

  return { pedidos, tallas };
}
