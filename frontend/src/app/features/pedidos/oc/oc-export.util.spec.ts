import { FilaPedidoExport, FilaPedidoTallaExport, PedidosExport } from '../../../core/api/models/pedidos.models';
import { COLUMNAS_PEDIDOS, COLUMNAS_TALLAS, hojasPedidos, nombreArchivoPedidos } from './oc-export.util';

const comun = {
  consecutivo: 19, ocCliente: 'AGR-956', cliente: 'CALZATODO SA', nit: '900123', linea: 'Basarili',
  paraStock: false, estado: 'EN_PRODUCCION' as const,
  fechaPedidoCliente: '2026-11-10', fechaSubida: '2026-11-12', fechaConfirmacion: '2026-11-13', fechaEntrega: null,
  opConsecutivo: 1, opEstado: 'EN_PRODUCCION' as const, observaciones: null,
};
const pedido: FilaPedidoExport = {
  ...comun, sede: 'Principal', ciudadEntrega: 'Bogotá', referencias: '101', marcas: 'PODEROSA', productos: 'PODEROSA · Con puntera',
  totalPares: 50, deBodega: 5, aProducir: 45, despachados: 0, entregas: 2, pendientes: 50, valor: 2150000,
};
const talla: FilaPedidoTallaExport = {
  ...comun, referencia: '101', marca: 'PODEROSA', producto: 'PODEROSA · Con puntera', codigo: 'PC-5', calidad: 'SEGUNDA',
  talla: 40, cantidad: 20, deBodega: 5, aProducir: 15, despachados: 0, pendientes: 20, precioUnitario: 43000, valor: 860000,
};
const datos: PedidosExport = {
  pedidos: [pedido, { ...pedido, consecutivo: 20, estado: 'ANULADA', paraStock: true, opConsecutivo: null, opEstado: null, valor: null }],
  tallas: [talla],
};

const valores = (fila: any[]) => fila.map((c) => (c !== null && typeof c === 'object' ? c.v : c));

describe('oc-export.util', () => {
  it('arma dos hojas planas: una fila de encabezados y una fila por registro', () => {
    const [p, t] = hojasPedidos(datos);
    expect(p.nombre).toBe('Pedidos');
    expect(t.nombre).toBe('Pedidos por talla');
    expect(valores(p.filas[0])).toEqual(COLUMNAS_PEDIDOS);
    expect(valores(t.filas[0])).toEqual(COLUMNAS_TALLAS);
    expect(p.filas.length).toBe(3); // incluye el anulado
    expect(t.filas.length).toBe(2);
    expect(p.congelar).toEqual({ filas: 1 });
    // Cada fila de datos tiene tantas celdas como encabezados.
    p.filas.forEach((f) => expect(f.length).toBe(COLUMNAS_PEDIDOS.length));
    t.filas.forEach((f) => expect(f.length).toBe(COLUMNAS_TALLAS.length));
  });

  it('pone etiquetas legibles, fechas reales y números como números', () => {
    const [p, t] = hojasPedidos(datos);
    const fila = Object.fromEntries(COLUMNAS_PEDIDOS.map((c, i) => [c, p.filas[1][i]]));
    expect(fila['Pedido']).toBe('OC-19');
    expect(fila['Tipo']).toBe('Cliente');
    expect(fila['Estado']).toBe('En producción');
    expect(fila['OP']).toBe('OP-1');
    expect(fila['Estado OP']).toBe('En producción');
    expect(fila['Fecha pedido cliente']).toEqual({ v: 46336, estilo: 'fecha' });
    expect(fila['Fecha entrega']).toBeNull();
    expect(fila['Total pares']).toBe(50);
    expect(fila['Entregas']).toBe(2);
    expect(fila['Valor']).toBe(2150000);

    const anulado = Object.fromEntries(COLUMNAS_PEDIDOS.map((c, i) => [c, p.filas[2][i]]));
    expect(anulado['Estado']).toBe('Anulada');
    expect(anulado['Tipo']).toBe('Mínimos');
    expect(anulado['OP']).toBeNull();

    const ft = Object.fromEntries(COLUMNAS_TALLAS.map((c, i) => [c, t.filas[1][i]]));
    expect(ft['Calidad']).toBe('Segunda');
    expect(ft['Talla']).toBe(40);
    expect(ft['Pares pedidos']).toBe(20);
    expect(ft['Referencia']).toBe('101');
    expect(ft['Precio unitario']).toBe(43000);
  });

  it('nombra el archivo con el día de Colombia', () => {
    expect(nombreArchivoPedidos(new Date('2026-11-20T03:00:00Z'))).toBe('pedidos 2026-11-19.xlsx');
  });
});
