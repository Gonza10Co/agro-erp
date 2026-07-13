import { OFDetalle } from '../../core/api/models/fabricacion.models';
import { armarEtiquetas, posicionEtiqueta, GRILLA } from './of-etiquetas.util';

/**
 * Render de las etiquetas de una OF a PDF (hoja carta adhesiva 3×8): Code128 del
 * código del par + texto legible + producto/talla/línea. jsPDF y JsBarcode se
 * importan dinámicamente: solo se descargan al primer uso (patrón de la proforma).
 * El lector físico opera en "modo teclado": lee el Code128 y tipea el código en
 * la pantalla del operario, no necesita integración propia.
 */

const TINTA: [number, number, number] = [40, 40, 40];

export async function descargarEtiquetasPdf(of: OFDetalle): Promise<void> {
  const etiquetas = armarEtiquetas(of);
  if (etiquetas.length === 0) return; // OF sin pares activos: nada que imprimir

  const [{ jsPDF }, { default: JsBarcode }] = await Promise.all([
    import('jspdf'),
    import('jsbarcode'),
  ]);
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });

  // Un solo canvas reutilizado: JsBarcode lo repinta por cada código.
  const canvas = document.createElement('canvas');

  etiquetas.forEach((e, i) => {
    const { pagina, x, y } = posicionEtiqueta(i);
    if (pagina > 0 && i % (GRILLA.cols * GRILLA.filas) === 0) doc.addPage();

    JsBarcode(canvas, e.codigo, {
      format: 'CODE128',
      displayValue: false,
      width: 2,
      height: 60,
      margin: 0,
    });
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', x + 4, y + 4, GRILLA.ancho - 8, 13);

    doc.setTextColor(...TINTA);
    doc.setFont('courier', 'bold');
    doc.setFontSize(10);
    doc.text(e.codigo, x + GRILLA.ancho / 2, y + 22, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const detalle = [e.producto, `Talla ${e.talla}`, e.linea].filter(Boolean).join(' · ');
    // La carta troquelada no perdona desbordes: se recorta al ancho de la etiqueta.
    doc.text(doc.splitTextToSize(detalle, GRILLA.ancho - 8)[0] ?? '', x + GRILLA.ancho / 2, y + 27, {
      align: 'center',
    });
  });

  doc.save(`etiquetas-OF${of.consecutivo}.pdf`);
}
