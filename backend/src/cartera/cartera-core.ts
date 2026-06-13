// Núcleo puro de cartera: vencimientos, saldos y estado de cartera.
// Sin Prisma ni Nest — testeable en aislamiento. `hoy` se inyecta para que sea determinista.

export type TipoCredito = 'CONTADO' | 'D30' | 'D60' | 'D90';
export type EstadoCartera = 'AL_DIA' | 'VENCIDO' | 'BLOQUEADO';

function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Días de plazo según el tipo de crédito del cliente. */
export function diasCredito(tipo: TipoCredito): number {
  switch (tipo) {
    case 'D30': return 30;
    case 'D60': return 60;
    case 'D90': return 90;
    default: return 0; // CONTADO
  }
}

/** Saldo de una factura = total − suma de pagos (redondeo a 2 decimales). */
export function saldoFactura(total: number, pagos: { monto: number }[]): number {
  const pagado = pagos.reduce((acc, p) => acc + p.monto, 0);
  return redondear(total - pagado);
}

interface FacturaSaldo {
  fechaVencimiento: Date | null;
  saldo: number;
}

function estaVencida(f: FacturaSaldo, hoy: Date): boolean {
  return f.fechaVencimiento != null && f.saldo > 0 && f.fechaVencimiento.getTime() < hoy.getTime();
}

/**
 * Estado de cartera del cliente:
 * - BLOQUEADO manual tiene prioridad.
 * - VENCIDO si tiene alguna factura con saldo > 0 y vencimiento pasado.
 * - AL_DIA en otro caso.
 */
export function estadoCartera(
  facturas: FacturaSaldo[],
  hoy: Date,
  bloqueadoManual: boolean,
): EstadoCartera {
  if (bloqueadoManual) return 'BLOQUEADO';
  return facturas.some((f) => estaVencida(f, hoy)) ? 'VENCIDO' : 'AL_DIA';
}

export interface ResumenCartera {
  facturado: number;
  pagado: number;
  saldo: number;
  saldoVencido: number;
}

/** Totales de cartera de un cliente. */
export function resumenCartera(
  facturas: { total: number; pagado: number; saldo: number; fechaVencimiento: Date | null }[],
  hoy: Date,
): ResumenCartera {
  let facturado = 0, pagado = 0, saldo = 0, saldoVencido = 0;
  for (const f of facturas) {
    facturado += f.total;
    pagado += f.pagado;
    saldo += f.saldo;
    if (estaVencida({ fechaVencimiento: f.fechaVencimiento, saldo: f.saldo }, hoy)) saldoVencido += f.saldo;
  }
  return {
    facturado: redondear(facturado),
    pagado: redondear(pagado),
    saldo: redondear(saldo),
    saldoVencido: redondear(saldoVencido),
  };
}
