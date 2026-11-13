/**
 * Proyección de pedidos contra la capacidad de la planta. Lógica pura.
 *
 * Es la respuesta a lo que Gabriel le pide a Juan Pablo (2026-11-12): con los
 * pedidos montados y lo que hay en bodega, ¿hasta cuándo tenemos para producirlos,
 * cuáles no llegan a su fecha y desde qué día queda cupo para vender?
 *
 * Cómo calcula:
 *  1. Ordena los pedidos por fecha de compromiso (el más urgente primero).
 *  2. A cada uno le descuenta lo que ya hay en bodega (simula el amarre de la OP;
 *     si la OP ya existe usa lo que esa OP dejó pendiente de producir).
 *  3. Lo que falta lo reparte en días de CORTE a partir de hoy, sin pasar del lote
 *     diario ni de lo que dan los moldes de cada talla.
 *  4. El pedido queda listo `diasProceso` días hábiles después de su último corte
 *     (lo que tarda un par en pasar por guarnición, almacén e inyección).
 *  5. Lo que sobra en bodega después de cubrir los pedidos es lo que hay para vender.
 *  6. Un pedido PARA STOCK (orden de mínimos) no toma de la bodega: se fabrica
 *     completo y lo que produce ENTRA para vender el día que queda listo.
 *
 * No programa la planta: es una simulación para decidir. El corte del día lo sigue
 * armando la gente (mínimos, curvas, consolidar por referencia).
 */
import { CalendarioMin, esHabil } from '../../reportes/calendario-habil';
import { CapacidadPlanta } from './capacidad-planta';

export interface RenglonPedido {
  productoConfiguradoId: number;
  producto: string;
  referencia: string | null;
  marca: string | null;
  talla: number;
  calidad: string;
  pedida: number;
  /** Solo si el pedido ya tiene OP: lo que esa OP todavía debe fabricar de esta talla. */
  pendienteOP?: number;
}

export interface PedidoEntrada {
  ocId: number;
  consecutivo: number;
  cliente: string;
  ocCliente: string | null;
  /** 'YYYY-MM-DD' desde la que corre el plazo (confirmación; si no, creación). */
  fechaBase: string;
  /** 'YYYY-MM-DD' prometida al cliente, si alguien la escribió. */
  fechaEntrega?: string | null;
  tieneOP: boolean;
  /** Orden de mínimos: se fabrica para reponer la bodega, no para un cliente. */
  paraStock?: boolean;
  renglones: RenglonPedido[];
}

export interface StockLibre {
  productoConfiguradoId: number;
  producto?: string;
  referencia?: string | null;
  marca?: string | null;
  talla: number;
  calidad: string;
  /** cantDisponible − cantReservada, sumado entre bodegas. */
  libre: number;
}

export interface EntradaProyeccion {
  /** 'YYYY-MM-DD' de hoy en hora Colombia: el primer día que se puede programar. */
  hoy: string;
  calendario: CalendarioMin;
  capacidad: CapacidadPlanta;
  plazoDias: number;
  pedidos: PedidoEntrada[];
  stock: StockLibre[];
  /** Tope de días hábiles a simular; lo que no quepa queda SIN_CUPO. */
  horizonteDias?: number;
}

export type EstadoProyeccion = 'EN_BODEGA' | 'A_TIEMPO' | 'ATRASADO' | 'SIN_CUPO';

export interface BloqueDia {
  ocId: number;
  consecutivo: number;
  cliente: string;
  pares: number;
  /** Lo cortado este día queda listo después del compromiso del pedido. */
  tarde: boolean;
}

export interface DiaProyectado {
  fecha: string;
  capacidad: number;
  usado: number;
  libre: number;
  bloques: BloqueDia[];
}

export interface TallaProyectada {
  talla: number;
  pedida: number;
  deBodega: number;
  aProducir: number;
}

export interface PedidoProyectado {
  ocId: number;
  consecutivo: number;
  cliente: string;
  ocCliente: string | null;
  productos: string[];
  referencias: string[];
  marcas: string[];
  tieneOP: boolean;
  paraStock: boolean;
  pares: number;
  deBodega: number;
  aProducir: number;
  sinCupo: number;
  compromiso: string;
  /** true = nadie escribió la fecha: es confirmación + plazo estándar. */
  compromisoEstimado: boolean;
  /** Primer y último día de corte. */
  inicio: string | null;
  finCorte: string | null;
  /** Día en que el último par entra a producto terminado. */
  fin: string | null;
  /** Días calendario que el fin se pasa del compromiso (0 si llega). */
  diasAtraso: number;
  estado: EstadoProyeccion;
  tallas: TallaProyectada[];
}

/** Lo que queda libre en bodega de PT después de cubrir los pedidos. */
export interface DisponibleVenta {
  productoConfiguradoId: number;
  producto: string;
  referencia: string | null;
  marca: string | null;
  calidad: string;
  tallas: { talla: number; pares: number }[];
  total: number;
}

/** Lo que un pedido para stock deja libre en bodega el día que queda listo. */
export interface EntradaVenta {
  ocId: number;
  consecutivo: number;
  /** Día en que entra a producto terminado (null si no cupo en el horizonte). */
  fecha: string | null;
  productoConfiguradoId: number;
  producto: string;
  referencia: string | null;
  marca: string | null;
  calidad: string;
  tallas: { talla: number; pares: number }[];
  total: number;
}

export interface Proyeccion {
  hoy: string;
  paresPorDia: number;
  diasProceso: number;
  dias: DiaProyectado[];
  pedidos: PedidoProyectado[];
  resumen: {
    pedidos: number;
    pares: number;
    deBodega: number;
    aProducir: number;
    atrasados: number;
    sinCupo: number;
    /** Día en que el último pedido entra a producto terminado (hasta cuándo está comprometida la planta). */
    hastaCuando: string | null;
    /** Primer día hábil con cupo libre de CORTE: desde ahí se puede programar algo nuevo. */
    primerCupoLibre: string | null;
    /** Pares libres en los días ya ocupados (huecos para completar con mínimos). */
    paresLibresEnVentana: number;
    /** Pares de PT que quedan libres en bodega después de cubrir los pedidos. */
    paresParaVender: number;
    /** Pares que las órdenes de mínimos van a sumar a la bodega (proyectado). */
    paresEntranParaVender: number;
  };
  disponible: DisponibleVenta[];
  /** Proyectado: lo que entra libre para vender, por pedido de mínimos y producto. */
  entraParaVender: EntradaVenta[];
}

const HORIZONTE_DEFECTO = 180;

export function sumarDias(clave: string, dias: number): string {
  const d = new Date(`${clave}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** El día hábil que cae `n` hábiles después de `clave` (n = 0 → el mismo día). */
export function masHabiles(clave: string, n: number, cal: CalendarioMin): string {
  let d = clave;
  for (let k = 0; k < n; ) {
    d = sumarDias(d, 1);
    if (esHabil(d, cal)) k++;
  }
  return d;
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

/** Un día de planta con lo que le queda: total y por molde. */
class DiaPlanta {
  usado = 0;
  private readonly usadoMolde = new Map<number, number>();
  readonly bloques = new Map<number, BloqueDia>();

  constructor(readonly fecha: string, private readonly cap: CapacidadPlanta) {}

  private moldesDe(talla: number) {
    return this.cap.moldes.filter((m) => m.acepta.includes(talla));
  }

  private libreMolde(m: { talla: number; cantidad: number }): number {
    return m.cantidad * this.cap.paresPorMolde - (this.usadoMolde.get(m.talla) ?? 0);
  }

  /**
   * Coloca hasta `pares` de esa talla y devuelve cuántos cupieron. Con `soloPropio`
   * usa únicamente el molde de la talla; sin él, también el de la talla vecina.
   */
  colocar(pedido: PedidoEntrada, talla: number, pares: number, soloPropio: boolean): number {
    let porColocar = Math.min(pares, this.cap.paresPorDia - this.usado);
    if (porColocar <= 0) return 0;
    const todos = this.moldesDe(talla);
    let colocados = 0;
    if (todos.length === 0) {
      // Talla sin molde en la tabla (33, 47): solo la frena el lote del día.
      colocados = soloPropio ? porColocar : 0;
    } else {
      for (const m of todos.filter((x) => (x.talla === talla) === soloPropio)) {
        const toma = Math.min(porColocar, this.libreMolde(m));
        if (toma <= 0) continue;
        this.usadoMolde.set(m.talla, (this.usadoMolde.get(m.talla) ?? 0) + toma);
        colocados += toma;
        porColocar -= toma;
        if (porColocar === 0) break;
      }
    }
    if (colocados > 0) {
      this.usado += colocados;
      const b = this.bloques.get(pedido.ocId);
      if (b) b.pares += colocados;
      else this.bloques.set(pedido.ocId, { ocId: pedido.ocId, consecutivo: pedido.consecutivo, cliente: pedido.cliente, pares: colocados, tarde: false });
    }
    return colocados;
  }
}

export function proyectarPedidos(e: EntradaProyeccion): Proyeccion {
  const horizonte = e.horizonteDias ?? HORIZONTE_DEFECTO;
  const cap = e.capacidad;

  // Días hábiles desde hoy, generados a medida que se necesitan.
  const dias: DiaPlanta[] = [];
  let cursor = e.hoy;
  let vueltas = 0;
  const diaN = (i: number): DiaPlanta | null => {
    while (dias.length <= i) {
      if (dias.length >= horizonte || vueltas > horizonte * 3 + 30) return null;
      if (esHabil(cursor, e.calendario)) dias.push(new DiaPlanta(cursor, cap));
      cursor = sumarDias(cursor, 1);
      vueltas++;
    }
    return dias[i];
  };

  const stock = new Map<string, number>();
  for (const s of e.stock) {
    const k = `${s.productoConfiguradoId}|${s.talla}|${s.calidad}`;
    stock.set(k, (stock.get(k) ?? 0) + Math.max(0, s.libre));
  }

  const conCompromiso = e.pedidos.map((p) => ({
    p,
    compromiso: p.fechaEntrega || sumarDias(p.fechaBase, e.plazoDias),
    estimado: !p.fechaEntrega,
  }));
  conCompromiso.sort((a, b) => a.compromiso.localeCompare(b.compromiso) || a.p.consecutivo - b.p.consecutivo);

  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];
  const pedidos: PedidoProyectado[] = [];
  const entraParaVender: EntradaVenta[] = [];

  for (const { p, compromiso, estimado } of conCompromiso) {
    const tallas = new Map<number, TallaProyectada>();
    let inicio: string | null = null;
    let fin: string | null = null;
    let sinCupo = 0;

    // 1) Cuánto hay que fabricar de cada talla, después de la bodega.
    const falta = new Map<number, number>();
    const entra = new Map<string, EntradaVenta>();
    for (const r of [...p.renglones].sort((a, b) => a.talla - b.talla)) {
      let aProducir: number;
      if (p.tieneOP) {
        // La OP ya amarró: lo pendiente es lo que ella dejó por fabricar.
        aProducir = Math.max(0, Math.min(r.pedida, r.pendienteOP ?? 0));
      } else if (p.paraStock) {
        // Mínimos: viene a reponer la bodega, no a gastarla.
        aProducir = r.pedida;
      } else {
        const k = `${r.productoConfiguradoId}|${r.talla}|${r.calidad}`;
        const toma = Math.min(r.pedida, stock.get(k) ?? 0);
        if (toma > 0) stock.set(k, (stock.get(k) ?? 0) - toma);
        aProducir = r.pedida - toma;
      }
      const t = tallas.get(r.talla) ?? { talla: r.talla, pedida: 0, deBodega: 0, aProducir: 0 };
      t.pedida += r.pedida;
      t.deBodega += r.pedida - aProducir;
      t.aProducir += aProducir;
      tallas.set(r.talla, t);
      if (aProducir > 0) falta.set(r.talla, (falta.get(r.talla) ?? 0) + aProducir);
      if (p.paraStock && aProducir > 0) {
        const k = `${r.productoConfiguradoId}|${r.calidad}`;
        const g = entra.get(k) ?? {
          ocId: p.ocId, consecutivo: p.consecutivo, fecha: null,
          productoConfiguradoId: r.productoConfiguradoId, producto: r.producto,
          referencia: r.referencia, marca: r.marca, calidad: r.calidad, tallas: [], total: 0,
        };
        const t = g.tallas.find((x) => x.talla === r.talla);
        if (t) t.pares += aProducir;
        else g.tallas.push({ talla: r.talla, pares: aProducir });
        g.total += aProducir;
        entra.set(k, g);
      }
    }

    // 2) Día por día: primero cada talla en SU molde y solo después se presta el de
    //    la vecina. Al revés, la talla chica le quita el molde a la que sigue y el
    //    pedido se alarga sin necesidad.
    const pendiente = () => [...falta.values()].reduce((a, n) => a + n, 0);
    for (let i = 0; pendiente() > 0; i++) {
      const dia = diaN(i);
      if (!dia) break;
      let puso = 0;
      for (const soloPropio of [true, false]) {
        for (const [talla, n] of falta) {
          if (n <= 0) continue;
          const c = dia.colocar(p, talla, n, soloPropio);
          falta.set(talla, n - c);
          puso += c;
        }
      }
      if (puso > 0) {
        if (!inicio) inicio = dia.fecha;
        fin = dia.fecha;
      }
    }
    sinCupo = pendiente();

    const lista = [...tallas.values()].sort((a, b) => a.talla - b.talla);
    const pares = lista.reduce((a, t) => a + t.pedida, 0);
    const aProducir = lista.reduce((a, t) => a + t.aProducir, 0);
    const finCorte = fin;
    const listo = (corte: string) => masHabiles(corte, cap.diasProceso, e.calendario);
    fin = finCorte ? listo(finCorte) : null;
    for (const d of dias) {
      const b = d.bloques.get(p.ocId);
      if (b) b.tarde = listo(d.fecha) > compromiso;
    }
    const diasAtraso = fin ? Math.max(0, diasEntre(compromiso, fin)) : 0;
    const estado: EstadoProyeccion =
      sinCupo > 0 ? 'SIN_CUPO' : aProducir === 0 ? 'EN_BODEGA' : diasAtraso > 0 ? 'ATRASADO' : 'A_TIEMPO';
    for (const g of entra.values()) entraParaVender.push({ ...g, fecha: sinCupo > 0 ? null : fin });

    pedidos.push({
      ocId: p.ocId,
      consecutivo: p.consecutivo,
      cliente: p.cliente,
      ocCliente: p.ocCliente,
      productos: uniq(p.renglones.map((r) => r.producto)),
      referencias: uniq(p.renglones.map((r) => r.referencia)),
      marcas: uniq(p.renglones.map((r) => r.marca)),
      tieneOP: p.tieneOP,
      paraStock: !!p.paraStock,
      pares,
      deBodega: pares - aProducir,
      aProducir,
      sinCupo,
      compromiso,
      compromisoEstimado: estimado,
      inicio,
      finCorte,
      fin,
      diasAtraso,
      estado,
      tallas: lista,
    });
  }

  // Solo se devuelven los días hasta el último con trabajo, más el siguiente hábil
  // (para que la pantalla muestre dónde empieza el cupo libre).
  let ultimo = -1;
  dias.forEach((d, i) => { if (d.usado > 0) ultimo = i; });
  diaN(ultimo + 1);
  const visibles = dias.slice(0, ultimo + 2);
  const diasOut: DiaProyectado[] = visibles.map((d) => ({
    fecha: d.fecha,
    capacidad: cap.paresPorDia,
    usado: d.usado,
    libre: cap.paresPorDia - d.usado,
    bloques: [...d.bloques.values()],
  }));

  // Lo que la simulación no le asignó a ningún pedido queda para vender.
  const info = new Map(e.stock.map((s) => [s.productoConfiguradoId, s]));
  const grupos = new Map<string, DisponibleVenta>();
  for (const [k, n] of stock) {
    if (n <= 0) continue;
    const [pid, talla, calidad] = k.split('|');
    const s = info.get(Number(pid));
    const g = grupos.get(`${pid}|${calidad}`) ?? {
      productoConfiguradoId: Number(pid),
      producto: s?.producto ?? `Producto ${pid}`,
      referencia: s?.referencia ?? null,
      marca: s?.marca ?? null,
      calidad,
      tallas: [],
      total: 0,
    };
    g.tallas.push({ talla: Number(talla), pares: n });
    g.total += n;
    grupos.set(`${pid}|${calidad}`, g);
  }
  const disponible = [...grupos.values()]
    .map((g) => ({ ...g, tallas: g.tallas.sort((a, b) => a.talla - b.talla) }))
    .sort((a, b) => b.total - a.total);

  const ocupados = diasOut.filter((d) => d.usado > 0);
  return {
    hoy: e.hoy,
    paresPorDia: cap.paresPorDia,
    diasProceso: cap.diasProceso,
    disponible,
    dias: diasOut,
    pedidos,
    resumen: {
      pedidos: pedidos.length,
      pares: pedidos.reduce((a, p) => a + p.pares, 0),
      deBodega: pedidos.reduce((a, p) => a + p.deBodega, 0),
      aProducir: pedidos.reduce((a, p) => a + p.aProducir, 0),
      atrasados: pedidos.filter((p) => p.estado === 'ATRASADO').length,
      sinCupo: pedidos.filter((p) => p.estado === 'SIN_CUPO').length,
      hastaCuando: pedidos.reduce<string | null>((a, p) => (p.fin && (!a || p.fin > a) ? p.fin : a), null),
      primerCupoLibre: diasOut.find((d) => d.libre > 0)?.fecha ?? null,
      paresLibresEnVentana: ocupados.reduce((a, d) => a + d.libre, 0),
      paresParaVender: disponible.reduce((a, g) => a + g.total, 0),
      paresEntranParaVender: entraParaVender.reduce((a, g) => a + g.total, 0),
    },
    entraParaVender: entraParaVender.sort((a, b) => (a.fecha ?? '9').localeCompare(b.fecha ?? '9') || a.consecutivo - b.consecutivo),
  };
}
