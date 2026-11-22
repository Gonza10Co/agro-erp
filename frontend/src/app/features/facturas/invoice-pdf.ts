import { InvoicePdf, moneda } from './invoice-pdf.util';

/**
 * Render de la factura a PDF, con el mismo formato de la proforma de la OC
 * (oc-proforma-pdf.ts): cabecera de color con el emisor, datos del cliente,
 * tabla de líneas, totales con IVA y pie. jsPDF se importa dinámicamente.
 */

const NARANJA: [number, number, number] = [232, 101, 13];
const TINTA: [number, number, number] = [40, 40, 40];
const GRIS: [number, number, number] = [120, 120, 120];
const GRIS_SUAVE: [number, number, number] = [246, 246, 246];
const ROJO: [number, number, number] = [200, 40, 40];

const MARGEN = 14;
const ANCHO = 210; // A4 vertical, en mm
const ALTO = 297;

type Ctor = new (opts: object) => any;
type AutoTableFn = (doc: unknown, opts: object) => void;

/**
 * Los imports CJS dinámicos en el build de prod a veces solo traen `default`
 * (pasó con qrcode, 2026-10-05). Se aceptan las dos formas.
 */
export function resolvePdfLibs(jspdfMod: unknown, autoTableMod: unknown): { jsPDF: Ctor; autoTable: AutoTableFn } {
  const j = jspdfMod as { jsPDF?: Ctor; default?: Ctor | { jsPDF?: Ctor } };
  const def = j.default as { jsPDF?: Ctor } | Ctor | undefined;
  const jsPDF = j.jsPDF ?? (def && 'jsPDF' in def ? def.jsPDF : (def as Ctor | undefined));
  const a = autoTableMod as { default?: AutoTableFn | { default?: AutoTableFn; autoTable?: AutoTableFn }; autoTable?: AutoTableFn };
  const autoTable =
    typeof a.default === 'function' ? a.default : (a.autoTable ?? a.default?.autoTable ?? a.default?.default);
  if (typeof jsPDF !== 'function' || typeof autoTable !== 'function') {
    throw new Error('no se pudo cargar el generador de PDF');
  }
  return { jsPDF, autoTable };
}

function fecha(d: Date): string {
  return d.toLocaleDateString('es-CO');
}

export async function downloadInvoicePdf(f: InvoicePdf): Promise<void> {
  const doc = await renderInvoicePdf(f);
  doc.save(`${f.numero}.pdf`);
}

/** Arma el documento sin guardarlo (lo usa la descarga y lo prueban los tests). */
export async function renderInvoicePdf(f: InvoicePdf): Promise<any> {
  const [jspdfMod, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const { jsPDF, autoTable } = resolvePdfLibs(jspdfMod, autoTableMod);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // ── Cabecera de marca ──────────────────────────────────────────────
  doc.setFillColor(...NARANJA);
  doc.rect(0, 0, ANCHO, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(f.emisor.nombre.toUpperCase(), MARGEN, 16);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const emisorDatos = [f.emisor.razonSocial, f.emisor.nit ? `NIT ${f.emisor.nit}` : null].filter(Boolean).join(' · ');
  if (emisorDatos) doc.text(emisorDatos, MARGEN, 23);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(f.tipo === 'SERVICIO' ? 13 : 15);
  doc.text(f.titulo, ANCHO - MARGEN, 14, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(f.numero, ANCHO - MARGEN, 21, { align: 'right' });
  doc.text(`Fecha: ${fecha(f.fecha)}`, ANCHO - MARGEN, 27, { align: 'right' });

  // ── Cliente y referencia del despacho ──────────────────────────────
  let y = 45;
  const dato = (etiqueta: string, valor: string) => {
    doc.setTextColor(...NARANJA);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(etiqueta, MARGEN, y);
    doc.setTextColor(...TINTA);
    doc.setFont('helvetica', 'normal');
    const x = MARGEN + doc.getTextWidth(etiqueta) + 2;
    const partes: string[] = doc.splitTextToSize(valor, ANCHO - MARGEN - x);
    doc.text(partes, x, y);
    y += 6 * partes.length;
  };
  dato('Cliente:', `${f.cliente.nombre} · NIT/CC ${f.cliente.nit}`);
  const domicilio = [f.cliente.direccion, f.cliente.ciudad].filter(Boolean).join(', ');
  if (domicilio) dato('Dirección:', domicilio);
  if (f.cliente.telefono) dato('Tel:', f.cliente.telefono);
  if (f.referencia) dato('Despacho:', f.referencia);
  if (f.entrega) dato('Entrega:', f.parcial ? `${f.entrega} · ${f.parcial}` : f.entrega);
  if (f.direccionEntrega) dato('Lugar de entrega:', f.direccionEntrega);
  if (f.vencimiento) dato('Vence:', fecha(f.vencimiento));

  // ── Líneas ─────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y + 2,
    margin: { left: MARGEN, right: MARGEN },
    head: [f.head],
    body: f.rows,
    theme: 'plain',
    styles: { fontSize: 9.5, textColor: TINTA, cellPadding: 2.5 },
    headStyles: { fillColor: GRIS_SUAVE, fontStyle: 'bold' },
    columnStyles: {
      1: { halign: f.tipo === 'SERVICIO' ? 'left' : 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
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
  totalFila(f.tipo === 'SERVICIO' ? 'Unidades' : 'Total pares', f.totalUnidades.toLocaleString('es-CO'));
  totalFila('Subtotal', moneda(f.subtotal));
  totalFila(`IVA (${f.ivaPct}%)`, moneda(f.iva));
  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...NARANJA);
  doc.text('TOTAL', MARGEN, y);
  doc.text(moneda(f.total), ANCHO - MARGEN, y, { align: 'right' });

  // ── Anulada: marca de agua ─────────────────────────────────────────
  if (f.anulada) {
    doc.setTextColor(...ROJO);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(60);
    doc.text('ANULADA', ANCHO / 2, ALTO / 2, { align: 'center', angle: 30 });
  }

  // ── Pie: documento interno (sin CUFE ni resolución DIAN) ───────────
  doc.setTextColor(...GRIS);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(f.pie, ANCHO / 2, ALTO - 10, { align: 'center' });

  return doc;
}
