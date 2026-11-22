import { orderListSummary } from './oc-list-summary';

describe('orderListSummary', () => {
  it('suma los pares de todas las tallas y deja marcas y referencias sin repetir, ordenadas', () => {
    const r = orderListSummary([
      { productoConfigurado: { marca: { id: 2, nombre: 'Basarili' }, referencia: { id: 9, codigo: '105' } }, tallas: [{ cantidad: 10 }, { cantidad: 5 }] },
      { productoConfigurado: { marca: { id: 1, nombre: 'Agro' }, referencia: { id: 8, codigo: '101' } }, tallas: [{ cantidad: 3 }] },
      { productoConfigurado: { marca: { id: 2, nombre: 'Basarili' }, referencia: { id: 8, codigo: '101' } }, tallas: [{ cantidad: 2 }] },
    ]);
    expect(r.pairs).toBe(20);
    expect(r.brands).toEqual([{ id: 1, nombre: 'Agro' }, { id: 2, nombre: 'Basarili' }]);
    expect(r.references).toEqual([{ id: 8, codigo: '101' }, { id: 9, codigo: '105' }]);
  });

  it('sin líneas devuelve ceros y listas vacías', () => {
    expect(orderListSummary(undefined)).toEqual({ pairs: 0, brands: [], references: [] });
  });
});
