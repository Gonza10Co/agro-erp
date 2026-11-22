/**
 * "Devolver a borrador" una OC confirmada (el pedido se confirmó con un error).
 * Solo se permite si NADA arrancó físicamente: deshacer la confirmación borra la
 * OP y sus OF vacías, y eso solo es seguro si no hay historia que perder.
 *
 * Lógica pura: recibe la foto de la OP (leída con los locks tomados) y devuelve
 * los motivos que lo bloquean, en español, listos para mostrar. Vacío = se puede.
 */

export const OC_UNCONFIRMABLE_STATES = ['CONFIRMADA', 'EN_PRODUCCION'] as const;

export interface UnconfirmSnapshotOf {
  consecutivo: number;
  estado: string;
  pares: number;
  etiquetasReservadas: number;
  movimientos: number;
  ordenesCorte: string[];
}

export interface UnconfirmSnapshot {
  despachos: { consecutivo: number; factura: { consecutivo: number } | null }[];
  ofs: UnconfirmSnapshotOf[];
  ptReassignmentsOut: number;
  ptReassignmentsIn: number;
  tallas: { dispatched: number; reassignedOut: number }[];
  requerimientos: { consecutivo: number; ordenesCompra: { consecutivo: number }[] }[];
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function unconfirmBlockers(s: UnconfirmSnapshot): string[] {
  const motivos: string[] = [];

  const facturas = s.despachos.filter((d) => d.factura).map((d) => `FAC-${d.factura!.consecutivo}`);
  if (facturas.length > 0) motivos.push(`Ya está facturado (${facturas.join(', ')})`);
  if (s.despachos.length > 0 || s.tallas.some((t) => t.dispatched > 0)) {
    const dsp = s.despachos.map((d) => `DSP-${d.consecutivo}`).join(', ');
    motivos.push(s.despachos.length === 1 ? `Ya tiene un despacho (${dsp})` : `Ya tiene despachos${dsp ? ` (${dsp})` : ''}`);
  }

  for (const of of s.ofs) {
    const nombre = `OF-${of.consecutivo}`;
    if (of.pares > 0) motivos.push(`Ya hay ${plural(of.pares, 'par nacido', 'pares nacidos')} en la ${nombre}`);
    if (of.etiquetasReservadas > 0)
      motivos.push(`Ya hay ${plural(of.etiquetasReservadas, 'etiqueta impresa', 'etiquetas impresas')} por adelantado en la ${nombre}`);
    if (of.movimientos > 0) motivos.push(`Ya se registró consumo de materiales en la ${nombre}`);
    if (of.ordenesCorte.length > 0)
      motivos.push(`La ${nombre} ya está programada en la orden de corte ${of.ordenesCorte.join(', ')}`);
    // Una OF que avanzó sin pares ni consumo no debería existir; si existe, se respeta.
    if (of.pares === 0 && of.estado !== 'ABIERTA' && of.estado !== 'ANULADA')
      motivos.push(`La ${nombre} ya arrancó en planta`);
  }

  if (s.ptReassignmentsOut > 0 || s.tallas.some((t) => t.reassignedOut > 0))
    motivos.push('Ya se pasaron o liberaron pares de este pedido hacia otro');
  if (s.ptReassignmentsIn > 0) motivos.push('Este pedido ya recibió pares pasados desde otro pedido');

  for (const r of s.requerimientos) {
    if (r.ordenesCompra.length > 0) {
      const ocp = r.ordenesCompra.map((o) => `OCP-${o.consecutivo}`).join(', ');
      motivos.push(`El requerimiento REQ-${r.consecutivo} ya se convirtió en orden de compra a proveedor (${ocp})`);
    }
  }

  return motivos;
}
