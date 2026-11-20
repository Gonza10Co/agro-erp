import { ProyeccionService } from './proyeccion.service';

/**
 * Lo que la proyección pone a fabricar de un pedido que ya tiene OP. Caso de la
 * reasignación (JP, 2026-11-19): el pedido A cedió pares a B; A debe volver a
 * aparecer con esos pares por producir, y B con menos.
 */
function oc(id: number, tallas: any[], calidad = 'PRIMERA', estadoOP = 'AMARRADA') {
  return {
    id,
    consecutivo: id,
    ocCliente: null,
    fecha: new Date('2026-11-10T15:00:00Z'),
    fechaConfirmacion: new Date('2026-11-10T15:00:00Z'),
    paraStock: false,
    fechaEntrega: null,
    cliente: { nombre: `Cliente ${id}` },
    lineas: [
      {
        productoConfiguradoId: 7,
        calidad,
        productoConfigurado: { nombreComercial: 'Alpaca', referencia: { codigo: '101' }, marca: { nombre: 'Agro' } },
        tallas: [{ cantidad: 20, talla: { id: 3, valor: 40 } }],
      },
    ],
    ordenProduccion: {
      id: id * 10,
      estado: estadoOP,
      lineas: [{ productoConfiguradoId: 7, calidad, tallas }],
    },
  };
}

function prismaCon(ocs: any[]) {
  return {
    ordenCompra: { findMany: jest.fn().mockResolvedValue(ocs) },
    inventarioPT: { groupBy: jest.fn().mockResolvedValue([]) },
    par: { findMany: jest.fn().mockResolvedValue([]) },
    calendarioLaboral: { findUnique: jest.fn().mockResolvedValue(null) },
    diaNoHabil: { findMany: jest.fn().mockResolvedValue([]) },
    talla: { findMany: jest.fn().mockResolvedValue([{ id: 3, valor: 40 }]) },
    productoConfigurado: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

const AHORA = new Date('2026-11-19T15:00:00Z');

describe('ProyeccionService: lo pendiente de una OP sale de sus reservas', () => {
  it('un pedido fabricado completo y reservado no pone nada a producir', async () => {
    const prisma = prismaCon([oc(1, [{ tallaId: 3, cantAmarrada: 0, cantAProducir: 20, reassignedOut: 0, reservas: [{ cantidad: 20 }] }])]);
    const r = await new ProyeccionService(prisma as any).proyectar(AHORA);
    expect(r.pedidos[0].aProducir).toBe(0);
  });

  it('el pedido que cedió 5 pares vuelve a tener esos 5 por producir', async () => {
    // Pedido de 20 fabricado completo (sus 20 pares TERMINADOS siguen contando como
    // hechos de su OF), pero 5 se pasaron a otro pedido: quedan 15 reservados.
    const prisma = prismaCon([oc(1, [{ tallaId: 3, cantAmarrada: 0, cantAProducir: 25, reassignedOut: 5, reservas: [{ cantidad: 15 }] }])]);
    const r = await new ProyeccionService(prisma as any).proyectar(AHORA);
    expect(r.pedidos[0].aProducir).toBe(5);
  });

  it('el pedido que recibió pares ya no los pone a producir', async () => {
    // Pedido de 20 sin nada fabricado; recibió 8 de otro pedido.
    const prisma = prismaCon([oc(2, [{ tallaId: 3, cantAmarrada: 8, cantAProducir: 12, reassignedOut: 0, reservas: [{ cantidad: 8 }] }])]);
    const r = await new ProyeccionService(prisma as any).proyectar(AHORA);
    expect(r.pedidos[0].aProducir).toBe(12);
  });

  it('lo ya despachado en parte no vuelve a ponerse a producir', async () => {
    // Pedido de 20: salieron 12 en un despacho parcial, 3 siguen reservados → faltan 5.
    const prisma = prismaCon([oc(4, [{ tallaId: 3, cantAmarrada: 0, cantAProducir: 20, reassignedOut: 0, dispatched: 12, reservas: [{ cantidad: 3 }] }], 'PRIMERA', 'EN_PRODUCCION')]);
    const r = await new ProyeccionService(prisma as any).proyectar(AHORA);
    expect(r.pedidos[0].aProducir).toBe(5);
    // Y la consulta pide la columna: sin ella lo despachado contaría como pendiente.
    const args = prisma.ordenCompra.findMany.mock.calls[0][0];
    expect(JSON.stringify(args)).toContain('"dispatched":true');
  });

  it('una línea de segundas nunca se pone a producir', async () => {
    const prisma = prismaCon([oc(3, [{ tallaId: 3, cantAmarrada: 20, cantAProducir: 0, reassignedOut: 0, reservas: [{ cantidad: 15 }] }], 'SEGUNDA')]);
    const r = await new ProyeccionService(prisma as any).proyectar(AHORA);
    expect(r.pedidos[0].aProducir).toBe(0);
  });
});
