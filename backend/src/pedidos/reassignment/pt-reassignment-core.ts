/**
 * Reasignación de pares de PT entre pedidos. Lógica pura (sin BD).
 *
 * JP, 2026-11-19: un pedido (A) está listo, leído y embalado, pero no se despacha;
 * llega otro (B) que hay que despachar ya. Gerencia pasa X pares RESERVADOS para A
 * a B, o los libera en bodega para que los tome la OP de B al generarse.
 *
 * Los pares no se mueven: la reserva de B queda sobre la misma fila de
 * `InventarioPT` (mismo producto, talla, calidad y BODEGA) de la que salió la de A.
 * Por eso `cantReservada` de la fila no cambia al pasar; solo baja al liberar.
 */

export interface ReservaOrigen {
  reservaId: number;
  opLineaTallaId: number;
  inventarioPTId: number;
  cantidad: number;
  /** Prioridad de la bodega: menor = principal (la misma regla del amarre). */
  prioridad: number;
}

export interface DestinoTalla {
  opLineaTallaId: number;
  /** Lo que le falta a esa talla de B: necesidad − reservado. */
  pending: number;
}

export interface Take {
  reservaId: number;
  opLineaTallaId: number;
  inventarioPTId: number;
  cantidad: number;
}

export interface Give {
  opLineaTallaId: number;
  inventarioPTId: number;
  cantidad: number;
}

export class ReassignmentError extends Error {}

/**
 * Qué reservas de A se reducen y qué reservas de B se crean. Sin destino (`null`)
 * es "liberar": los pares quedan libres en bodega.
 */
export function planMove(
  reservasA: ReservaOrigen[],
  destino: DestinoTalla[] | null,
  quantity: number,
): { takes: Take[]; gives: Give[] } {
  if (!Number.isInteger(quantity) || quantity <= 0)
    throw new ReassignmentError('La cantidad debe ser un número entero de pares mayor que cero');

  const reservado = reservasA.reduce((a, r) => a + r.cantidad, 0);
  if (quantity > reservado)
    throw new ReassignmentError(`El pedido solo tiene ${reservado} pares reservados de esa talla; no se le pueden sacar ${quantity}`);
  if (destino) {
    const falta = destino.reduce((a, d) => a + Math.max(d.pending, 0), 0);
    if (quantity > falta)
      throw new ReassignmentError(
        falta === 0
          ? 'El pedido destino ya tiene completa esa talla'
          : `Al pedido destino solo le faltan ${falta} pares de esa talla; no se le pueden pasar ${quantity}`,
      );
  }

  const takes: Take[] = [];
  let resto = quantity;
  for (const r of [...reservasA].sort((a, b) => a.prioridad - b.prioridad || a.reservaId - b.reservaId)) {
    if (resto <= 0) break;
    const c = Math.min(resto, r.cantidad);
    if (c <= 0) continue;
    takes.push({ reservaId: r.reservaId, opLineaTallaId: r.opLineaTallaId, inventarioPTId: r.inventarioPTId, cantidad: c });
    resto -= c;
  }

  const gives: Give[] = [];
  if (destino) {
    const huecos = destino.map((d) => ({ id: d.opLineaTallaId, libre: Math.max(d.pending, 0) }));
    let i = 0;
    for (const t of takes) {
      let porDar = t.cantidad;
      while (porDar > 0) {
        while (huecos[i].libre === 0) i++;
        const c = Math.min(porDar, huecos[i].libre);
        const prev = gives.find((g) => g.opLineaTallaId === huecos[i].id && g.inventarioPTId === t.inventarioPTId);
        if (prev) prev.cantidad += c;
        else gives.push({ opLineaTallaId: huecos[i].id, inventarioPTId: t.inventarioPTId, cantidad: c });
        huecos[i].libre -= c;
        porDar -= c;
      }
    }
  }
  return { takes, gives };
}

/**
 * B recibió pares ya hechos: lo que tenía programado a producir de esa talla baja y
 * pasa a "amarrado" (la necesidad del pedido no cambia). Nunca por debajo de lo que
 * ya nació en planta para la OP (`ocupados`: pares vivos + etiquetas impresas): esos
 * pares siguen su curso y, si sobran, entran libres a bodega al terminar.
 */
export function planShiftToStock(
  filasB: { id: number; cantAProducir: number }[],
  ocupados: number,
  received: number,
): { id: number; cantidad: number }[] {
  const programado = filasB.reduce((a, f) => a + Math.max(f.cantAProducir, 0), 0);
  let resto = Math.min(received, Math.max(programado - ocupados, 0));
  const out: { id: number; cantidad: number }[] = [];
  for (const f of filasB) {
    if (resto <= 0) break;
    const c = Math.min(resto, Math.max(f.cantAProducir, 0));
    if (c > 0) {
      out.push({ id: f.id, cantidad: c });
      resto -= c;
    }
  }
  return out;
}
