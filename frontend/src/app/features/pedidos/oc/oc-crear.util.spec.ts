import { tallasDeProducto, construirDto, destinoAlEditar, LineaWizard } from './oc-crear.util';
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
      direccionDespacho: undefined,
      lineas: [{ productoConfiguradoId: 7, precioUnitario: 85000, tallas: [{ tallaId: 2, cantidad: 10 }, { tallaId: 99, cantidad: 5 }] }],
    });
  });

  it('construirDto manda la calidad SEGUNDA con su propio precio', () => {
    const lineas: LineaWizard[] = [
      { producto: PROD, precio: 55000, calidad: 'SEGUNDA', valores: { 2: 10 } },
    ];
    const dto = construirDto({ clienteId: 3, lineas });
    expect(dto.lineas[0].calidad).toBe('SEGUNDA');
    expect(dto.lineas[0].precioUnitario).toBe(55000);
  });

  it('construirDto NO manda la clave calidad en un pedido normal', () => {
    // PRIMERA es el default del backend: los pedidos de siempre no cambian de forma.
    const lineas: LineaWizard[] = [{ producto: PROD, precio: 85000, valores: { 2: 10 } }];
    expect(construirDto({ clienteId: 3, lineas }).lineas[0].calidad).toBeUndefined();
    const explicita: LineaWizard[] = [{ producto: PROD, precio: 85000, calidad: 'PRIMERA', valores: { 2: 10 } }];
    expect(construirDto({ clienteId: 3, lineas: explicita }).lineas[0].calidad).toBeUndefined();
  });

  it('construirDto omite precioUnitario cuando no hay precio', () => {
    const lineas: LineaWizard[] = [{ producto: PROD, precio: 0, valores: { 2: 4 } }];
    const dto = construirDto({ clienteId: 3, lineas });
    expect(dto.lineas[0].precioUnitario).toBeUndefined();
  });

  it('construirDto incluye la línea de producción elegida (línea por pedido)', () => {
    const lineas: LineaWizard[] = [{ producto: PROD, precio: 85000, valores: { 2: 10 } }];
    const dto = construirDto({ clienteId: 3, lineaId: 4, lineas });
    expect(dto.lineaId).toBe(4);
  });

  it('construirDto sin línea elegida no manda la clave lineaId', () => {
    const lineas: LineaWizard[] = [{ producto: PROD, precio: 85000, valores: { 2: 10 } }];
    const dto = construirDto({ clienteId: 3, lineaId: null, lineas });
    expect('lineaId' in dto).toBe(false);
  });
});

describe('destinoAlEditar', () => {
  it('conserva la sede si nadie tocó la dirección', () => {
    expect(
      destinoAlEditar({
        sedeEntregaIdActual: 9,
        direccionOriginal: 'Cra 5 # 10-20, Ibagué',
        direccionEditada: 'Cra 5 # 10-20, Ibagué',
      }),
    ).toEqual({ sedeEntregaId: 9, direccionDespacho: undefined });
  });

  it('suelta la sede si reescribieron la dirección', () => {
    expect(
      destinoAlEditar({
        sedeEntregaIdActual: 9,
        direccionOriginal: 'Cra 5 # 10-20, Ibagué',
        direccionEditada: 'Obra Calle 80, Bogotá',
      }),
    ).toEqual({ sedeEntregaId: undefined, direccionDespacho: 'Obra Calle 80, Bogotá' });
  });

  it('una entrega puntual intacta no se muda a la sede principal', () => {
    expect(
      destinoAlEditar({
        sedeEntregaIdActual: null,
        direccionOriginal: 'Obra Calle 80',
        direccionEditada: 'Obra Calle 80',
      }),
    ).toEqual({ sedeEntregaId: undefined, direccionDespacho: 'Obra Calle 80' });
  });

  it('borrar la dirección deja la OC sin destino explícito', () => {
    expect(
      destinoAlEditar({ sedeEntregaIdActual: 9, direccionOriginal: 'Cra 5', direccionEditada: '  ' }),
    ).toEqual({ sedeEntregaId: undefined, direccionDespacho: undefined });
  });
});
