import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OcService } from './oc.service';

describe('OcService', () => {
  const prisma = {
    $queryRawUnsafe: jest.fn(),
    ordenCompra: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ordenCompraLinea: { deleteMany: jest.fn() },
    ordenCompraLineaTalla: { deleteMany: jest.fn() },
    cliente: { findUnique: jest.fn() },
    // crear()/actualizar() consultan las sedes del cliente para resolver el destino.
    sedeCliente: { findMany: jest.fn() },
  } as any;
  // crear() corre dentro de $transaction; el tx reusa el mismo mock raíz.
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
  const service = new OcService(prisma);
  beforeEach(() => {
    jest.clearAllMocks();
    // Por defecto, cliente sin sedes: la OC queda sin destino y no estorba a los tests viejos.
    prisma.sedeCliente.findMany.mockResolvedValue([]);
  });

  it('crear asigna el consecutivo de la secuencia y estado BORRADOR', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 3901n }]);
    prisma.ordenCompra.create.mockResolvedValue({ id: 1, consecutivo: 3901 });
    await service.crear({
      clienteId: 7,
      lineas: [
        { productoConfiguradoId: 2, tallas: [{ tallaId: 5, cantidad: 10 }] },
      ],
    });
    expect(prisma.ordenCompra.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          consecutivo: 3901,
          clienteId: 7,
          estado: 'BORRADOR',
        }),
      }),
    );
  });

  it('crear persiste el precioUnitario pactado de cada línea', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 1n }]);
    prisma.ordenCompra.create.mockResolvedValue({ id: 1, consecutivo: 1 });
    await service.crear({
      clienteId: 7,
      lineas: [
        { productoConfiguradoId: 2, precioUnitario: 85000, tallas: [{ tallaId: 5, cantidad: 10 }] },
      ],
    });
    const arg = prisma.ordenCompra.create.mock.calls[0][0];
    expect(arg.data.lineas.create[0].precioUnitario).toBe(85000);
  });

  it('primer consecutivo es 1 cuando no hay OCs', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 1n }]);
    prisma.ordenCompra.create.mockResolvedValue({ id: 1, consecutivo: 1 });
    await service.crear({
      clienteId: 7,
      lineas: [
        { productoConfiguradoId: 2, tallas: [{ tallaId: 5, cantidad: 10 }] },
      ],
    });
    expect(prisma.ordenCompra.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ consecutivo: 1 }),
      }),
    );
  });

  it('crear hereda la sede principal del cliente y congela su dirección', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 1n }]);
    prisma.ordenCompra.create.mockResolvedValue({ id: 1, consecutivo: 1 });
    prisma.sedeCliente.findMany.mockResolvedValue([
      { id: 4, ciudad: 'Cali', direccion: 'Bodega Sur', esPrincipal: false, activo: true },
      { id: 9, ciudad: 'Ibagué', direccion: 'Cra 5 # 10-20', esPrincipal: true, activo: true },
    ]);
    await service.crear({
      clienteId: 7,
      lineas: [{ productoConfiguradoId: 2, tallas: [{ tallaId: 5, cantidad: 10 }] }],
    });
    const data = prisma.ordenCompra.create.mock.calls[0][0].data;
    expect(data.sedeEntregaId).toBe(9);
    expect(data.direccionDespacho).toBe('Cra 5 # 10-20, Ibagué');
  });

  it('crear rechaza una sede que no es del cliente', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 1n }]);
    prisma.sedeCliente.findMany.mockResolvedValue([
      { id: 9, ciudad: 'Ibagué', direccion: 'Cra 5', esPrincipal: true, activo: true },
    ]);
    await expect(
      service.crear({
        clienteId: 7,
        sedeEntregaId: 123, // de otro cliente
        lineas: [{ productoConfiguradoId: 2, tallas: [{ tallaId: 5, cantidad: 10 }] }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.ordenCompra.create).not.toHaveBeenCalled();
  });

  it('crear rechaza una sede inactiva del propio cliente', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 1n }]);
    prisma.sedeCliente.findMany.mockResolvedValue([
      { id: 9, ciudad: 'Ibagué', direccion: 'Cra 5', esPrincipal: false, activo: false },
    ]);
    await expect(
      service.crear({
        clienteId: 7,
        sedeEntregaId: 9,
        lineas: [{ productoConfiguradoId: 2, tallas: [{ tallaId: 5, cantidad: 10 }] }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('confirmar lanza BadRequest con los errores de validación', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue({
      id: 1,
      estado: 'BORRADOR',
      cliente: { activo: false }, // <- fuerza el error
      lineas: [
        {
          productoConfigurado: {
            referencia: { tallaMin: { valor: 34 }, tallaMax: { valor: 46 } },
          },
          tallas: [{ cantidad: 10, talla: { valor: 40 } }],
        },
      ],
    });
    await expect(service.confirmar(1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.ordenCompra.update).not.toHaveBeenCalled();
  });

  it('confirmar pasa la OC a CONFIRMADA cuando es válida', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue({
      id: 1,
      estado: 'BORRADOR',
      cliente: { activo: true },
      lineas: [
        {
          productoConfigurado: {
            referencia: { tallaMin: { valor: 34 }, tallaMax: { valor: 46 } },
          },
          tallas: [{ cantidad: 10, talla: { valor: 40 } }],
        },
      ],
    });
    prisma.ordenCompra.update.mockResolvedValue({
      id: 1,
      estado: 'CONFIRMADA',
    });
    const r = await service.confirmar(1);
    const arg = prisma.ordenCompra.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 1 });
    expect(arg.data.estado).toBe('CONFIRMADA');
    // se sella la fecha de confirmación (arranca el reloj de demora)
    expect(arg.data.fechaConfirmacion).toBeInstanceOf(Date);
    expect(r).toMatchObject({ estado: 'CONFIRMADA' });
  });

  it('listar devuelve las OCs ordenadas por consecutivo desc', async () => {
    prisma.ordenCompra.findMany.mockResolvedValue([
      { id: 2, estado: 'BORRADOR', fechaConfirmacion: null, cliente: { estadoCartera: 'AL_DIA' } },
      { id: 1, estado: 'BORRADOR', fechaConfirmacion: null, cliente: { estadoCartera: 'AL_DIA' } },
    ]);
    const r = await service.listar();
    expect(prisma.ordenCompra.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { consecutivo: 'desc' } }),
    );
    expect(r).toHaveLength(2);
  });

  it('listar adjunta el semáforo de demora: OC confirmada vieja → ROJO', async () => {
    prisma.ordenCompra.findMany.mockResolvedValue([
      {
        id: 1,
        estado: 'CONFIRMADA',
        fechaConfirmacion: new Date('2000-01-01'),
        cliente: { estadoCartera: 'AL_DIA' },
      },
    ]);
    const r = await service.listar();
    expect(r[0].estadoDemora).toBe('ROJO');
    expect(typeof r[0].diasDemora).toBe('number');
  });

  it('listar marca "retenida por cartera" cuando el cliente está vencido', async () => {
    prisma.ordenCompra.findMany.mockResolvedValue([
      {
        id: 1,
        estado: 'CONFIRMADA',
        fechaConfirmacion: new Date('2000-01-01'),
        cliente: { estadoCartera: 'VENCIDO' },
      },
    ]);
    const r = await service.listar();
    expect(r[0].estadoDemora).toBe('RETENIDA_CARTERA');
  });

  it('obtener lanza NotFound si la OC no existe', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue(null);
    await expect(service.obtener(99)).rejects.toThrow('OC 99 no existe');
  });

  it('obtener devuelve la OC con sus relaciones', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue({ id: 1, lineas: [] });
    const r = await service.obtener(1);
    expect(r).toMatchObject({ id: 1 });
  });

  it('actualizar recrea las líneas y la cabecera de una OC en BORRADOR', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue({ id: 1, estado: 'BORRADOR' });
    prisma.ordenCompra.update.mockResolvedValue({ id: 1, estado: 'BORRADOR' });
    await service.actualizar(1, {
      clienteId: 7,
      observaciones: 'editada',
      lineas: [{ productoConfiguradoId: 2, precioUnitario: 90000, tallas: [{ tallaId: 5, cantidad: 12 }] }],
    });
    // borra tallas y líneas viejas antes de recrear
    expect(prisma.ordenCompraLineaTalla.deleteMany).toHaveBeenCalledWith({ where: { ocLinea: { ocId: 1 } } });
    expect(prisma.ordenCompraLinea.deleteMany).toHaveBeenCalledWith({ where: { ocId: 1 } });
    const arg = prisma.ordenCompra.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 1 });
    expect(arg.data.observaciones).toBe('editada');
    expect(arg.data.lineas.create[0].precioUnitario).toBe(90000);
  });

  it('actualizar rechaza una OC que no está en BORRADOR', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue({ id: 1, estado: 'CONFIRMADA' });
    await expect(
      service.actualizar(1, { clienteId: 7, lineas: [{ productoConfiguradoId: 2, tallas: [{ tallaId: 5, cantidad: 1 }] }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.ordenCompra.update).not.toHaveBeenCalled();
  });

  it('actualizar lanza NotFound si la OC no existe', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue(null);
    await expect(
      service.actualizar(99, { clienteId: 7, lineas: [{ productoConfiguradoId: 2, tallas: [{ tallaId: 5, cantidad: 1 }] }] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('eliminar borra tallas, líneas y la OC cuando está en BORRADOR', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue({ id: 1, estado: 'BORRADOR' });
    prisma.ordenCompra.delete.mockResolvedValue({ id: 1 });
    await service.eliminar(1);
    // el orden importa: primero las hojas, después el tronco
    expect(prisma.ordenCompraLineaTalla.deleteMany).toHaveBeenCalledWith({ where: { ocLinea: { ocId: 1 } } });
    expect(prisma.ordenCompraLinea.deleteMany).toHaveBeenCalledWith({ where: { ocId: 1 } });
    expect(prisma.ordenCompra.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('eliminar rechaza una OC que no está en BORRADOR', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue({ id: 1, estado: 'CONFIRMADA' });
    await expect(service.eliminar(1)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.ordenCompra.delete).not.toHaveBeenCalled();
    expect(prisma.ordenCompraLinea.deleteMany).not.toHaveBeenCalled();
  });

  it('eliminar lanza NotFound si la OC no existe', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue(null);
    await expect(service.eliminar(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});
