import { PedidoProyectado, Proyeccion } from '../../../core/api/models/proyeccion.models';
import { fechaCorta, filtrarPedidos, hojasProyeccion } from './proyeccion.util';

const ped = (over: Partial<PedidoProyectado>): PedidoProyectado => ({
  ocId: 1, consecutivo: 1, cliente: 'CALZATODO SA', ocCliente: null, productos: ['PODEROSA · Con puntera'],
  referencias: ['101'], marcas: ['PODEROSA'], tieneOP: false, pares: 100, deBodega: 0, aProducir: 100, sinCupo: 0,
  compromiso: '2026-11-27', compromisoEstimado: true, inicio: '2026-11-12', finCorte: '2026-11-12', fin: '2026-11-12', diasAtraso: 0,
  estado: 'A_TIEMPO', tallas: [{ talla: 40, pedida: 100, deBodega: 0, aProducir: 100 }], ...over,
});

const proy = (pedidos: PedidoProyectado[]): Proyeccion => ({
  hoy: '2026-11-12', paresPorDia: 1206, diasProceso: 0, pedidos,
  disponible: [{ productoConfiguradoId: 20, producto: 'FORTIA', referencia: '107', marca: 'FORTIA', calidad: 'PRIMERA', tallas: [{ talla: 39, pares: 900 }, { talla: 42, pares: 50 }], total: 950 }],
  dias: [
    { fecha: '2026-11-12', capacidad: 1206, usado: 1206, libre: 0, bloques: [{ ocId: 1, consecutivo: 1, cliente: 'CALZATODO SA', pares: 100, tarde: false }, { ocId: 2, consecutivo: 2, cliente: 'CECILIA RENÉ', pares: 1106, tarde: false }] },
    { fecha: '2026-11-13', capacidad: 1206, usado: 100, libre: 1106, bloques: [{ ocId: 2, consecutivo: 2, cliente: 'CECILIA RENÉ', pares: 100, tarde: true }] },
  ],
  resumen: { pedidos: pedidos.length, pares: 0, deBodega: 0, aProducir: 0, atrasados: 0, sinCupo: 0, hastaCuando: '2026-11-13', primerCupoLibre: '2026-11-13', paresLibresEnVentana: 1106, paresParaVender: 950 },
});

describe('proyeccion.util', () => {
  it('escribe la fecha corta sin correrse de día por la zona horaria', () => {
    expect(fechaCorta('2026-11-12')).toBe('jue 12 nov');
    expect(fechaCorta('2026-01-01')).toBe('jue 1 ene');
    expect(fechaCorta(null)).toBe('');
  });

  it('filtra por cliente, referencia o marca sin importar tildes ni mayúsculas', () => {
    const lista = [ped({}), ped({ ocId: 2, consecutivo: 2, cliente: 'CECILIA RENÉ', referencias: ['102'], marcas: ['ALPACA SUELA AZUL'], estado: 'ATRASADO' })];
    expect(filtrarPedidos(lista, 'rene', '').map((p) => p.ocId)).toEqual([2]);
    expect(filtrarPedidos(lista, '101', '').map((p) => p.ocId)).toEqual([1]);
    expect(filtrarPedidos(lista, 'alpaca azul', '').map((p) => p.ocId)).toEqual([2]);
    expect(filtrarPedidos(lista, '', 'ATRASADO').map((p) => p.ocId)).toEqual([2]);
    expect(filtrarPedidos(lista, 'oc-1', '').map((p) => p.ocId)).toEqual([1]);
  });

  it('arma el Gantt: una columna por día, pintada donde se fabrica el pedido', () => {
    const p2 = ped({ ocId: 2, consecutivo: 2, cliente: 'CECILIA RENÉ', ocCliente: 'AGR-956', compromiso: '2026-11-12', compromisoEstimado: false, fin: '2026-11-13', diasAtraso: 1, estado: 'ATRASADO', aProducir: 1206, pares: 1206 });
    const [gantt] = hojasProyeccion(proy([ped({}), p2]));
    const encabezado = gantt.filas[3].map((x: any) => x.v);
    expect(encabezado.slice(-2)).toEqual(['jue 12 nov', 'vie 13 nov']);
    const fila1 = gantt.filas[4];
    expect(fila1[0]).toBe('OC-1');
    expect(fila1.slice(-2)).toEqual([{ v: 100, estilo: 'ok' }, null]);
    const fila2 = gantt.filas[5];
    expect(fila2[0]).toBe('OC-2 (AGR-956)');
    // El día 12 todavía llega; lo del 13 ya es después del compromiso.
    expect(fila2.slice(-2)).toEqual([{ v: 1106, estilo: 'ok' }, { v: 100, estilo: 'atrasado' }]);
    expect(gantt.filas[3].map((x: any) => x.v).slice(8, 10)).toEqual(['Último corte', 'Listo en PT']);
    expect(gantt.filas[7].slice(-2)).toEqual([{ v: 1206, estilo: 'alerta' }, { v: 100, estilo: undefined }]);
    expect(gantt.filas[8].slice(-2)).toEqual([{ v: 0, estilo: undefined }, { v: 1106, estilo: 'libre' }]);
  });

  it('la hoja por talla solo trae lo que falta producir y suma por talla', () => {
    const enBodega = ped({ ocId: 3, consecutivo: 3, aProducir: 0, deBodega: 100, estado: 'EN_BODEGA', tallas: [{ talla: 40, pedida: 100, deBodega: 100, aProducir: 0 }] });
    const dos = ped({ ocId: 2, consecutivo: 2, aProducir: 30, tallas: [{ talla: 38, pedida: 10, deBodega: 0, aProducir: 10 }, { talla: 40, pedida: 20, deBodega: 0, aProducir: 20 }] });
    const [, porTalla] = hojasProyeccion(proy([ped({}), dos, enBodega]));
    expect(porTalla.filas[3].map((x: any) => x.v).slice(7)).toEqual(['38', '40', 'Total']);
    expect(porTalla.filas.length).toBe(4 + 2 + 1);
    expect(porTalla.filas[4].slice(7)).toEqual([null, 100, { v: 100, estilo: 'negrita' }]);
    expect(porTalla.filas[6].slice(7)).toEqual([{ v: 10, estilo: 'negrita' }, { v: 120, estilo: 'negrita' }, { v: 130, estilo: 'negrita' }]);
  });

  it('la hoja para vender trae lo libre por producto y talla con su total', () => {
    const hojas = hojasProyeccion(proy([ped({})]));
    expect(hojas.map((h) => h.nombre)).toEqual(['Proyección', 'Por talla', 'Para vender']);
    const v = hojas[2];
    expect(v.filas[3].map((x: any) => x.v)).toEqual(['Ref.', 'Marca', 'Producto', 'Calidad', '39', '42', 'Total']);
    expect(v.filas[4]).toEqual(['107', 'FORTIA', 'FORTIA', 'Primera', 900, 50, { v: 950, estilo: 'negrita' }]);
    expect(v.filas[5].slice(-1)).toEqual([{ v: 950, estilo: 'negrita' }]);
  });
});
