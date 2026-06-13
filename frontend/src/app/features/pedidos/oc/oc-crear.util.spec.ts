import { tallasDeProducto, construirDto, LineaWizard } from './oc-crear.util';
import { Talla } from '../../../core/api/models/pedidos.models';
import { ProductoConfiguradoFull } from '../../../core/api/models/catalogo.models';

const TALLAS: Talla[] = [
  { id: 1, valor: 38, orden: 1 }, { id: 2, valor: 39, orden: 2 },
  { id: 3, valor: 40, orden: 3 }, { id: 4, valor: 41, orden: 4 },
];
const PROD: ProductoConfiguradoFull = {
  id: 7, codigo: 'BD', nombreComercial: 'Bota Dieléctrica',
  marca: { id: 1, nombre: 'PODEROSA' },
  referencia: { id: 1, codigo: '101', tallaMin: { id: 2, valor: 39, orden: 2 }, tallaMax: { id: 3, valor: 40, orden: 3 } },
};

describe('oc-crear.util', () => {
  it('tallasDeProducto filtra al rango orden de la referencia', () => {
    expect(tallasDeProducto(PROD, TALLAS).map(t => t.valor)).toEqual([39, 40]);
  });

  it('construirDto arma el DTO con precio y descarta cantidades 0', () => {
    const lineas: LineaWizard[] = [{ producto: PROD, precio: 85000, valores: { 2: 10, 3: 0, 99: 5 } }];
    const dto = construirDto({ clienteId: 3, ocCliente: 'PO-1', observaciones: '', lineas });
    expect(dto).toEqual({
      clienteId: 3,
      ocCliente: 'PO-1',
      observaciones: undefined,
      lineas: [{ productoConfiguradoId: 7, precioUnitario: 85000, tallas: [{ tallaId: 2, cantidad: 10 }, { tallaId: 99, cantidad: 5 }] }],
    });
  });

  it('construirDto omite precioUnitario cuando no hay precio', () => {
    const lineas: LineaWizard[] = [{ producto: PROD, precio: 0, valores: { 2: 4 } }];
    const dto = construirDto({ clienteId: 3, lineas });
    expect(dto.lineas[0].precioUnitario).toBeUndefined();
  });
});
