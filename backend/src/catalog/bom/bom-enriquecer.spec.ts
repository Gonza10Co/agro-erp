import { idsDeResuelto, enriquecer } from './bom-enriquecer';
import { BomResuelto } from './bom-resolver.types';

const RESUELTO: BomResuelto = {
  arbol: [
    { materialId: 1, consumo: 0.112, origen: 'COMPRADO', hijos: [] },
    { materialId: 2, consumo: 1, origen: 'FABRICADO', hijos: [
      { materialId: 3, consumo: 0.04, origen: 'COMPRADO', hijos: [] },
    ] },
  ],
  comprados: [
    { materialId: 1, consumo: 0.112 },
    { materialId: 3, consumo: 0.04 },
  ],
};

describe('bom-enriquecer', () => {
  it('idsDeResuelto recolecta ids del árbol (recursivo) + comprados, sin duplicar', () => {
    expect(idsDeResuelto(RESUELTO).sort()).toEqual([1, 2, 3]);
  });

  it('enriquecer decora árbol e hijos con codigo/nombre/unidad', () => {
    const meta = {
      1: { codigo: 'MICRO-CAF', nombre: 'MICROPIEL CAFÉ', unidad: 'M' },
      2: { codigo: 'PLANT-PU', nombre: 'PLANTILLA PU', unidad: 'PAR' },
      3: { codigo: 'POLIOL', nombre: 'POLIOL JF', unidad: 'KG' },
    };
    const r = enriquecer(RESUELTO, meta);
    expect(r.arbol[0]).toEqual({ materialId: 1, codigo: 'MICRO-CAF', nombre: 'MICROPIEL CAFÉ', unidad: 'M', origen: 'COMPRADO', consumo: 0.112, hijos: [] });
    expect(r.arbol[1].hijos[0].nombre).toBe('POLIOL JF');
    expect(r.comprados[0]).toEqual({ materialId: 1, codigo: 'MICRO-CAF', nombre: 'MICROPIEL CAFÉ', unidad: 'M', consumo: 0.112 });
  });

  it('enriquecer usa un placeholder si falta meta de un material', () => {
    const r = enriquecer(RESUELTO, {});
    expect(r.arbol[0].nombre).toBe('(desconocido)');
    expect(r.arbol[0].unidad).toBe('');
  });
});
