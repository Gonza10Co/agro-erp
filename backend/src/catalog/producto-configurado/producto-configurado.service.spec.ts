import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProductoConfiguradoService } from './producto-configurado.service';

const CONFIG = {
  referencia: { id: 1, codigo: '101', nombreInterno: 'PODEROSA' },
  marcas: [{ id: 5, codigo: 'PODEROSA', nombre: 'Poderosa', tipo: 'PROPIA' }],
  ejes: [
    { grupo: { id: 10, codigo: 'COLOR', nombre: 'Color', obligatorio: false },
      opciones: [{ id: 100, codigo: 'CAFE', nombre: 'Café' }] },
  ],
};

describe('ProductoConfiguradoService', () => {
  const prisma: any = {
    productoConfigurado: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    productoConfiguradoOpcion: { create: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  const catalog: any = { configReferencia: jest.fn() };
  const service = new ProductoConfiguradoService(prisma, catalog);

  beforeEach(() => {
    jest.clearAllMocks();
    catalog.configReferencia.mockResolvedValue(CONFIG);
    prisma.productoConfigurado.findUnique.mockResolvedValue(null);
    prisma.productoConfigurado.create.mockResolvedValue({ id: 50 });
  });

  it('crea el producto con código determinístico y sus opciones', async () => {
    await service.crear({ referenciaId: 1, marcaId: 5, opcionIds: [100] });
    expect(prisma.productoConfigurado.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ codigo: '101-PODEROSA-CAFE', referenciaId: 1, marcaId: 5 }),
      }),
    );
    expect(prisma.productoConfiguradoOpcion.create).toHaveBeenCalledWith({
      data: { productoConfiguradoId: 50, opcionId: 100 },
    });
  });

  it('rechaza una marca no habilitada (BadRequest)', async () => {
    await expect(
      service.crear({ referenciaId: 1, marcaId: 99, opcionIds: [100] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza si el producto ya existe (Conflict)', async () => {
    prisma.productoConfigurado.findUnique.mockResolvedValue({ id: 1, codigo: '101-PODEROSA-CAFE' });
    await expect(
      service.crear({ referenciaId: 1, marcaId: 5, opcionIds: [100] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
