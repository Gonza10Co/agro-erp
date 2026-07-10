import { Proforma } from './oc-proforma.util';

/**
 * Render de la cotización/proforma a PDF (formato de la proforma que usa el cliente:
 * cabecera de color con el emisor, tabla de conceptos, curva de tallas, IVA y bloque
 * de consignación). jsPDF se importa dinámicamente: solo se descarga al primer uso.
 */

const NARANJA: [number, number, number] = [232, 101, 13];
const TINTA: [number, number, number] = [40, 40, 40];
const GRIS_SUAVE: [number, number, number] = [246, 246, 246];
const VERDE_FONDO: [number, number, number] = [234, 247, 238];
const VERDE_TINTA: [number, number, number] = [30, 122, 56];

const MARGEN = 14;
const ANCHO = 210; // A4 vertical, en mm

function moneda(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CO');
}

export async function descargarProformaPdf(p: Proforma): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // ── Cabecera de marca ──────────────────────────────────────────────
  doc.setFillColor(...NARANJA);
  doc.rect(0, 0, ANCHO, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(p.emisor.nombre.toUpperCase(), MARGEN, 16);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`${p.emisor.razonSocial} · NIT ${p.emisor.nit}`, MARGEN, 23);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('PROFORMA', ANCHO - MARGEN, 14, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(p.numero, ANCHO - MARGEN, 21, { align: 'right' });
  doc.text(p.fecha.toLocaleDateString('es-CO'), ANCHO - MARGEN, 27, { align: 'right' });

  // ── Cliente ────────────────────────────────────────────────────────
  let y = 45;
  const dato = (etiqueta: string, valor: string) => {
    doc.setTextColor(...NARANJA);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(etiqueta, MARGEN, y);
    doc.setTextColor(...TINTA);
    doc.setFont('helvetica', 'normal');
    doc.text(valor, MARGEN + doc.getTextWidth(etiqueta) + 2, y);
    y += 6;
  };
  dato('Cliente:', `${p.clienteNombre} · NIT/CC ${p.clienteNit}`);
  if (p.clienteTel) dato('Tel:', p.clienteTel);
  if (p.entrega) dato('Entrega:', p.entrega);

  // ── Conceptos ──────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y + 2,
    margin: { left: MARGEN, right: MARGEN },
    head: [['Concepto', 'Pares', 'Precio/par', 'Subtotal']],
    body: p.lineas.map((l) => [l.concepto, String(l.pares), moneda(l.precioPar), moneda(l.subtotal)]),
    theme: 'plain',
    styles: { fontSize: 9.5, textColor: TINTA, cellPadding: 2.5 },
    headStyles: { fillColor: GRIS_SUAVE, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  });

  // ── Curva de tallas ────────────────────────────────────────────────
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 4,
    margin: { left: MARGEN, right: MARGEN },
    head: [['Distribución por talla', 'Cantidad']],
    body: p.tallas.map((t) => [`Talla ${t.valor}`, `${t.cantidad} par(es)`]),
    theme: 'plain',
    styles: { fontSize: 9.5, textColor: TINTA, cellPadding: 2.5 },
    headStyles: { fillColor: GRIS_SUAVE, fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' } },
  });

  // ── Totales ────────────────────────────────────────────────────────
  y = (doc as any).lastAutoTable.finalY + 8;
  doc.setTextColor(...TINTA);
  doc.setFontSize(9.5);
  const totalFila = (etiqueta: string, valor: string) => {
    doc.setFont('helvetica', 'normal');
    doc.text(etiqueta, MARGEN, y);
    doc.text(valor, ANCHO - MARGEN, y, { align: 'right' });
    y += 6;
  };
  totalFila('Subtotal', moneda(p.subtotal));
  totalFila(`IVA (${p.ivaPct}%)`, moneda(p.iva));
  totalFila('Transporte', 'Al cobro (transportadora que elija)');
  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...NARANJA);
  doc.text('TOTAL', MARGEN, y);
  doc.text(moneda(p.total), ANCHO - MARGEN, y, { align: 'right' });

  // ── Bloque de consignación ─────────────────────────────────────────
  y += 8;
  doc.setFillColor(...VERDE_FONDO);
  doc.roundedRect(MARGEN, y, ANCHO - MARGEN * 2, 22, 2, 2, 'F');
  doc.setTextColor(...VERDE_TINTA);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Para confirmar tu pedido, consigna en:', MARGEN + 5, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(p.emisor.datosPago, MARGEN + 5, y + 13, { maxWidth: ANCHO - MARGEN * 2 - 10 });
  doc.text('Envía el comprobante por WhatsApp y lo despachamos.', MARGEN + 5, y + 19);

  doc.save(`${p.numero}.pdf`);
}
