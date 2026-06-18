import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClientesService } from './clientes.service';

describe('ClientesService', () => {
  const prisma = {
    cliente: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  } as any;
  const service = new ClientesService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('crea un cliente con los datos provistos', async () => {
    prisma.cliente.findUnique.mockResolvedValue(null);
    prisma.cliente.create.mockResolvedValue({
      id: 1,
      nit: '900',
      nombre: 'ACME',
    });
    const r = await service.crear({ nit: '900', nombre: 'ACME' });
    expect(prisma.cliente.create).toHaveBeenCalledWith({
      data: {
        nit: '900',
        nombre: 'ACME',
        ciudad: undefined,
        tipoCredito: undefined,
        cupo: undefined,
      },
    });
    expect(r).toMatchObject({ id: 1, nit: '900' });
  });

  it('rechaza NIT duplicado', async () => {
    prisma.cliente.findUnique.mockResolvedValue({ id: 1, nit: '900' });
    await expect(
      service.crear({ nit: '900', nombre: 'X' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('actualiza un cliente existente', async () => {
    prisma.cliente.findUnique.mockResolvedValue({ id: 1, nit: '900' });
    prisma.cliente.update.mockResolvedValue({ id: 1, nombre: 'NUEVO' });
    const r = await service.actualizar(1, { nombre: 'NUEVO' });
    expect(prisma.cliente.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { nombre: 'NUEVO', ciudad: undefined, tipoCredito: undefined, cupo: undefined },
    });
    expect(r).toMatchObject({ nombre: 'NUEVO' });
  });

  it('lanza NotFound al actualizar un cliente inexistente', async () => {
    prisma.cliente.findUnique.mockResolvedValue(null);
    await expect(service.actualizar(99, { nombre: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('desactiva un cliente (activo:false)', async () => {
    prisma.cliente.findUnique.mockResolvedValue({ id: 1 });
    prisma.cliente.update.mockResolvedValue({ id: 1, activo: false });
    await service.desactivar(1);
    expect(prisma.cliente.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { activo: false } });
  });
});
