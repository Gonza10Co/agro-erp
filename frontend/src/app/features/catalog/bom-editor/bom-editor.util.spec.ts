import { lineaDuplicada, mensajeDuplicado } from './bom-editor.util';

const MICROPIEL = 10;
const SINTETICO = 20;
const CAPELLADA = 1;
const TALON = 2;

describe('lineaDuplicada', () => {
  it('permite el mismo material en piezas distintas (el pedido del cliente)', () => {
    const lineas = [{ materialId: MICROPIEL, piezaId: CAPELLADA }];
    expect(lineaDuplicada(lineas, { materialId: MICROPIEL, piezaId: TALON }, null)).toBe(false);
  });

  it('rechaza el mismo material en la misma pieza', () => {
    const lineas = [{ materialId: MICROPIEL, piezaId: CAPELLADA }];
    expect(lineaDuplicada(lineas, { materialId: MICROPIEL, piezaId: CAPELLADA }, null)).toBe(true);
  });

  it('rechaza el mismo material repetido sin pieza', () => {
    const lineas = [{ materialId: MICROPIEL, piezaId: null }];
    expect(lineaDuplicada(lineas, { materialId: MICROPIEL, piezaId: null }, null)).toBe(true);
  });

  it('la línea sin pieza no choca con la que sí la tiene', () => {
    const lineas = [{ materialId: MICROPIEL, piezaId: null }];
    expect(lineaDuplicada(lineas, { materialId: MICROPIEL, piezaId: CAPELLADA }, null)).toBe(false);
  });

  it('materiales distintos en la misma pieza conviven', () => {
    const lineas = [{ materialId: MICROPIEL, piezaId: CAPELLADA }];
    expect(lineaDuplicada(lineas, { materialId: SINTETICO, piezaId: CAPELLADA }, null)).toBe(false);
  });

  it('editar una línea no la compara consigo misma', () => {
    const lineas = [
      { materialId: MICROPIEL, piezaId: CAPELLADA },
      { materialId: SINTETICO, piezaId: TALON },
    ];
    expect(lineaDuplicada(lineas, { materialId: MICROPIEL, piezaId: CAPELLADA }, 0)).toBe(false);
  });

  it('editar una línea sí choca con las otras', () => {
    const lineas = [
      { materialId: MICROPIEL, piezaId: CAPELLADA },
      { materialId: SINTETICO, piezaId: TALON },
    ];
    expect(lineaDuplicada(lineas, { materialId: MICROPIEL, piezaId: CAPELLADA }, 1)).toBe(true);
  });

  it('trata undefined y null como la misma ausencia de pieza', () => {
    const lineas = [{ materialId: MICROPIEL, piezaId: undefined as unknown as null }];
    expect(lineaDuplicada(lineas, { materialId: MICROPIEL, piezaId: null }, null)).toBe(true);
  });
});

describe('mensajeDuplicado', () => {
  it('nombra la pieza cuando la hay', () => {
    expect(mensajeDuplicado('Capellada')).toContain('Capellada');
  });

  it('habla de bota completa cuando no hay pieza', () => {
    expect(mensajeDuplicado(null)).toContain('bota completa');
  });
});
