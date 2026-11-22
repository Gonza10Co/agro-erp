import { buildOrdersPdfData, ORDERS_PDF_COLUMNS, ordersPdfFileName, totalsRow } from './oc-list-pdf.util';
import { OrdenCompra } from '../../../core/api/models/pedidos.models';

/**
 * "Imprimir pedidos": la lista filtrada en PDF horizontal, agrupada por cliente con
 * subtotales y total general. jsPDF se importa dinámicamente (mismo patrón que la
 * proforma: el default de jspdf-autotable es la función).
 */

const NARANJA: [number, number, number] = [232, 101, 13];
const TINTA: [number, number, number] = [40, 40, 40];
const GRIS_SUAVE: [number, number, number] = [246, 246, 246];
const GRIS_SUBTOTAL: [number, number, number] = [232, 232, 232];

const MARGEN = 12;
const ANCHO = 297; // A4 horizontal, en mm

export async function downloadOrdersPdf(ocs: OrdenCompra[], filtros: string[], ahora = new Date()): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const data = buildOrdersPdfData(ocs);

  // ── Encabezado ─────────────────────────────────────────────────────
  doc.setTextColor(...NARANJA);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Pedidos', MARGEN, 16);
  doc.setTextColor(...TINTA);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Impreso el ${ahora.toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`, ANCHO - MARGEN, 16, { align: 'right' });
  const textoFiltros = filtros.length ? `Filtros: ${filtros.join(' · ')}` : 'Filtros: ninguno (todos los pedidos)';
  const lineas = doc.splitTextToSize(textoFiltros, ANCHO - MARGEN * 2) as string[];
  doc.text(lineas, MARGEN, 23);
  const startY = 23 + lineas.length * 4.5 + 2;

  // ── Tabla agrupada por cliente ─────────────────────────────────────
  const cols = ORDERS_PDF_COLUMNS.length;
  const body: any[] = [];
  // Subtotal/total: la etiqueta ocupa las columnas de texto, los pares quedan alineados.
  const filaTotal = (label: string, t: typeof data.total, estilo: Record<string, unknown>) => {
    const [etiqueta, pedidos, , , , , , , ...pares] = totalsRow(label, t);
    return [
      { content: `${etiqueta} (${pedidos})`, colSpan: cols - 3, styles: estilo },
      ...pares.map((c) => ({ content: c, styles: { ...estilo, halign: 'right' } })),
    ];
  };
  for (const g of data.groups) {
    body.push([{ content: g.client, colSpan: cols, styles: { fontStyle: 'bold', textColor: NARANJA, fillColor: [255, 255, 255] } }]);
    body.push(...g.rows);
    body.push(filaTotal(`Subtotal ${g.client}`, g.subtotal, { fontStyle: 'bold', fillColor: GRIS_SUBTOTAL }));
  }
  body.push(filaTotal('TOTAL GENERAL', data.total, { fontStyle: 'bold', fillColor: NARANJA, textColor: [255, 255, 255] }));

  autoTable(doc, {
    startY,
    margin: { left: MARGEN, right: MARGEN, bottom: 14 },
    head: [ORDERS_PDF_COLUMNS],
    body,
    theme: 'plain',
    styles: { fontSize: 8, textColor: TINTA, cellPadding: 1.6, overflow: 'linebreak' },
    headStyles: { fillColor: GRIS_SUAVE, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 26 },
      5: { cellWidth: 40 },
      6: { cellWidth: 40 },
      8: { halign: 'right' },
      9: { halign: 'right' },
      10: { halign: 'right' },
    },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(...TINTA);
      doc.text(`Página ${doc.getNumberOfPages()}`, ANCHO - MARGEN, 205, { align: 'right' });
    },
  });

  doc.save(ordersPdfFileName(ahora));
}
