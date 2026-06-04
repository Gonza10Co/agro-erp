import { OrdenProduccion } from '../../../core/api/models/pedidos.models';
import { resumenAmarre, filasPorTalla, filasPorBodega, bodegasDeOP } from './amarre-view';

// OP mock: 1 producto, 2 tallas. T36 completa en stock (Ibagué). T39 mitad stock (Ibagué+Bogotá), mitad a producir.
const OP: OrdenProduccion = {
  id: 12, consecutivo: 1187, ocId: 41, fecha: '2026-05-28T00:00:00.000Z', estado: 'AMARRADA',
  oc: { id: 41, consecutivo: 2041, clienteId: 3, fecha: '2026-05-28T00:00:00.000Z', estado: 'EN_PRODUCCION',
        cliente: { id: 3, nit: '900123', nombre: 'Minera El Roble', tipoCredito: 'D30', estadoCartera: 'AL_DIA', activo: true } },
  lineas: [{
    id: 100, productoConfiguradoId: 7,
    productoConfigurado: { id: 7, codigo: 'BD-PU-NEG', nombreComercial: 'Bota Dieléctrica PU Negro', referenciaId: 1, marcaId: 1 },
    tallas: [
      { id: 500, tallaId: 36, cantPedida: 60, cantAmarrada: 60, cantAProducir: 0,
        talla: { id: 36, valor: 36, orden: 4 },
        reservas: [{ id: 9, inventarioPTId: 1, cantidad: 60,
          inventarioPT: { id: 1, bodegaId: 1, bodega: { id: 1, codigo: 'IBG', nombre: 'Ibagué' } } }] },
      { id: 501, tallaId: 39, cantPedida: 240, cantAmarrada: 120, cantAProducir: 120,
        talla: { id: 39, valor: 39, orden: 7 },
        reservas: [
          { id: 10, inventarioPTId: 1, cantidad: 90, inventarioPT: { id: 1, bodegaId: 1, bodega: { id: 1, codigo: 'IBG', nombre: 'Ibagué' } } },
          { id: 11, inventarioPTId: 2, cantidad: 30, inventarioPT: { id: 2, bodegaId: 2, bodega: { id: 2, codigo: 'BOG', nombre: 'Bogotá' } } },
        ] },
    ],
  }],
};

describe('amarre-view', () => {
  it('resumenAmarre suma pedido/stock/producir y calcula pctStock', () => {
    const r = resumenAmarre(OP);
    expect(r.pedido).toBe(300);
    expect(r.stock).toBe(180);
    expect(r.producir).toBe(120);
    expect(r.pctStock).toBe(60); // 180/300
  });

  it('resumenAmarre con pedido 0 no divide por cero', () => {
    const vacia: OrdenProduccion = { ...OP, lineas: [] };
    expect(resumenAmarre(vacia).pctStock).toBe(0);
  });

  it('bodegasDeOP devuelve bodegas distintas ordenadas por id', () => {
    const b = bodegasDeOP(OP);
    expect(b.map(x => x.codigo)).toEqual(['IBG', 'BOG']);
  });

  it('filasPorTalla agrega por talla, ordena por valor y marca completo', () => {
    const f = filasPorTalla(OP);
    expect(f.map(x => x.valor)).toEqual([36, 39]);
    expect(f[0].completo).toBe(true);   // T36 producir 0
    expect(f[1].completo).toBe(false);  // T39 producir 120
    expect(f[1].stock).toBe(120);
    expect(f[1].producir).toBe(120);
  });

  it('filasPorTalla calcula anchos relativos al pedido máximo', () => {
    const f = filasPorTalla(OP);
    // pedido máximo = 240 (T39) → su barra ocupa 100%
    expect(f[1].wBar).toBe(100);
    // T36: 60/240 = 25% de ancho de barra
    expect(f[0].wBar).toBe(25);
    // dentro de T39: stock 120/240 del ancho de celda = 50, prod 50
    expect(f[1].wStock).toBe(50);
    expect(f[1].wProd).toBe(50);
  });

  it('filasPorBodega desglosa stock por bodega y conserva producir', () => {
    const f = filasPorBodega(OP);
    expect(f[1].porBodega[1]).toBe(90); // T39 Ibagué
    expect(f[1].porBodega[2]).toBe(30); // T39 Bogotá
    expect(f[1].stock).toBe(120);
    expect(f[1].producir).toBe(120);
  });
});
