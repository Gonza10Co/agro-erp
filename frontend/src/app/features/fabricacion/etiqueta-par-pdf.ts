import { ParNacido, ParDetalle } from '../../core/api/models/fabricacion.models';

/**
 * Etiquetas del piloto (2026-09-09), pensadas para impresora de etiquetas con
 * guillotina: una etiqueta por página, no la hoja carta troquelada de of-etiquetas.
 *
 *  - Etiqueta de la LENGUA (50×30 mm): nace con el par en Preparación. Solo QR
 *    (Mauricio: "de aquí en adelante solo QR, por facilidad"), talla grande para
 *    que se lea a un metro, código y referencia/marca.
 *  - Sticker de la CAJA (60×40 mm): sale al terminar el par en PT. Reemplaza los
 *    sellos de talla/referencia/color y lleva la fecha de empaque (trazabilidad).
 *
 * jsPDF y qrcode se importan dinámicamente: solo se descargan al primer uso.
 */

const TINTA: [number, number, number] = [20, 20, 20];

export const ETIQUETA_LENGUA = { ancho: 50, alto: 30 } as const;
export const STICKER_CAJA = { ancho: 60, alto: 40 } as const;

async function libs() {
  const [{ jsPDF }, { toDataURL }] = await Promise.all([import('jspdf'), import('qrcode')]);
  return { jsPDF, toDataURL };
}

/** Una etiqueta de lengua por par, en un solo PDF (una página por etiqueta). */
export async function descargarEtiquetasLengua(pares: ParNacido[]): Promise<void> {
  if (pares.length === 0) return;
  const { jsPDF, toDataURL } = await libs();
  const { ancho, alto } = ETIQUETA_LENGUA;
  const doc = new jsPDF({ unit: 'mm', format: [ancho, alto], orientation: 'landscape' });
  const qrs = await Promise.all(
    pares.map((p) => toDataURL(p.codigo, { margin: 0, width: 300, errorCorrectionLevel: 'M' })),
  );

  pares.forEach((p, i) => {
    if (i > 0) doc.addPage([ancho, alto], 'landscape');
    // QR a la izquierda, casi toda la altura: lo lee la cámara del celular torcido y arrugado.
    doc.addImage(qrs[i], 'PNG', 2, 2, 26, 26);

    doc.setTextColor(...TINTA);
    // La talla es lo que el operario busca a un metro: gigante.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(30);
    doc.text(p.talla, 39, 14, { align: 'center' });
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text('TALLA', 39, 17.5, { align: 'center' });

    doc.setFont('courier', 'bold');
    doc.setFontSize(8);
    doc.text(p.codigo, 39, 22.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    const detalle = [p.referencia, p.marca].filter(Boolean).join(' · ');
    doc.splitTextToSize(detalle, 20).slice(0, 1).forEach((linea: string) => {
      doc.text(linea, 39, 26.5, { align: 'center' });
    });
  });

  const nombre = pares.length === 1 ? `etiqueta-${pares[0].codigo}.pdf` : `etiquetas-OF${pares[0].of}-${pares.length}.pdf`;
  doc.save(nombre);
}

/**
 * Un par ya existente con la forma que espera la etiqueta de la lengua: es la
 * REIMPRESIÓN (la etiqueta se despegó o se dañó), no un nacimiento — por eso
 * sale de un par que se busca por código, de a uno.
 */
export function datosLenguaDePar(p: ParDetalle): ParNacido {
  return {
    id: p.id,
    codigo: p.codigo,
    talla: String(p.talla?.valor ?? ''),
    producto: p.productoConfigurado?.nombreComercial ?? '',
    productoCodigo: p.productoConfigurado?.codigo ?? '',
    referencia: p.productoConfigurado?.referencia?.codigo ?? '',
    marca: p.productoConfigurado?.marca?.nombre ?? '',
    linea: p.linea?.nombre ?? '',
    of: p.of?.consecutivo ?? 0,
  };
}

/** Lo que va en el sticker de la caja. */
export interface DatosCaja {
  codigo: string;
  talla: string;
  referencia: string;
  producto: string;
  marca: string;
  color: string;
  cliente: string;
  fecha: Date;
}

export function datosCajaDePar(p: ParDetalle, fecha = new Date()): DatosCaja {
  return {
    codigo: p.codigo,
    talla: String(p.talla?.valor ?? ''),
    referencia: p.productoConfigurado?.referencia?.codigo ?? '',
    producto: p.productoConfigurado?.nombreComercial ?? '',
    marca: p.productoConfigurado?.marca?.nombre ?? '',
    // El color es una opción del configurador, no un campo del producto.
    color:
      p.productoConfigurado?.opciones?.find((o) => o.opcion.grupoOpcion.codigo === 'COLOR')?.opcion
        .nombre ?? '',
    cliente: p.of?.op?.oc?.cliente?.nombre ?? '',
    fecha,
  };
}

/**
 * Sticker de la caja: reemplaza los sellos a mano de talla / referencia / color.
 * El orden lo pidió Mauricio (2026-09-11): lo que el almacenista busca primero es
 * la TALLA y el COLOR, y el nombre del cliente es lo que le dice a quién despachar.
 */
export async function descargarStickerCaja(d: DatosCaja): Promise<void> {
  const { jsPDF, toDataURL } = await libs();
  const { ancho, alto } = STICKER_CAJA;
  const doc = new jsPDF({ unit: 'mm', format: [ancho, alto], orientation: 'landscape' });
  const qr = await toDataURL(d.codigo, { margin: 0, width: 300, errorCorrectionLevel: 'M' });
  const centroDatos = 40; // a la derecha del QR

  doc.addImage(qr, 'PNG', 2.5, 3, 19, 19);
  doc.setTextColor(...TINTA);

  // Talla y color, lo que se lee a un metro en la estantería.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.text(d.talla, centroDatos, 14, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.text('TALLA', centroDatos, 17.5, { align: 'center' });

  if (d.color) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.splitTextToSize(d.color.toUpperCase(), 34).slice(0, 1)
      .forEach((linea: string) => doc.text(linea, centroDatos, 22.5, { align: 'center' }));
  }

  // Referencia, producto y marca, a lo ancho del sticker.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.splitTextToSize([d.referencia, d.producto].filter(Boolean).join(' · '), 56).slice(0, 1)
    .forEach((linea: string) => doc.text(linea, ancho / 2, 27.5, { align: 'center' }));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  if (d.marca) doc.text(d.marca, ancho / 2, 30.8, { align: 'center' });

  // El cliente, separado por una línea: es el dato del despacho, no del producto.
  if (d.cliente) {
    doc.setDrawColor(170, 170, 170);
    doc.setLineWidth(0.2);
    doc.line(4, 32.6, ancho - 4, 32.6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.splitTextToSize(d.cliente, 54).slice(0, 1)
      .forEach((linea: string) => doc.text(linea, ancho / 2, 35.6, { align: 'center' }));
  }

  doc.setFont('courier', 'normal');
  doc.setFontSize(6);
  const f = d.fecha;
  const fecha = `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}/${f.getFullYear()}`;
  doc.text(`${d.codigo}  ·  empacado ${fecha}`, ancho / 2, 38.5, { align: 'center' });

  doc.save(`caja-${d.codigo}.pdf`);
}
