import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProveedoresService } from './proveedores.service';

describe('ProveedoresService', () => {
  const prisma = {
    proveedor: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  } as any;
  const service = new ProveedoresService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('crea un proveedor con los datos provistos', async () => {
    prisma.proveedor.findUnique.mockResolvedValue(null);
    prisma.proveedor.create.mockResolvedValue({
      id: 1,
      nit: '800',
      nombre: 'CueroSur',
    });
    const r = await service.crear({ nit: '800', nombre: 'CueroSur' });
    expect(prisma.proveedor.create).toHaveBeenCalledWith({
      data: { nit: '800', nombre: 'CueroSur', ciudad: undefined },
    });
    expect(r).toMatchObject({ id: 1, nit: '800' });
  });

  it('rechaza NIT duplicado', async () => {
    prisma.proveedor.findUnique.mockResolvedValue({ id: 1, nit: '800' });
    await expect(
      service.crear({ nit: '800', nombre: 'X' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('actualiza un proveedor existente', async () => {
    prisma.proveedor.findUnique.mockResolvedValue({ id: 1, nit: '800' });
    prisma.proveedor.update.mockResolvedValue({ id: 1, nombre: 'Nuevo' });
    const r = await service.actualizar(1, { nombre: 'Nuevo' });
    expect(prisma.proveedor.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { nombre: 'Nuevo', ciudad: undefined },
    });
    expect(r).toMatchObject({ id: 1, nombre: 'Nuevo' });
  });

  it('lanza NotFound al actualizar uno inexistente', async () => {
    prisma.proveedor.findUnique.mockResolvedValue(null);
    await expect(
      service.actualizar(99, { nombre: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('desactiva un proveedor existente', async () => {
    prisma.proveedor.findUnique.mockResolvedValue({ id: 1, activo: true });
    prisma.proveedor.update.mockResolvedValue({ id: 1, activo: false });
    const r = await service.desactivar(1);
    expect(prisma.proveedor.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { activo: false },
    });
    expect(r).toMatchObject({ id: 1, activo: false });
  });

  it('lista solo proveedores activos ordenados por nombre', () => {
    prisma.proveedor.findMany.mockReturnValue([]);
    service.listar();
    expect(prisma.proveedor.findMany).toHaveBeenCalledWith({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  });
});
