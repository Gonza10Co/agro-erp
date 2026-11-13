import { proyectarPedidos, EntradaProyeccion, PedidoEntrada } from './proyeccion-core';
import { CAPACIDAD_AGRO } from './capacidad-planta';

// Lunes a sábado, sin festivos. 2026-11-12 es jueves.
const calendario = { diasSemana: [false, true, true, true, true, true, true], noHabiles: [] as string[] };

const pedido = (over: Partial<PedidoEntrada> & { tallas?: Record<number, number> }): PedidoEntrada => ({
  ocId: over.ocId ?? 1,
  consecutivo: over.consecutivo ?? over.ocId ?? 1,
  cliente: over.cliente ?? 'CLIENTE',
  ocCliente: null,
  fechaBase: over.fechaBase ?? '2026-11-12',
  fechaEntrega: over.fechaEntrega,
  tieneOP: over.tieneOP ?? false,
  paraStock: over.paraStock,
  renglones:
    over.renglones ??
    Object.entries(over.tallas ?? { 40: 100 }).map(([t, c]) => ({
      productoConfiguradoId: 16, producto: 'ALPACA', referencia: '102', marca: 'ALPACA',
      talla: Number(t), calidad: 'PRIMERA', pedida: c,
    })),
});

// La mayoría de los casos mira solo el corte: sin días de proceso, el día de corte
// es el día en que queda listo. Los de proceso y bodega van al final.
const SIN_PROCESO = { ...CAPACIDAD_AGRO, diasProceso: 0 };
const base = (pedidos: PedidoEntrada[], extra: Partial<EntradaProyeccion> = {}): EntradaProyeccion => ({
  hoy: '2026-11-12', calendario, capacidad: SIN_PROCESO, plazoDias: 15, pedidos, stock: [], ...extra,
});

describe('proyectarPedidos', () => {
  it('un pedido que cabe en un día termina hoy y llega a tiempo', () => {
    const r = proyectarPedidos(base([pedido({ tallas: { 40: 100, 41: 100 } })]));
    const p = r.pedidos[0];
    expect(p.aProducir).toBe(200);
    expect(p.inicio).toBe('2026-11-12');
    expect(p.fin).toBe('2026-11-12');
    expect(p.compromiso).toBe('2026-11-27');
    expect(p.compromisoEstimado).toBe(true);
    expect(p.estado).toBe('A_TIEMPO');
    expect(r.dias[0]).toMatchObject({ fecha: '2026-11-12', usado: 200, libre: 1006 });
  });

  it('descuenta lo que hay en bodega antes de programar (simula el amarre)', () => {
    const r = proyectarPedidos(base([pedido({ tallas: { 40: 100, 43: 12 } })], {
      stock: [{ productoConfiguradoId: 16, talla: 40, calidad: 'PRIMERA', libre: 500 }],
    }));
    const p = r.pedidos[0];
    expect(p.deBodega).toBe(100);
    expect(p.aProducir).toBe(12);
    expect(p.tallas).toEqual([
      { talla: 40, pedida: 100, deBodega: 100, aProducir: 0 },
      { talla: 43, pedida: 12, deBodega: 0, aProducir: 12 },
    ]);
  });

  it('un pedido que sale todo de bodega queda EN_BODEGA y no ocupa planta', () => {
    const r = proyectarPedidos(base([pedido({ tallas: { 40: 50 } })], {
      stock: [{ productoConfiguradoId: 16, talla: 40, calidad: 'PRIMERA', libre: 50 }],
    }));
    expect(r.pedidos[0].estado).toBe('EN_BODEGA');
    expect(r.pedidos[0].fin).toBeNull();
    expect(r.resumen.hastaCuando).toBeNull();
  });

  it('la bodega se la lleva el pedido más urgente, no el que se montó primero', () => {
    const r = proyectarPedidos(base([
      pedido({ ocId: 1, fechaEntrega: '2026-12-20', tallas: { 40: 60 } }),
      pedido({ ocId: 2, fechaEntrega: '2026-11-20', tallas: { 40: 60 } }),
    ], { stock: [{ productoConfiguradoId: 16, talla: 40, calidad: 'PRIMERA', libre: 60 }] }));
    expect(r.pedidos.map((p) => p.ocId)).toEqual([2, 1]);
    expect(r.pedidos[0].deBodega).toBe(60);
    expect(r.pedidos[1].deBodega).toBe(0);
  });

  it('con OP usa lo que la OP dejó pendiente y no vuelve a tocar la bodega', () => {
    const r = proyectarPedidos(base([pedido({
      tieneOP: true,
      renglones: [{ productoConfiguradoId: 16, producto: 'ALPACA', referencia: '102', marca: 'ALPACA', talla: 43, calidad: 'PRIMERA', pedida: 100, pendienteOP: 12 }],
    })], { stock: [{ productoConfiguradoId: 16, talla: 43, calidad: 'PRIMERA', libre: 999 }] }));
    expect(r.pedidos[0]).toMatchObject({ deBodega: 88, aProducir: 12 });
  });

  it('no pasa del lote diario: 3.000 pares repartidos en tallas grandes toman 3 días', () => {
    const r = proyectarPedidos(base([pedido({ tallas: { 40: 750, 41: 750, 42: 750, 43: 750 } })]));
    expect(r.dias.filter((d) => d.usado > 0).map((d) => d.usado)).toEqual([1206, 1206, 588]);
    expect(r.pedidos[0].fin).toBe('2026-11-14');
  });

  it('el miedo de Mauricio: mil pares de la 45 salen a 70 por día (un solo molde)', () => {
    const r = proyectarPedidos(base([pedido({ tallas: { 45: 1000 } })]));
    const ocupados = r.dias.filter((d) => d.usado > 0);
    expect(ocupados[0].usado).toBe(70);
    expect(ocupados.length).toBe(15); // 14 días de 70 + 1 de 20
    expect(r.pedidos[0].estado).toBe('ATRASADO'); // 15 hábiles no caben en 15 calendario
  });

  it('una talla usa su molde y el de la talla siguiente (la 37 monta en el 37 y el 38)', () => {
    const r = proyectarPedidos(base([pedido({ tallas: { 37: 210 } })]));
    expect(r.dias[0].usado).toBe(210); // 70 del molde 37 + 140 de los dos moldes 38
  });

  it('salta domingos y festivos', () => {
    const r = proyectarPedidos(base([pedido({ tallas: { 40: 350, 41: 350, 42: 350, 43: 350, 39: 210, 44: 140 } })], {
      hoy: '2026-11-14', // sábado
      calendario: { ...calendario, noHabiles: ['2026-11-16'] }, // lunes festivo
    }));
    expect(r.dias.filter((d) => d.usado > 0).map((d) => d.fecha)).toEqual(['2026-11-14', '2026-11-17']);
  });

  it('marca atrasado contra la fecha escrita y cuenta los días', () => {
    const r = proyectarPedidos(base([pedido({ fechaEntrega: '2026-11-12', tallas: { 40: 800 } })]));
    // 350 de sus moldes + 350 prestados del 41 = 700 el primer día; 100 al siguiente.
    expect(r.pedidos[0]).toMatchObject({ fin: '2026-11-13', diasAtraso: 1, estado: 'ATRASADO', compromisoEstimado: false });
    expect(r.resumen.atrasados).toBe(1);
  });

  it('dice desde cuándo hay cupo libre y cuánto hueco queda en la ventana', () => {
    const r = proyectarPedidos(base([pedido({ tallas: { 40: 350, 41: 350, 42: 350, 43: 350 } })]));
    // 1.400 pares: día 1 lleno (1.206) y día 2 con 194.
    expect(r.resumen.hastaCuando).toBe('2026-11-13');
    expect(r.resumen.primerCupoLibre).toBe('2026-11-13');
    expect(r.resumen.paresLibresEnVentana).toBe(1012);
    expect(r.dias[r.dias.length - 1]).toMatchObject({ fecha: '2026-11-14', usado: 0 });
  });

  it('lo que no cabe en el horizonte queda SIN_CUPO, no se pierde', () => {
    const r = proyectarPedidos(base([pedido({ tallas: { 45: 1000 } })], { horizonteDias: 3 }));
    expect(r.pedidos[0]).toMatchObject({ estado: 'SIN_CUPO', sinCupo: 790 });
  });

  it('sin pedidos devuelve un tablero vacío con cupo desde hoy', () => {
    const r = proyectarPedidos(base([]));
    expect(r.pedidos).toEqual([]);
    expect(r.resumen.primerCupoLibre).toBe('2026-11-12');
  });

  describe('días de proceso (corte → producto terminado)', () => {
    it('la planta usa los 10 días hábiles que confirmó JP (6 cuando jalan un urgente)', () => {
      expect(CAPACIDAD_AGRO.diasProceso).toBe(10);
    });

    const conProceso = (pedidos: PedidoEntrada[], extra: Partial<EntradaProyeccion> = {}) =>
      proyectarPedidos(base(pedidos, { capacidad: { ...CAPACIDAD_AGRO, diasProceso: 6 }, ...extra }));

    it('lo que JP no cuadraba: 2.000 pares se cortan en 2 días pero quedan listos 6 hábiles después', () => {
      const r = conProceso([pedido({ tallas: { 40: 500, 41: 500, 42: 500, 43: 500 } })]);
      const p = r.pedidos[0];
      expect(p.inicio).toBe('2026-11-12');
      expect(p.finCorte).toBe('2026-11-13');
      // vie 13 + 6 hábiles (lun-sáb, sin domingo): sáb 14, lun 16, mar 17, mié 18, jue 19, vie 20.
      expect(p.fin).toBe('2026-11-20');
      expect(r.resumen.hastaCuando).toBe('2026-11-20');
      expect(r.diasProceso).toBe(6);
    });

    it('marca tarde el tramo de corte que ya no alcanza a llegar', () => {
      const r = conProceso([pedido({ fechaEntrega: '2026-11-19', tallas: { 40: 350, 41: 350, 42: 350, 43: 350 } })]);
      // Corta 1.206 el jueves 12 (listos el jue 19) y 194 el viernes 13 (listos el vie 20).
      expect(r.dias[0].bloques[0]).toMatchObject({ pares: 1206, tarde: false });
      expect(r.dias[1].bloques[0]).toMatchObject({ pares: 194, tarde: true });
      expect(r.pedidos[0]).toMatchObject({ estado: 'ATRASADO', diasAtraso: 1 });
    });

    it('los días de proceso también saltan festivos', () => {
      const r = conProceso([pedido({ tallas: { 40: 10 } })], { calendario: { ...calendario, noHabiles: ['2026-11-16'] } });
      // jue 12 + 6 hábiles sin dom 15 ni lun 16: vie 13, sáb 14, mar 17, mié 18, jue 19, vie 20.
      expect(r.pedidos[0].fin).toBe('2026-11-20');
    });
  });

  describe('lo que queda en bodega para vender', () => {
    const stock = [
      { productoConfiguradoId: 16, producto: 'ALPACA · Con puntera', referencia: '102', marca: 'ALPACA', talla: 40, calidad: 'PRIMERA', libre: 300 },
      { productoConfiguradoId: 16, producto: 'ALPACA · Con puntera', referencia: '102', marca: 'ALPACA', talla: 41, calidad: 'PRIMERA', libre: 50 },
      { productoConfiguradoId: 20, producto: 'FORTIA', referencia: '107', marca: 'FORTIA', talla: 39, calidad: 'PRIMERA', libre: 900 },
    ];

    it('descuenta lo que se llevan los pedidos y agrupa por producto con sus tallas', () => {
      const r = proyectarPedidos(base([pedido({ tallas: { 40: 100, 41: 80 } })], { stock }));
      expect(r.disponible).toEqual([
        { productoConfiguradoId: 20, producto: 'FORTIA', referencia: '107', marca: 'FORTIA', calidad: 'PRIMERA', tallas: [{ talla: 39, pares: 900 }], total: 900 },
        { productoConfiguradoId: 16, producto: 'ALPACA · Con puntera', referencia: '102', marca: 'ALPACA', calidad: 'PRIMERA', tallas: [{ talla: 40, pares: 200 }], total: 200 },
      ]);
      expect(r.resumen.paresParaVender).toBe(1100);
    });

    it('una talla que se agota no aparece; el stock negativo no resta', () => {
      const r = proyectarPedidos(base([], { stock: [...stock, { ...stock[0], talla: 43, libre: -50 }] }));
      expect(r.disponible.find((g) => g.productoConfiguradoId === 16)!.tallas.map((t) => t.talla)).toEqual([40, 41]);
    });
  });

  describe('pedido para stock (orden de mínimos)', () => {
    it('no toma de la bodega: se fabrica completo y la bodega sigue libre para vender', () => {
      const r = proyectarPedidos(base([pedido({ paraStock: true, tallas: { 40: 100 } })], {
        stock: [{ productoConfiguradoId: 16, producto: 'ALPACA', talla: 40, calidad: 'PRIMERA', libre: 500 }],
      }));
      expect(r.pedidos[0]).toMatchObject({ paraStock: true, deBodega: 0, aProducir: 100 });
      expect(r.resumen.paresParaVender).toBe(500);
    });

    it('lo que fabrica entra para vender el día que queda listo', () => {
      const r = proyectarPedidos(base(
        [pedido({ ocId: 7, paraStock: true, tallas: { 40: 100, 41: 50 } }), pedido({ ocId: 8, tallas: { 42: 30 } })],
        { capacidad: CAPACIDAD_AGRO },
      ));
      const fin = r.pedidos.find((p) => p.ocId === 7)!.fin;
      expect(fin).toBeTruthy();
      expect(r.entraParaVender).toEqual([
        expect.objectContaining({
          ocId: 7, fecha: fin, productoConfiguradoId: 16, producto: 'ALPACA', calidad: 'PRIMERA',
          tallas: [{ talla: 40, pares: 100 }, { talla: 41, pares: 50 }], total: 150,
        }),
      ]);
      expect(r.resumen.paresEntranParaVender).toBe(150);
    });

    it('con OP usa lo que la OP dejó pendiente (lo ya terminado ya está en bodega)', () => {
      const r = proyectarPedidos(base([pedido({
        paraStock: true, tieneOP: true,
        renglones: [{ productoConfiguradoId: 16, producto: 'ALPACA', referencia: '102', marca: 'ALPACA', talla: 40, calidad: 'PRIMERA', pedida: 100, pendienteOP: 60 }],
      })]));
      expect(r.entraParaVender[0].total).toBe(60);
    });
  });
});
