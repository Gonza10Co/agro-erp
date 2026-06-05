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
    expect(lineas).toEqual([
      { productoConfiguradoId: 1, tallaId: 10, bodegaId: 2, cantidad: 8 },
      { productoConfiguradoId: 1, tallaId: 11, bodegaId: 2, cantidad: 4 },
      { productoConfiguradoId: 2, tallaId: 10, bodegaId: 2, cantidad: 7 },
    ]);
  });

  it('devuelve [] si no hay reservas', () => {
    expect(construirLineasDespacho([])).toEqual([]);
  });
});
