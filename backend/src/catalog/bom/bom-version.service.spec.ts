import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BomVersionService } from './bom-version.service';

describe('BomVersionService.crearNuevaVersion', () => {
  const prisma: any = {
    bom: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    bomLinea: { create: jest.fn() },
    bomLineaTalla: { create: jest.fn() },
    referencia: { findUnique: jest.fn() },
    material: { findUnique: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  const service = new BomVersionService(prisma);

  const lineaFija = {
    materialId: 30,
    claseConsumo: 'FIJO' as const,
    consumoFijo: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.bom.updateMany.mockResolvedValue({ count: 1 });
    prisma.referencia.findUnique.mockResolvedValue({ id: 1 });
    prisma.material.findUnique.mockResolvedValue({ id: 5, origen: 'FABRICADO' });
    prisma.bom.create.mockResolvedValue({ id: 100 });
    prisma.bomLinea.create.mockResolvedValue({ id: 200 });
    prisma.bom.findUnique.mockResolvedValue({ id: 100, version: 1, activo: true, lineas: [] });
  });

  it('crea la versión 1 cuando la referencia no tenía BOM previo', async () => {
    prisma.bom.findFirst.mockResolvedValue(null);
    await service.crearNuevaVersion({ referenciaId: 1, lineas: [lineaFija] });
    expect(prisma.bom.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ referenciaId: 1, version: 1, activo: true }),
      }),
    );
  });

  it('crea la versión siguiente y desactiva la activa anterior', async () => {
    prisma.bom.findFirst.mockResolvedValue({ id: 99, version: 3 });
    await service.crearNuevaVersion({ referenciaId: 1, lineas: [lineaFija] });
    // Desactiva la activa actual ANTES de crear la nueva
    expect(prisma.bom.updateMany).toHaveBeenCalledWith({
      where: { referenciaId: 1, activo: true },
      data: { activo: false },
    });
    expect(prisma.bom.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: 4, activo: true }),
      }),
    );
  });

  it('crea las líneas de talla de una línea CURVA', async () => {
    prisma.bom.findFirst.mockResolvedValue(null);
    await service.crearNuevaVersion({
      referenciaId: 1,
      lineas: [
        {
          materialId: 10,
          claseConsumo: 'CURVA',
          tallas: [
            { tallaId: 1, consumo: 0.1 },
            { tallaId: 2, consumo: 0.11 },
          ],
        },
      ],
    });
    expect(prisma.bomLineaTalla.create).toHaveBeenCalledTimes(2);
    expect(prisma.bomLineaTalla.create).toHaveBeenCalledWith({
      data: { bomLineaId: 200, tallaId: 1, consumo: 0.1 },
    });
  });

  it('rechaza si no se indica ni referenciaId ni materialId', async () => {
    await expect(
      service.crearNuevaVersion({ lineas: [lineaFija] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza si se indican referenciaId y materialId a la vez', async () => {
    await expect(
      service.crearNuevaVersion({ referenciaId: 1, materialId: 5, lineas: [lineaFija] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza una línea CURVA sin tallas', async () => {
    prisma.bom.findFirst.mockResolvedValue(null);
    await expect(
      service.crearNuevaVersion({
        referenciaId: 1,
        lineas: [{ materialId: 10, claseConsumo: 'CURVA' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza una línea FIJO sin consumoFijo', async () => {
    prisma.bom.findFirst.mockResolvedValue(null);
    await expect(
      service.crearNuevaVersion({
        referenciaId: 1,
        lineas: [{ materialId: 10, claseConsumo: 'FIJO' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza auto-referencia directa en el BOM de un material', async () => {
    await expect(
      service.crearNuevaVersion({
        materialId: 5,
        lineas: [{ materialId: 5, claseConsumo: 'FIJO', consumoFijo: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lanza NotFound si la referencia no existe', async () => {
    prisma.referencia.findUnique.mockResolvedValue(null);
    await expect(
      service.crearNuevaVersion({ referenciaId: 999, lineas: [lineaFija] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
