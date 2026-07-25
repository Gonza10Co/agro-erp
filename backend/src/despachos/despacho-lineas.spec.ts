import { construirLineasDespacho, ReservaPlana } from './despacho-lineas';

describe('construirLineasDespacho', () => {
  it('agrupa reservas por producto/talla/bodega sumando cantidades', () => {
    const reservas: ReservaPlana[] = [
      { productoConfiguradoId: 1, tallaId: 10, bodegaId: 2, cantidad: 5 },
      { productoConfiguradoId: 1, tallaId: 10, bodegaId: 2, cantidad: 3 },
      { productoConfiguradoId: 1, tallaId: 11, bodegaId: 2, cantidad: 4 },
      { productoConfiguradoId: 2, tallaId: 10, bodegaId: 2, cantidad: 7 },
    ];
    const lineas = construirLineasDespacho(reservas);
    // Sin calidad declarada, todo es PRIMERA (los remitos históricos no cambian).
    expect(lineas).toEqual([
      { productoConfiguradoId: 1, tallaId: 10, bodegaId: 2, calidad: 'PRIMERA', cantidad: 8 },
      { productoConfiguradoId: 1, tallaId: 11, bodegaId: 2, calidad: 'PRIMERA', cantidad: 4 },
      { productoConfiguradoId: 2, tallaId: 10, bodegaId: 2, calidad: 'PRIMERA', cantidad: 7 },
    ]);
  });

  it('NO mezcla primeras con segundas del mismo producto/talla/bodega', () => {
    // Si la calidad no entrara en la clave, el remito diría "8 pares" sin decir
    // que 3 son de segunda — el cliente los recibiría como primeras.
    const reservas: ReservaPlana[] = [
      { productoConfiguradoId: 1, tallaId: 10, bodegaId: 2, calidad: 'PRIMERA', cantidad: 5 },
      { productoConfiguradoId: 1, tallaId: 10, bodegaId: 2, calidad: 'SEGUNDA', cantidad: 3 },
      { productoConfiguradoId: 1, tallaId: 10, bodegaId: 2, calidad: 'SEGUNDA', cantidad: 2 },
    ];
    const lineas = construirLineasDespacho(reservas);
    expect(lineas).toEqual([
      { productoConfiguradoId: 1, tallaId: 10, bodegaId: 2, calidad: 'PRIMERA', cantidad: 5 },
      { productoConfiguradoId: 1, tallaId: 10, bodegaId: 2, calidad: 'SEGUNDA', cantidad: 5 },
    ]);
  });

  it('devuelve [] si no hay reservas', () => {
    expect(construirLineasDespacho([])).toEqual([]);
  });
});
