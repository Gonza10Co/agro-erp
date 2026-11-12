import { DisponibleVenta, EstadoProyeccion, PedidoProyectado, Proyeccion } from '../../../core/api/models/proyeccion.models';
import { Celda, EstiloCelda, Hoja } from '../../../shared/xlsx/xlsx-mini';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-11-12' → 'jue 12 nov'. Sin Date local: la clave ya viene en hora Colombia. */
export function fechaCorta(clave: string | null | undefined): string {
  if (!clave) return '';
  const d = new Date(`${clave}T00:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

export const ETIQUETA_ESTADO: Record<EstadoProyeccion, { label: string; clase: string }> = {
  EN_BODEGA: { label: 'Sale de bodega', clase: 'badge-neutral' },
  A_TIEMPO: { label: 'A tiempo', clase: 'badge-success' },
  ATRASADO: { label: 'No llega', clase: 'badge-error' },
  SIN_CUPO: { label: 'Sin cupo', clase: 'badge-error' },
};

/** Busca en cliente, referencia, marca, producto y número de pedido, sin tildes ni mayúsculas. */
export function filtrarPedidos(pedidos: PedidoProyectado[], texto: string, estado: EstadoProyeccion | ''): PedidoProyectado[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(texto.trim());
  return pedidos.filter((p) => {
    if (estado && p.estado !== estado) return false;
    if (!q) return true;
    const pajar = norm([p.cliente, p.ocCliente ?? '', `oc-${p.consecutivo}`, ...p.referencias, ...p.marcas, ...p.productos].join(' '));
    return q.split(/\s+/).every((t) => pajar.includes(t));
  });
}

const c = (v: string | number | null, estilo?: EstiloCelda): Celda => ({ v, estilo });

/**
 * El informe para bajar. Dos hojas:
 *  - "Proyección": un renglón por pedido y una columna por día, pintada donde se
 *    fabrica (el Gantt). Arriba, lo usado y lo libre de cada día.
 *  - "Por talla": lo que falta producir de cada pedido por talla, en el mismo
 *    formato de la programación de corte (cliente, referencia, marca, tallas, total).
 *  - "Para vender": lo que queda libre en bodega de PT después de cubrir los pedidos.
 */
export function hojasProyeccion(p: Proyeccion, pedidos: PedidoProyectado[] = p.pedidos): Hoja[] {
  const dias = p.dias;
  const enc = (t: string) => c(t, 'encabezado');
  const fijas = ['Pedido', 'Cliente', 'Ref.', 'Marca', 'Pares', 'De bodega', 'A producir', 'Compromiso', 'Último corte', 'Listo en PT', 'Días tarde', 'Estado'];

  const gantt: Celda[][] = [
    [c('Proyección de pedidos contra la capacidad de la planta', 'titulo')],
    [c(`Corte al ${fechaCorta(p.hoy)} · ${p.paresPorDia} pares de corte por día · ${p.diasProceso} días hábiles de corte a producto terminado · planta comprometida hasta ${fechaCorta(p.resumen.hastaCuando) || 'hoy'} · cupo de corte libre desde ${fechaCorta(p.resumen.primerCupoLibre)}`, 'tenue')],
    [],
    [...fijas.map(enc), ...dias.map((d) => enc(fechaCorta(d.fecha)))],
  ];

  for (const ped of pedidos) {
    const porDia = new Map(dias.map((d) => [d.fecha, d.bloques.find((b) => b.ocId === ped.ocId)]));
    const tarde = ped.estado === 'ATRASADO' || ped.estado === 'SIN_CUPO';
    gantt.push([
      `OC-${ped.consecutivo}${ped.ocCliente ? ` (${ped.ocCliente})` : ''}`,
      ped.cliente,
      ped.referencias.join(', '),
      ped.marcas.join(', '),
      ped.pares,
      ped.deBodega,
      ped.aProducir,
      fechaCorta(ped.compromiso) + (ped.compromisoEstimado ? ' *' : ''),
      fechaCorta(ped.finCorte),
      ped.fin ? fechaCorta(ped.fin) : ped.estado === 'EN_BODEGA' ? 'ya está' : '',
      ped.diasAtraso || null,
      c(ETIQUETA_ESTADO[ped.estado].label, tarde ? 'atrasado' : ped.estado === 'EN_BODEGA' ? 'bodega' : 'ok'),
      ...dias.map((d) => {
        const b = porDia.get(d.fecha);
        if (!b) return null;
        // Lo cortado ese día que ya no alcanza a estar listo para el compromiso va en rojo.
        return c(b.pares, b.tarde ? 'atrasado' : 'ok');
      }),
    ]);
  }

  const vacias = (n: number): Celda[] => Array.from({ length: n }, () => null);
  gantt.push([]);
  gantt.push([c('Cortado en el día', 'negrita'), ...vacias(fijas.length - 1), ...dias.map((d) => c(d.usado || null, d.usado >= d.capacidad ? 'alerta' : undefined))]);
  gantt.push([c('Cupo libre de corte', 'negrita'), ...vacias(fijas.length - 1), ...dias.map((d) => c(d.libre, d.libre > 0 ? 'libre' : undefined))]);
  gantt.push([]);
  gantt.push([c('* Compromiso estimado: confirmación del pedido más 15 días, porque el pedido todavía no tiene fecha de entrega escrita.', 'tenue')]);
  gantt.push([c(`Las columnas de días son días de CORTE. Cada pedido queda listo ${p.diasProceso} días hábiles después de su último corte (dato provisional, por confirmar con producción).`, 'tenue')]);
  gantt.push([c('La proyección descuenta el producto terminado en bodega; todavía no conoce los cortes, la guarnición ni las capelladas en proceso.', 'tenue')]);

  const tallas = [...new Set(pedidos.flatMap((x) => x.tallas.filter((t) => t.aProducir > 0).map((t) => t.talla)))].sort((a, b) => a - b);
  const porTalla: Celda[][] = [
    [c('Pendiente por producir, por talla', 'titulo')],
    [c(`Corte al ${fechaCorta(p.hoy)}. Solo lo que falta fabricar después de descontar la bodega.`, 'tenue')],
    [],
    [...['Pedido', 'Cliente', 'Ref.', 'Marca', 'Compromiso', 'Primer corte', 'Listo en PT'].map(enc), ...tallas.map((t) => enc(String(t))), enc('Total')],
  ];
  const conProduccion = pedidos.filter((x) => x.aProducir > 0);
  for (const ped of conProduccion) {
    const m = new Map(ped.tallas.map((t) => [t.talla, t.aProducir]));
    porTalla.push([
      `OC-${ped.consecutivo}${ped.ocCliente ? ` (${ped.ocCliente})` : ''}`,
      ped.cliente,
      ped.referencias.join(', '),
      ped.marcas.join(', '),
      fechaCorta(ped.compromiso) + (ped.compromisoEstimado ? ' *' : ''),
      fechaCorta(ped.inicio),
      fechaCorta(ped.fin),
      ...tallas.map((t) => m.get(t) || null),
      c(ped.aProducir, 'negrita'),
    ]);
  }
  porTalla.push([
    c('Total', 'negrita'), ...vacias(6),
    ...tallas.map((t) => c(conProduccion.reduce((a, x) => a + (x.tallas.find((y) => y.talla === t)?.aProducir ?? 0), 0), 'negrita')),
    c(conProduccion.reduce((a, x) => a + x.aProducir, 0), 'negrita'),
  ]);

  return [
    { nombre: 'Proyección', filas: gantt, anchos: [18, 34, 8, 22, 8, 10, 11, 14, 12, 12, 10, 14, ...dias.map(() => 11)], congelar: { filas: 4, columnas: 2 } },
    { nombre: 'Por talla', filas: porTalla, anchos: [18, 34, 8, 22, 14, 12, 12, ...tallas.map(() => 6), 9], congelar: { filas: 4, columnas: 2 } },
    hojaParaVender(p.hoy, p.disponible),
  ];
}

/** Tallas presentes en lo disponible, en orden. */
export function tallasDisponibles(disponible: DisponibleVenta[]): number[] {
  return [...new Set(disponible.flatMap((g) => g.tallas.map((t) => t.talla)))].sort((a, b) => a - b);
}

function hojaParaVender(hoy: string, disponible: DisponibleVenta[]): Hoja {
  const enc = (t: string) => c(t, 'encabezado');
  const tallas = tallasDisponibles(disponible);
  const filas: Celda[][] = [
    [c('Producto terminado libre para vender', 'titulo')],
    [c(`Corte al ${fechaCorta(hoy)}. Lo que queda en bodega después de cubrir todos los pedidos confirmados.`, 'tenue')],
    [],
    [...['Ref.', 'Marca', 'Producto', 'Calidad'].map(enc), ...tallas.map((t) => enc(String(t))), enc('Total')],
  ];
  for (const g of disponible) {
    const m = new Map(g.tallas.map((t) => [t.talla, t.pares]));
    filas.push([g.referencia ?? '', g.marca ?? '', g.producto, g.calidad === 'SEGUNDA' ? 'Segunda' : 'Primera', ...tallas.map((t) => m.get(t) || null), c(g.total, 'negrita')]);
  }
  filas.push([
    c('Total', 'negrita'), null, null, null,
    ...tallas.map((t) => c(disponible.reduce((a, g) => a + (g.tallas.find((x) => x.talla === t)?.pares ?? 0), 0), 'negrita')),
    c(disponible.reduce((a, g) => a + g.total, 0), 'negrita'),
  ]);
  return { nombre: 'Para vender', filas, anchos: [8, 22, 34, 10, ...tallas.map(() => 7), 9], congelar: { filas: 4, columnas: 3 } };
}
