import { tallasDeRef, opcionIdsSel, obligatoriosFaltantes } from './configurador.util';
import { EjeConfig, ReferenciaConfig } from '../../../core/api/models/catalogo.models';

const CONFIG: ReferenciaConfig = {
  referencia: { id: 1, codigo: '101', nombreInterno: 'PODEROSA base', tallaMin: 38, tallaMax: 41 },
  marcas: [],
  ejes: [
    { grupo: { id: 1, codigo: 'COLOR', nombre: 'Color', obligatorio: true }, opciones: [] },
    { grupo: { id: 2, codigo: 'SUELA', nombre: 'Suela', obligatorio: false }, opciones: [] },
  ],
};

describe('configurador.util', () => {
  it('tallasDeRef devuelve el rango inclusivo', () => {
    expect(tallasDeRef(CONFIG)).toEqual([38, 39, 40, 41]);
  });

  it('opcionIdsSel descarta nulos', () => {
    const sel = new Map<number, number | null>([[1, 8], [2, null]]);
    expect(opcionIdsSel(sel)).toEqual([8]);
  });

  it('obligatoriosFaltantes lista los grupos obligatorios sin elegir', () => {
    const ejes: EjeConfig[] = CONFIG.ejes;
    expect(obligatoriosFaltantes(ejes, new Map())).toEqual(['Color']);
    expect(obligatoriosFaltantes(ejes, new Map([[1, 8]]))).toEqual([]);
  });
});
