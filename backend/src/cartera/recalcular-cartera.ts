import { estadoCartera, saldoFactura } from './cartera-core';

/**
 * Recalcula y persiste el `estadoCartera` de un cliente a partir de sus facturas y pagos.
 * `BLOQUEADO` manual se respeta. Debe correr dentro de una transacción (recibe el tx).
 * `tx` es el cliente Prisma transaccional (tipado laxo para no acoplar al tipo generado).
 */
export async function recalcularEstadoCartera(
  tx: any,
  clienteId: number,
  hoy: Date,
): Promise<void> {
  const cliente = await tx.cliente.findUnique({
    where: { id: clienteId },
    select: { estadoCartera: true },
  });
  const bloqueadoManual = cliente?.estadoCartera === 'BLOQUEADO';

  // Por clienteId denormalizado: incluye las facturas de servicio, que no tienen
  // despacho. Antes se navegaba despacho→op→oc y esas habrían quedado fuera de
  // la cartera del cliente (deuda invisible).
  const facturas = await tx.factura.findMany({
    where: { clienteId },
    select: { total: true, fechaVencimiento: true, pagos: { select: { monto: true } } },
  });

  const conSaldo = facturas.map((f: any) => ({
    fechaVencimiento: f.fechaVencimiento as Date | null,
    saldo: saldoFactura(Number(f.total), f.pagos.map((p: any) => ({ monto: Number(p.monto) }))),
  }));

  const estado = estadoCartera(conSaldo, hoy, bloqueadoManual);
  await tx.cliente.update({ where: { id: clienteId }, data: { estadoCartera: estado } });
}
