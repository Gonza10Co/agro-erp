import { InventarioService } from './inventario.service';

describe('InventarioService', () => {
  const prisma = {
    bodega: { create: jest.fn() },
    inventarioPT: { upsert: jest.fn() },
  } as any;
  const service = new InventarioService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('crea una bodega', async () => {
    prisma.bodega.create.mockResolvedValue({ id: 1, codigo: 'IBG' });
    const r = await service.crearBodega({ codigo: 'IBG', nombre: 'Ibagué' });
    expect(prisma.bodega.create).toHaveBeenCalledWith({
      data: { codigo: 'IBG', nombre: 'Ibagué', tipo: undefined, prioridad: undefined },
    });
    expect(r).toMatchObject({ id: 1 });
  });

  it('registra stock con upsert (suma a lo disponible si ya existe)', async () => {
    prisma.inventarioPT.upsert.mockResolvedValue({ id: 9, cantDisponible: 50 });
    await service.registrarStock({ productoConfiguradoId: 1, tallaId: 42, bodegaId: 1, cantidad: 50 });
    expect(prisma.inventarioPT.upsert).toHaveBeenCalledWith({
      where: { productoConfiguradoId_tallaId_bodegaId: { productoConfiguradoId: 1, tallaId: 42, bodegaId: 1 } },
      create: { productoConfiguradoId: 1, tallaId: 42, bodegaId: 1, cantDisponible: 50 },
      update: { cantDisponible: { increment: 50 } },
    });
  });
});
