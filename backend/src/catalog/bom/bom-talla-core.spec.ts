import { materialParaTalla, prefijoAlfabetico, sustituirPorTalla } from './bom-talla-core';
import { resolverBom } from './bom-resolver';
import { LineaBase, MaterialInfo } from './bom-resolver.types';

const mat = (
  id: number,
  codigo: string,
  familia: string | null,
  tallaValor: number | null,
  activo = true,
): MaterialInfo => ({
  id,
  origen: 'COMPRADO',
  subBom: [],
  ...(familia ? { familiaTalla: { familia, tallaValor, codigo, activo } } : {}),
});

const lineaCurva = (materialId: number, curva: Record<number, number>): LineaBase => ({
  materialId,
  piezaId: null,
  claseConsumo: 'CURVA',
  consumoFijo: null,
  consumoPorTalla: curva,
  mermaPct: null,
});

// Plantilla PU en dos codificaciones (PPLA y MRP-), más un material sin familia.
const MATERIALES: Record<number, MaterialInfo> = {
  1: mat(1, 'PPLA229', 'PLANTILLA PU', 40),
  2: mat(2, 'PPLA227', 'PLANTILLA PU', 38),
  3: mat(3, 'MRP-022', 'PLANTILLA PU', 38),
  4: mat(4, 'MRP-023', 'PLANTILLA PU', 40),
  5: mat(5, 'MRP-021', 'PLANTILLA PU', 37),
  9: mat(9, 'CUE001', null, null),
};

describe('prefijoAlfabetico', () => {
  it('toma las letras iniciales del código', () => {
    expect(prefijoAlfabetico('PPLA223')).toBe('PPLA');
    expect(prefijoAlfabetico('MRP-017')).toBe('MRP');
    expect(prefijoAlfabetico('123')).toBe('');
  });
});

describe('materialParaTalla', () => {
  it('sustituye por el hermano de la misma familia y talla', () => {
    expect(materialParaTalla(1, 38, MATERIALES)).toBe(2);
  });

  it('con duplicados prefiere el que comparte prefijo con el original', () => {
    expect(materialParaTalla(1, 38, MATERIALES)).toBe(2); // PPLA → PPLA
    expect(materialParaTalla(4, 38, MATERIALES)).toBe(3); // MRP → MRP
  });

  it('sin candidato de su prefijo, el de menor código', () => {
    // Talla 37 solo existe como MRP-021, aunque el original sea PPLA.
    expect(materialParaTalla(1, 37, MATERIALES)).toBe(5);
    const dos = {
      1: mat(1, 'PPLA229', 'PLANTILLA PU', 40),
      7: mat(7, 'XYZ-10', 'PLANTILLA PU', 36),
      8: mat(8, 'MRP-2', 'PLANTILLA PU', 36),
    };
    expect(materialParaTalla(1, 36, dos)).toBe(8);
  });

  it('entre varios del mismo prefijo gana el menor código (orden numérico)', () => {
    const m = {
      1: mat(1, 'PPLA229', 'PLANTILLA PU', 40),
      6: mat(6, 'PPLA1000', 'PLANTILLA PU', 38),
      7: mat(7, 'PPLA300', 'PLANTILLA PU', 38),
    };
    expect(materialParaTalla(1, 38, m)).toBe(7);
  });

  it('si no hay material para esa talla deja el original', () => {
    expect(materialParaTalla(1, 46, MATERIALES)).toBe(1);
  });

  it('la talla propia del original lo conserva', () => {
    expect(materialParaTalla(1, 40, MATERIALES)).toBe(1);
  });

  it('un material inactivo no cuenta como candidato', () => {
    const m = { ...MATERIALES, 2: mat(2, 'PPLA227', 'PLANTILLA PU', 38, false) };
    expect(materialParaTalla(1, 38, m)).toBe(3); // cae al MRP activo
    const soloInactivo = {
      1: mat(1, 'PPLA229', 'PLANTILLA PU', 40),
      2: mat(2, 'PPLA227', 'PLANTILLA PU', 38, false),
    };
    expect(materialParaTalla(1, 38, soloInactivo)).toBe(1);
  });

  it('no cruza familias ni toca materiales sin familia', () => {
    const m = {
      ...MATERIALES,
      20: mat(20, 'PPLA240', 'PLANTILLA EVA', 38),
    };
    expect(materialParaTalla(1, 38, m)).toBe(2);
    expect(materialParaTalla(9, 38, m)).toBe(9);
    expect(materialParaTalla(999, 38, m)).toBe(999);
  });
});

describe('sustituirPorTalla', () => {
  it('cambia el material y conserva el consumo de la línea', () => {
    const l = lineaCurva(1, { 38: 1, 40: 1 });
    const [r] = sustituirPorTalla([l], 38, MATERIALES);
    expect(r).toEqual({ ...l, materialId: 2 });
  });
});

describe('resolverBom con materiales por talla', () => {
  it('una bota 38 descuenta la plantilla 38 con el consumo de la línea', () => {
    const r = resolverBom({
      lineasBase: [lineaCurva(1, { 38: 1.02, 40: 1 }), lineaCurva(9, { 38: 0.1, 40: 0.12 })],
      overrides: [],
      talla: 38,
      materiales: MATERIALES,
    });
    expect(r.comprados).toEqual([
      { materialId: 2, consumo: 1.02 },
      { materialId: 9, consumo: 0.1 },
    ]);
  });

  it('la sustitución va después del override: un REPLACE a otra familia también se ajusta', () => {
    const m = {
      ...MATERIALES,
      30: mat(30, 'PPLA296', 'PLANTILLA KEVLAR', 40),
      31: mat(31, 'PPLA294', 'PLANTILLA KEVLAR', 38),
    };
    const r = resolverBom({
      lineasBase: [lineaCurva(1, { 38: 1, 40: 1 })],
      overrides: [
        {
          accion: 'REPLACE',
          orden: 0,
          materialObjetivoId: 1, // la plantilla PU 40 del BOM
          materialNuevoId: 30, // la regla apunta a la KEVLAR 40
          consumoFijo: null,
          heredaCurva: true,
          consumoPorTalla: {},
        },
      ],
      talla: 38,
      materiales: m,
    });
    expect(r.comprados).toEqual([{ materialId: 31, consumo: 1 }]);
  });
});
