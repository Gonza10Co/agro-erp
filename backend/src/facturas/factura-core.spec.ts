import { lineasDeFactura, totales } from './factura-core';

describe('factura-core', () => {
  describe('lineasDeFactura', () => {
    it('valoriza cada línea de despacho con el precio pactado del producto', () => {
      const precios = new Map<number, number>([
        [10, 85000],
        [20, 92000],
      ]);
      const lineas = lineasDeFactura(
        [
          { productoConfiguradoId: 10, tallaId: 38, cantidad: 3 },
          { productoConfiguradoId: 20, tallaId: 40, cantidad: 2 },
        ],
        precios,
      );

      expect(lineas).toEqual([
        { productoConfiguradoId: 10, tallaId: 38, cantidad: 3, precioUnitario: 85000, subtotal: 255000 },
        { productoConfiguradoId: 20, tallaId: 40, cantidad: 2, precioUnitario: 92000, subtotal: 184000 },
      ]);
    });

    it('redondea el subtotal a 2 decimales (sin float drift)', () => {
      const precios = new Map<number, number>([[10, 99.99]]);
      const [linea] = lineasDeFactura(
        [{ productoConfiguradoId: 10, tallaId: 38, cantidad: 3 }],
        precios,
      );
      expect(linea.subtotal).toBe(299.97);
    });

    it('lanza si un producto despachado no tiene precio pactado', () => {
      expect(() =>
        lineasDeFactura(
          [{ productoConfiguradoId: 99, tallaId: 38, cantidad: 1 }],
          new Map(),
        ),
      ).toThrow(/99/);
    });
  });

  describe('totales', () => {
    it('suma subtotales y aplica el IVA', () => {
      const t = totales([{ subtotal: 255000 }, { subtotal: 184000 }], 19);
      expect(t).toEqual({ subtotal: 439000, iva: 83410, total: 522410 });
    });

    it('IVA 0 deja total = subtotal', () => {
      expect(totales([{ subtotal: 100000 }], 0)).toEqual({
        subtotal: 100000,
        iva: 0,
        total: 100000,
      });
    });

    it('redondea el IVA a 2 decimales', () => {
      const t = totales([{ subtotal: 299.97 }], 19);
      expect(t.iva).toBe(56.99); // 299.97 * 0.19 = 56.9943 → 56.99
      expect(t.total).toBe(356.96);
    });
  });
});
