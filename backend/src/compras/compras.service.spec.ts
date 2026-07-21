import { NotFoundException } from '@nestjs/common';
import { ComprasService } from './compras.service';

function opBase(over: any = {}) {
  return {
    id: 1,
    lineas: [
      {
        productoConfigurado: { referenciaId: 100, marcaId: 5, opciones: [{ opcionId: 9 }] },
        tallas: [
          { tallaId: 10, cantAProducir: 4, talla: { valor: 38 } },
          { tallaId: 11, cantAProducir: 0, talla: { valor: 39 } }, // no suma
        ],
      },
    ],
    ...over,
  };
}

describe('ComprasService.calcularRequerimiento', () => {
  const prisma: any = {
    $queryRawUnsafe: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([]),
    ordenProduccion: { findUnique: jest.fn() },
    inventarioMaterial: { findMany: jest.fn(), update: jest.fn() },
    material: { findMany: jest.fn() },
    requerimientoCompra: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  const bomLoader: any = { cargarEntrada: jest.fn().mockResolvedValue({}) };
  const service = new ComprasService(prisma, bomLoader);
  beforeEach(() => jest.clearAllMocks());

  it('404 si la OP no existe', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(null);
    await expect(service.calcularRequerimiento(1)).rejects.toThrow(NotFoundException);
  });

  it('acumula consumo × cantAProducir, amarra el stock libre y compra el resto', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase());
    jest.spyOn(service as any, 'resolver').mockReturnValue({
      comprados: [{ materialId: 1, consumo: 2 }],
    });
    prisma.inventarioMaterial.findMany.mockResolvedValue([
      { materialId: 1, cantDisponible: 3, cantReservada: 0 },
    ]);
    prisma.material.findMany.mockResolvedValue([
      { id: 1, codigo: 'M1', nombreCanonico: 'Cuero', proveedorId: 7, proveedor: { id: 7, nombre: 'Curtiembre' } },
    ]);
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 1n }]);
    prisma.requerimientoCompra.create.mockResolvedValue({ id: 50, consecutivo: 1, opId: 1, fecha: new Date() });

    const res = await service.calcularRequerimiento(1);

    // Lock pesimista sobre el stock antes de leerlo (mismo patrón del amarre PT).
    expect(prisma.$queryRaw).toHaveBeenCalled();
    const createArg = prisma.requerimientoCompra.create.mock.calls[0][0];
    expect(createArg.data.consecutivo).toBe(1);
    expect(createArg.data.lineas.create).toEqual([
      { materialId: 1, proveedorId: 7, cantNecesaria: 8, cantDisponible: 3, cantReservada: 3, cantAComprar: 5 },
    ]);
    // El amarre sube al agregado por material.
    expect(prisma.inventarioMaterial.update).toHaveBeenCalledWith({
      where: { materialId: 1 },
      data: { cantReservada: { increment: 3 } },
    });
    expect(res.grupos[0].proveedor.nombre).toBe('Curtiembre');
    expect(res.grupos[0].lineas[0].cantAComprar).toBe(5);
    expect(res.reservaActiva).toBe(true);
  });

  it('lo amarrado por otros pedidos no cuenta como disponible', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase());
    jest.spyOn(service as any, 'resolver').mockReturnValue({
      comprados: [{ materialId: 1, consumo: 2 }],
    });
    prisma.inventarioMaterial.findMany.mockResolvedValue([
      { materialId: 1, cantDisponible: 3, cantReservada: 2 }, // otro pedido amarró 2
    ]);
    prisma.material.findMany.mockResolvedValue([
      { id: 1, codigo: 'M1', nombreCanonico: 'Cuero', proveedorId: 7, proveedor: { id: 7, nombre: 'Curtiembre' } },
    ]);
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 2n }]);
    prisma.requerimientoCompra.create.mockResolvedValue({ id: 51, consecutivo: 2, opId: 1, fecha: new Date() });

    await service.calcularRequerimiento(1);

    expect(prisma.requerimientoCompra.create.mock.calls[0][0].data.lineas.create).toEqual([
      { materialId: 1, proveedorId: 7, cantNecesaria: 8, cantDisponible: 3, cantReservada: 1, cantAComprar: 7 },
    ]);
    expect(prisma.inventarioMaterial.update).toHaveBeenCalledWith({
      where: { materialId: 1 },
      data: { cantReservada: { increment: 1 } },
    });
  });

  it('recalcular libera el amarre previo de la MISMA OP antes de re-amarrar', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase());
    jest.spyOn(service as any, 'resolver').mockReturnValue({
      comprados: [{ materialId: 1, consumo: 2 }],
    });
    prisma.requerimientoCompra.findMany.mockResolvedValueOnce([
      { id: 40, lineas: [{ materialId: 1, cantReservada: 2 }] }, // el cálculo anterior
    ]);
    prisma.inventarioMaterial.findMany.mockResolvedValue([
      { materialId: 1, cantDisponible: 3, cantReservada: 0 }, // ya liberado al leer
    ]);
    prisma.material.findMany.mockResolvedValue([
      { id: 1, codigo: 'M1', nombreCanonico: 'Cuero', proveedorId: 7, proveedor: { id: 7, nombre: 'Curtiembre' } },
    ]);
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 3n }]);
    prisma.requerimientoCompra.create.mockResolvedValue({ id: 52, consecutivo: 3, opId: 1, fecha: new Date() });

    await service.calcularRequerimiento(1);

    expect(prisma.requerimientoCompra.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { opId: 1, reservaActiva: true } }),
    );
    expect(prisma.inventarioMaterial.update).toHaveBeenCalledWith({
      where: { materialId: 1 },
      data: { cantReservada: { decrement: 2 } },
    });
    expect(prisma.requerimientoCompra.update).toHaveBeenCalledWith({
      where: { id: 40 },
      data: { reservaActiva: false },
    });
  });

  it('OP sin producción pendiente → requerimiento vacío', async () => {
    const op = opBase();
    op.lineas[0].tallas[0].cantAProducir = 0;
    prisma.ordenProduccion.findUnique.mockResolvedValue(op);
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 1n }]);
    prisma.requerimientoCompra.create.mockResolvedValue({ id: 51, consecutivo: 1, opId: 1, fecha: new Date() });

    const res = await service.calcularRequerimiento(1);
    expect(res.grupos).toEqual([]);
    expect(prisma.requerimientoCompra.create.mock.calls[0][0].data.lineas.create).toEqual([]);
  });
});
