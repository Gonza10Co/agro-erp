import { parsearFamiliaTalla, planearEtiquetado } from './familia-talla-core';

describe('parsearFamiliaTalla', () => {
  it('reconoce el nombre con "TALLA" (códigos PPLA)', () => {
    expect(parsearFamiliaTalla('PLANTILLA PU TALLA 38')).toEqual({ familia: 'PLANTILLA PU', talla: 38 });
    expect(parsearFamiliaTalla('PLANTILLA KEVLAR TALLA 46')).toEqual({ familia: 'PLANTILLA KEVLAR', talla: 46 });
  });

  it('reconoce el nombre sin "TALLA" (duplicados MRP-)', () => {
    expect(parsearFamiliaTalla('PLANTILLA EVA 33')).toEqual({ familia: 'PLANTILLA EVA', talla: 33 });
  });

  it('ignora mayúsculas y espacios de más', () => {
    expect(parsearFamiliaTalla('  plantilla  pu   talla 40 ')).toEqual({ familia: 'PLANTILLA PU', talla: 40 });
  });

  it('no casa otras familias ni nombres con sufijos', () => {
    expect(parsearFamiliaTalla('PLANTILLA LATEX TALLA 38')).toBeNull();
    expect(parsearFamiliaTalla('PLANTILLA PU TALLA 38 NEGRA')).toBeNull();
    expect(parsearFamiliaTalla('LAMINA PLANTILLA PU 38')).toBeNull();
    expect(parsearFamiliaTalla('PLANTILLA PU')).toBeNull();
    expect(parsearFamiliaTalla('PLANTILLA PU TALLA 380')).toBeNull();
  });
});

describe('planearEtiquetado', () => {
  const tallas = [
    { id: 1, valor: 38 },
    { id: 2, valor: 40 },
  ];
  const m = (id: number, nombre: string, familiaTalla: string | null = null, tallaId: number | null = null) => ({
    id, codigo: `C${id}`, nombreCanonico: nombre, familiaTalla, tallaId,
  });

  it('etiqueta los que casan, cuenta los ya etiquetados y reporta tallas inexistentes', () => {
    const plan = planearEtiquetado(
      [
        m(1, 'PLANTILLA PU TALLA 38'),
        m(2, 'PLANTILLA PU TALLA 40', 'PLANTILLA PU', 2),
        m(3, 'PLANTILLA EVA 33'),
        m(4, 'CUERO NEGRO'),
        m(5, 'PLANTILLA EVA 40', 'PLANTILLA PU', 2), // etiqueta equivocada → se corrige
      ],
      tallas,
    );
    expect(plan.etiquetar.map((e) => [e.id, e.familiaTalla, e.tallaId])).toEqual([
      [1, 'PLANTILLA PU', 1],
      [5, 'PLANTILLA EVA', 2],
    ]);
    expect(plan.yaEtiquetados).toBe(1);
    expect(plan.sinTalla).toEqual([{ codigo: 'C3', nombre: 'PLANTILLA EVA 33', talla: 33 }]);
  });
});
