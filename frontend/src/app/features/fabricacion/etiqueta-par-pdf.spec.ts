import { motivoFalloEtiqueta, nombrePdfLenguas, pdfEtiquetasLengua, ETIQUETA_LENGUA } from './etiqueta-par-pdf';
import { ParNacido } from '../../core/api/models/fabricacion.models';

const lengua = (codigo: string, talla: string): ParNacido => ({
  id: 1, codigo, talla, producto: 'Bota', productoCodigo: '101-61-CON_PUNTERA', referencia: '101', marca: 'Agro', linea: 'Agro', of: 19,
});

describe('etiqueta de la lengua', () => {
  it('una página de 50×30 mm por par, con la TALLA grande, el código y la referencia', async () => {
    const doc = await pdfEtiquetasLengua([lengua('OF19-0001', '39'), lengua('OF19-0002', '39')]);
    expect(doc.getNumberOfPages()).toBe(2);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    expect([Math.round(w), Math.round(h)]).toEqual([ETIQUETA_LENGUA.ancho, ETIQUETA_LENGUA.alto]);
    const crudo = doc.output();
    expect(crudo).toContain('(39)');
    expect(crudo).toContain('(TALLA)');
    expect(crudo).toContain('(OF19-0002)');
    expect(crudo).toContain('101');
  });

  it('el nombre del PDF lleva la talla cuando la tanda es de una sola', () => {
    expect(nombrePdfLenguas([lengua('OF19-0001', '39'), lengua('OF19-0002', '39')])).toBe('etiquetas-OF19-T39-2.pdf');
    expect(nombrePdfLenguas([lengua('OF19-0001', '39'), lengua('OF19-0040', '40')])).toBe('etiquetas-OF19-2.pdf');
    expect(nombrePdfLenguas([lengua('OF19-0001', '39')])).toBe('etiqueta-OF19-0001.pdf');
  });
});

describe('motivoFalloEtiqueta', () => {
  it('un archivo del generador que ya no existe (deploy con la pestaña abierta) pide recargar', () => {
    const e = new TypeError('Failed to fetch dynamically imported module: https://x/chunk-ABC.js');
    expect(motivoFalloEtiqueta(e)).toMatch(/recarga la página/);
  });

  it('cualquier otro fallo muestra su causa', () => {
    expect(motivoFalloEtiqueta(new Error('sin memoria'))).toBe('No se pudo generar el PDF (sin memoria).');
  });
});
