import { OFDetalle } from '../../core/api/models/fabricacion.models';
import { armarEtiquetas, posicionEtiqueta, GRILLA } from './of-etiquetas.util';

/**
 * Render de las etiquetas de una OF a PDF (hoja carta adhesiva 3×8). Cada etiqueta lleva
 * el código del par dos veces: como QR (lo lee la cámara de un celular en medio segundo,
 * torcido y arrugado) y como Code128 (lo lee un lector láser de planta). Los dos
 * "tipean" el mismo texto en la pantalla del operario, no hay integración propia.
 * jsPDF, JsBarcode y qrcode se importan dinámicamente: solo se descargan al primer uso.
 */

const TINTA: [number, number, number] = [40, 40, 40];

/** Reparto de la celda de 66×32 mm: QR a la izquierda, barras + texto a la derecha. */
const QR = { x: 3, y: 5, lado: 22 } as const;
const BARRAS = { x: 27, y: 4, ancho: 36, alto: 9 } as const;
const COL_TEXTO = BARRAS.x + BARRAS.ancho / 2;

export async function descargarEtiquetasPdf(of: OFDetalle): Promise<void> {
  const etiquetas = armarEtiquetas(of);
  if (etiquetas.length === 0) return; // OF sin pares activos: nada que imprimir

  const [{ jsPDF }, { default: JsBarcode }, { toDataURL }] = await Promise.all([
    import('jspdf'),
    import('jsbarcode'),
    import('qrcode'),
  ]);
  const qrs = await Promise.all(
    etiquetas.map((e) => toDataURL(e.codigo, { margin: 0, width: 240, errorCorrectionLevel: 'M' })),
  );
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });

  // Un solo canvas reutilizado: JsBarcode lo repinta por cada código.
  const canvas = document.createElement('canvas');

  etiquetas.forEach((e, i) => {
    const { pagina, x, y } = posicionEtiqueta(i);
    if (pagina > 0 && i % (GRILLA.cols * GRILLA.filas) === 0) doc.addPage();

    doc.addImage(qrs[i], 'PNG', x + QR.x, y + QR.y, QR.lado, QR.lado);

    JsBarcode(canvas, e.codigo, {
      format: 'CODE128',
      displayValue: false,
      width: 2,
      height: 60,
      margin: 0,
    });
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', x + BARRAS.x, y + BARRAS.y, BARRAS.ancho, BARRAS.alto);

    doc.setTextColor(...TINTA);
    doc.setFont('courier', 'bold');
    doc.setFontSize(9);
    doc.text(e.codigo, x + COL_TEXTO, y + 18, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    const detalle = [e.producto, `Talla ${e.talla}`, e.linea].filter(Boolean).join(' · ');
    // La carta troquelada no perdona desbordes: máximo dos renglones al ancho de la columna.
    doc.splitTextToSize(detalle, BARRAS.ancho).slice(0, 2).forEach((linea: string, n: number) => {
      doc.text(linea, x + COL_TEXTO, y + 22.5 + n * 3.5, { align: 'center' });
    });
  });

  doc.save(`etiquetas-OF${of.consecutivo}.pdf`);
}
