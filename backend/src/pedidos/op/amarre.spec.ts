import { amarrarTalla, DisponibilidadBodega } from './amarre';

describe('amarrarTalla', () => {
  it('sin stock: amarra 0, todo a producir, sin reservas', () => {
    const r = amarrarTalla({ tallaId: 42, cantPedida: 100 }, []);
    expect(r).toEqual({
      tallaId: 42, cantPedida: 100, cantAmarrada: 0, cantAProducir: 100, reservas: [],
    });
  });

  it('stock suficiente en una bodega: amarra todo lo pedido', () => {
    const disp: DisponibilidadBodega[] = [{ bodegaId: 1, inventarioPTId: 10, disponible: 100, prioridad: 1 }];
    const r = amarrarTalla({ tallaId: 42, cantPedida: 30 }, disp);
    expect(r.cantAmarrada).toBe(30);
    expect(r.cantAProducir).toBe(0);
    expect(r.reservas).toEqual([{ inventarioPTId: 10, cantidad: 30 }]);
  });

  it('stock parcial: amarra lo disponible y deja el resto a producir', () => {
    const disp: DisponibilidadBodega[] = [{ bodegaId: 1, inventarioPTId: 10, disponible: 20, prioridad: 1 }];
    const r = amarrarTalla({ tallaId: 42, cantPedida: 50 }, disp);
    expect(r.cantAmarrada).toBe(20);
    expect(r.cantAProducir).toBe(30);
    expect(r.reservas).toEqual([{ inventarioPTId: 10, cantidad: 20 }]);
  });

  it('multi-bodega: consume por prioridad (menor primero) y reparte', () => {
    const disp: DisponibilidadBodega[] = [
      { bodegaId: 2, inventarioPTId: 22, disponible: 40, prioridad: 200 }, // HERMANA
      { bodegaId: 1, inventarioPTId: 11, disponible: 30, prioridad: 100 }, // PROPIA
    ];
    const r = amarrarTalla({ tallaId: 42, cantPedida: 50 }, disp);
    expect(r.cantAmarrada).toBe(50);
    expect(r.cantAProducir).toBe(0);
    expect(r.reservas).toEqual([
      { inventarioPTId: 11, cantidad: 30 },
      { inventarioPTId: 22, cantidad: 20 },
    ]);
  });

  it('ignora bodegas sin disponibilidad', () => {
    const disp: DisponibilidadBodega[] = [{ bodegaId: 1, inventarioPTId: 10, disponible: 0, prioridad: 1 }];
    const r = amarrarTalla({ tallaId: 42, cantPedida: 10 }, disp);
    expect(r.cantAmarrada).toBe(0);
    expect(r.reservas).toEqual([]);
  });
});
