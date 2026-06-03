import { ConflictException } from '@nestjs/common';
import { ClientesService } from './clientes.service';

describe('ClientesService', () => {
  const prisma = { cliente: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() } } as any;
  const service = new ClientesService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('crea un cliente con los datos provistos', async () => {
    prisma.cliente.findUnique.mockResolvedValue(null);
    prisma.cliente.create.mockResolvedValue({ id: 1, nit: '900', nombre: 'ACME' });
    const r = await service.crear({ nit: '900', nombre: 'ACME' });
    expect(prisma.cliente.create).toHaveBeenCalledWith({
      data: { nit: '900', nombre: 'ACME', ciudad: undefined, tipoCredito: undefined, cupo: undefined },
    });
    expect(r).toMatchObject({ id: 1, nit: '900' });
  });

  it('rechaza NIT duplicado', async () => {
    prisma.cliente.findUnique.mockResolvedValue({ id: 1, nit: '900' });
    await expect(service.crear({ nit: '900', nombre: 'X' })).rejects.toBeInstanceOf(ConflictException);
  });
});
