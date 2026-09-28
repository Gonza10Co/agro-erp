import { descartarGlobalesPisadas } from './bom-reglas-core';

describe('descartarGlobalesPisadas (materiales propios de la marca)', () => {
  const global = (id: number, obj: number | null, marcaId = 5) => ({
    id, referenciaId: null, marcaId, materialObjetivoId: obj,
  });
  const especifica = (id: number, obj: number | null, marcaId: number | null = 5) => ({
    id, referenciaId: 1, marcaId, materialObjetivoId: obj,
  });

  it('sin reglas específicas de marca, conserva las globales', () => {
    const r = descartarGlobalesPisadas([global(1, 10), global(2, 20)]);
    expect(r.map((x) => x.id)).toEqual([1, 2]);
  });

  it('la regla de marca específica de la referencia gana sobre la global del mismo material objetivo', () => {
    const r = descartarGlobalesPisadas([global(1, 10), especifica(2, 10), global(3, 20)]);
    expect(r.map((x) => x.id)).toEqual([2, 3]);
  });

  it('una regla por OPCIÓN sobre el mismo material NO pisa la global de marca', () => {
    const r = descartarGlobalesPisadas([global(1, 10), especifica(2, 10, null)]);
    expect(r.map((x) => x.id)).toEqual([1, 2]);
  });

  it('no toca reglas sin material objetivo (ADD)', () => {
    const r = descartarGlobalesPisadas([global(1, null), especifica(2, null)]);
    expect(r.map((x) => x.id)).toEqual([1, 2]);
  });
});
