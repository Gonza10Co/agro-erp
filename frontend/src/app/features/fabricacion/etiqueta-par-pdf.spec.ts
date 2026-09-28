import { motivoFalloEtiqueta } from './etiqueta-par-pdf';

describe('motivoFalloEtiqueta', () => {
  it('un archivo del generador que ya no existe (deploy con la pestaña abierta) pide recargar', () => {
    const e = new TypeError('Failed to fetch dynamically imported module: https://x/chunk-ABC.js');
    expect(motivoFalloEtiqueta(e)).toMatch(/recarga la página/);
  });

  it('cualquier otro fallo muestra su causa', () => {
    expect(motivoFalloEtiqueta(new Error('sin memoria'))).toBe('No se pudo generar el PDF (sin memoria).');
  });
});
