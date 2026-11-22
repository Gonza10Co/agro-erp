/**
 * Fecha de entrega sugerida para un pedido que todavía se está montando. Lógica pura.
 *
 * Promesa a Juan Pablo: al crear la OC, el sistema propone la fecha según la carga
 * real de la planta. No hay un segundo cálculo: se corre la MISMA proyección de
 * pedidos (`proyectarPedidos`) con el borrador metido de último en la cola, así que
 * respeta lo mismo que ella (lote diario, tope por talla de los moldes de
 * inyección, días hábiles con sábados, festivos y lo que haya libre en bodega).
 *
 * La fecha sugerida es la que comercial ya promete (JP, 2026-11-19): último día de
 * producción + plazo estándar (15 días), corrida al siguiente día hábil y nunca antes
 * del día en que el último par entra a producto terminado.
 */
import { esHabil } from '../../reportes/calendario-habil';
import { EntradaProyeccion, PedidoEntrada, RenglonPedido, proyectarPedidos, sumarDias } from './proyeccion-core';

export interface DraftOrder {
  paraStock?: boolean;
  renglones: RenglonPedido[];
}

export interface DeliveryEstimate {
  /** 'YYYY-MM-DD' sugerida; null si no cupo dentro del horizonte simulado. */
  suggestedDate: string | null;
  /** Puesto del pedido nuevo en la cola de producción (1 = no hay nadie antes). */
  queuePosition: number;
  /** Pedidos vivos que todavía ocupan planta y van antes que este. */
  ordersAhead: number;
  pairs: number;
  fromStock: number;
  toProduce: number;
  /** Pares que no cupieron en el horizonte. */
  noCapacity: number;
  /** Primer y último día de producción del pedido nuevo. */
  productionStart: string | null;
  productionEnd: string | null;
  /** Día en que el último par entra a producto terminado. */
  readyDate: string | null;
  leadDays: number;
  processDays: number;
  explanation: string;
}

const DRAFT_ID = -1;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const corta = (clave: string) => {
  const d = new Date(`${clave}T00:00:00Z`);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
};

export function estimateDelivery(entrada: EntradaProyeccion, draft: DraftOrder): DeliveryEstimate {
  // Las segundas no se fabrican a pedido: salen del stock y no ocupan planta.
  const renglones = draft.renglones.filter((r) => r.calidad !== 'SEGUNDA' && r.pedida > 0);
  const nuevo: PedidoEntrada = {
    ocId: DRAFT_ID,
    consecutivo: Number.MAX_SAFE_INTEGER,
    cliente: 'Pedido nuevo',
    ocCliente: null,
    fechaBase: entrada.hoy,
    fechaEntrega: null,
    tieneOP: false,
    paraStock: !!draft.paraStock,
    alFinal: true,
    renglones,
  };
  const r = proyectarPedidos({ ...entrada, pedidos: [...entrada.pedidos, nuevo] });
  const idx = r.pedidos.findIndex((p) => p.ocId === DRAFT_ID);
  const p = r.pedidos[idx];
  const ordersAhead = r.pedidos.slice(0, idx).filter((x) => x.aProducir > 0).length;
  const queuePosition = ordersAhead + 1;
  const base = {
    queuePosition,
    ordersAhead,
    pairs: p.pares,
    fromStock: p.deBodega,
    toProduce: p.aProducir,
    noCapacity: p.sinCupo,
    productionStart: p.inicio,
    productionEnd: p.finCorte,
    readyDate: p.fin,
    leadDays: entrada.plazoDias,
    processDays: entrada.capacidad.diasProceso,
  };

  if (p.sinCupo > 0) {
    return {
      ...base,
      suggestedDate: null,
      explanation: `La planta no tiene cupo para ${p.sinCupo} pares en el horizonte simulado: la fecha hay que acordarla a mano.`,
    };
  }

  // Sale todo de bodega: el plazo estándar corre desde hoy.
  let fecha = sumarDias(p.finCorte ?? entrada.hoy, entrada.plazoDias);
  if (p.fin && p.fin > fecha) fecha = p.fin;
  for (let i = 0; i < 400 && !esHabil(fecha, entrada.calendario); i++) fecha = sumarDias(fecha, 1);

  const explanation =
    p.aProducir === 0
      ? `Sale todo de bodega: plazo estándar de ${entrada.plazoDias} días desde hoy.`
      : `Se produciría del ${corta(p.inicio!)} al ${corta(p.finCorte!)}` +
        (ordersAhead > 0 ? `, después de ${ordersAhead} ${ordersAhead === 1 ? 'pedido' : 'pedidos'} en cola` : ', sin pedidos por delante') +
        `; más ${entrada.plazoDias} días de plazo estándar.`;

  return { ...base, suggestedDate: fecha, explanation };
}
