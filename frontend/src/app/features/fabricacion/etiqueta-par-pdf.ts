import { ParNacido, ParDetalle } from '../../core/api/models/fabricacion.models';

/**
 * Etiquetas del piloto (2026-09-09), pensadas para impresora de etiquetas con
 * guillotina: una etiqueta por página, no la hoja carta troquelada de of-etiquetas.
 *
 *  - Etiqueta de la LENGUA (40×25 mm; era de 50×30 y Valen la pidió más pequeña
 *    el 2026-10-07): nace con el par en Preparación. Solo QR
 *    (Mauricio: "de aquí en adelante solo QR, por facilidad"), talla grande para
 *    que se lea a un metro, código y referencia/marca.
 *  - Sticker de la CAJA (60×40 mm): sale al terminar el par en PT. Reemplaza los
 *    sellos de talla/referencia/color y lleva la fecha de empaque (trazabilidad).
 *
 * jsPDF y qrcode se importan dinámicamente: solo se descargan al primer uso.
 */

const TINTA: [number, number, number] = [20, 20, 20];

export const ETIQUETA_LENGUA = { ancho: 40, alto: 25 } as const;
export const STICKER_CAJA = { ancho: 60, alto: 40 } as const;

async function libs() {
  const [{ jsPDF }, qr] = await Promise.all([import('jspdf'), import('qrcode')]);
  return { jsPDF, toDataURL: toDataURLDe(qr) };
}

type ModuloQr = { toDataURL?: unknown; default?: { toDataURL?: unknown } };

/**
 * qrcode es CommonJS: en el build de producción su chunk solo exporta `default`
 * y el `toDataURL` nombrado llega undefined ("r is not a function", 2026-10-05).
 * En dev y en los tests sí llega nombrado, por eso se aceptan las dos formas.
 */
export function toDataURLDe(mod: unknown): (texto: string, opciones?: object) => Promise<string> {
  const m = mod as ModuloQr;
  const fn = typeof m.toDataURL === 'function' ? m.toDataURL : m.default?.toDataURL;
  if (typeof fn !== 'function') throw new Error('no se pudo cargar el generador de QR');
  return fn as (texto: string, opciones?: object) => Promise<string>;
}

/**
 * Baja el generador de PDF apenas abre la pantalla, no al imprimir: esos archivos
 * llevan hash y un deploy los reemplaza, así que una pestaña abierta desde antes
 * pedía uno que ya no existía y la etiqueta no salía (pasó el 2026-09-28).
 */
export function precargarGeneradorEtiquetas(): void {
  libs().catch(() => { /* si falla aquí, la impresión lo reporta con su mensaje */ });
}

/** Mensaje para la persona cuando una etiqueta no se pudo generar. */
export function motivoFalloEtiqueta(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return /dynamically imported module|Loading chunk|Failed to fetch|import/i.test(msg)
    ? 'El sistema se actualizó mientras la pantalla estaba abierta: recarga la página (F5) y vuelve a imprimir.'
    : `No se pudo generar el PDF (${msg || 'error desconocido'}).`;
}

/** Una etiqueta de lengua por par, en un solo PDF (una página por etiqueta). */
export async function descargarEtiquetasLengua(pares: ParNacido[]): Promise<void> {
  if (pares.length === 0) return;
  const doc = await pdfEtiquetasLengua(pares);
  doc.save(nombrePdfLenguas(pares));
}

/** `etiquetas-OF19-T39-32.pdf`: la talla va en el nombre cuando la tanda es de una sola. */
export function nombrePdfLenguas(pares: ParNacido[]): string {
  if (pares.length === 1) return `etiqueta-${pares[0].codigo}.pdf`;
  const tallas = new Set(pares.map((p) => p.talla));
  const talla = tallas.size === 1 ? `-T${pares[0].talla}` : '';
  return `etiquetas-OF${pares[0].of}${talla}-${pares.length}.pdf`;
}

/** Arma el PDF de las lenguas (40×25 mm, una por página) sin bajarlo. */
export async function pdfEtiquetasLengua(pares: ParNacido[]) {
  const { jsPDF, toDataURL } = await libs();
  const { ancho, alto } = ETIQUETA_LENGUA;
  const doc = new jsPDF({ unit: 'mm', format: [ancho, alto], orientation: 'landscape' });
  const qrs = await Promise.all(
    pares.map((p) => toDataURL(p.codigo, { margin: 0, width: 300, errorCorrectionLevel: 'M' })),
  );

  pares.forEach((p, i) => {
    if (i > 0) doc.addPage([ancho, alto], 'landscape');
    // QR a la izquierda, casi toda la altura: lo lee la cámara del celular torcido y arrugado.
    doc.addImage(qrs[i], 'PNG', 1.5, 1.5, 22, 22);

    doc.setTextColor(...TINTA);
    const centro = 32; // columna de datos, a la derecha del QR
    // La talla es lo que el operario busca a un metro: gigante.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text(p.talla, centro, 10.5, { align: 'center' });
    doc.setFontSize(5);
    doc.setFont('helvetica', 'normal');
    doc.text('TALLA', centro, 13.5, { align: 'center' });

    doc.setFont('courier', 'bold');
    doc.setFontSize(7);
    doc.text(p.codigo, centro, 18, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    const detalle = [p.referencia, p.marca].filter(Boolean).join(' · ');
    doc.splitTextToSize(detalle, 15).slice(0, 1).forEach((linea: string) => {
      doc.text(linea, centro, 22, { align: 'center' });
    });
  });

  return doc;
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
  /** Una SEGUNDA se imprime marcada y sin cliente: ya no va al pedido, va a saldos. */
  calidad: 'PRIMERA' | 'SEGUNDA';
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
    // ⚠️ Asunción hasta que JP/Mauricio respondan (plan 2026-09-11, pregunta 2):
    // una segunda no lleva marquilla ni va al cliente del pedido, así que el
    // sticker sale sin cliente y con la marca SEGUNDA bien visible.
    cliente: p.calidad === 'SEGUNDA' ? '' : (p.of?.op?.oc?.cliente?.nombre ?? ''),
    calidad: p.calidad === 'SEGUNDA' ? 'SEGUNDA' : 'PRIMERA',
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

  // Una SEGUNDA lleva la marca donde iría el cliente: es lo que el almacenista
  // tiene que ver antes de ponerla en la estantería de primeras.
  if (d.calidad === 'SEGUNDA') {
    doc.setFillColor(...TINTA);
    doc.rect(4, 32.4, ancho - 8, 4.4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('SEGUNDA', ancho / 2, 35.6, { align: 'center' });
    doc.setTextColor(...TINTA);
  }

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
