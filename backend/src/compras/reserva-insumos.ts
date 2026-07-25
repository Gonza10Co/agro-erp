/** Subconjunto de PrismaClient/tx que usa la liberación (facilita specs). */
type TxReservas = {
  requerimientoCompra: {
    findMany(args: any): Promise<any[]>;
    update(args: any): Promise<any>;
  };
  inventarioMaterial: { update(args: any): Promise<any> };
};

type DecimalLike = { toNumber(): number } | number | null;
const num = (d: DecimalLike): number =>
  d == null ? 0 : typeof d === 'number' ? d : d.toNumber();

/**
 * Libera el amarre de insumos de una OP: devuelve al neto disponible lo que sus
 * requerimientos con reserva activa tenían amarrado y los marca como liberados.
 * Se usa al ANULAR la OP (los insumos vuelven a estar libres), al DESPACHARLA
 * (la producción terminó: la reserva ya cumplió su función) y al RECALCULAR el
 * requerimiento (el nuevo re-amarra desde cero; el viejo queda como histórico).
 * Idempotente: un requerimiento ya liberado no se toca dos veces.
 */
export async function liberarReservasDeOp(
  tx: TxReservas,
  opId: number,
): Promise<number> {
  const activos = await tx.requerimientoCompra.findMany({
    where: { opId, reservaActiva: true },
    include: { lineas: { select: { materialId: true, cantReservada: true } } },
  });
  for (const req of activos) {
    for (const l of req.lineas) {
      const cant = num(l.cantReservada);
      if (cant > 0) {
        await tx.inventarioMaterial.update({
          where: { materialId: l.materialId },
          data: { cantReservada: { decrement: cant } },
        });
      }
    }
    await tx.requerimientoCompra.update({
      where: { id: req.id },
      data: { reservaActiva: false },
    });
  }
  return activos.length;
}
