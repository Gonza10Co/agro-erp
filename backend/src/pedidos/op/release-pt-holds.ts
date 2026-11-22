import { ConflictException } from '@nestjs/common';

/** Subconjunto del tx que usa la liberación del amarre de PT (facilita specs). */
type TxPtHolds = {
  reservaInventarioPT: {
    deleteMany(args: any): Promise<{ count: number }>;
    count(args: any): Promise<number>;
  };
  inventarioPT: { update(args: any): Promise<any> };
};

export interface PtHold {
  id: number;
  inventarioPTId: number;
  cantidad: number;
}

/**
 * Suelta el amarre de PT de una OP: borra cada reserva y devuelve su cantidad al
 * disponible de la fila de `InventarioPT` (no es un movimiento de kardex: el par
 * nunca salió de bodega, solo deja de estar apartado).
 *
 * Cada reserva se borra solo si sigue como se leyó (una reasignación de pares en
 * paralelo la pudo cambiar) y, si al final aparece una nueva sobre esas tallas,
 * tampoco se sigue: quedaría ocupando stock. En ambos casos 409 con `changedMsg`.
 * La usan anular la OP y devolver la OC a borrador.
 */
export async function releasePtHolds(
  tx: TxPtHolds,
  holds: PtHold[],
  tallaIds: number[],
  changedMsg: string,
): Promise<void> {
  // Orden canónico de locks (por fila de inventario), igual que el despacho.
  const ordenadas = [...holds].sort(
    (a, b) => a.inventarioPTId - b.inventarioPTId || a.id - b.id,
  );
  for (const r of ordenadas) {
    const borrada = await tx.reservaInventarioPT.deleteMany({ where: { id: r.id, cantidad: r.cantidad } });
    if (borrada.count === 0) throw new ConflictException(changedMsg);
    await tx.inventarioPT.update({
      where: { id: r.inventarioPTId },
      data: { cantReservada: { decrement: r.cantidad } },
    });
  }
  if (tallaIds.length > 0) {
    const quedan = await tx.reservaInventarioPT.count({ where: { opLineaTallaId: { in: tallaIds } } });
    if (quedan > 0) throw new ConflictException(changedMsg);
  }
}
