import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InventarioService } from './inventario.service';

describe('InventarioService', () => {
  const prisma = {
    bodega: { create: jest.fn() },
    inventarioPT: { upsert: jest.fn(), findMany: jest.fn() },
    inventarioMaterial: { findMany: jest.fn(), upsert: jest.fn(), updateMany: jest.fn() },
    par: { groupBy: jest.fn() },
    material: { findUnique: jest.fn() },
    movimientoInventario: { findMany: jest.fn(), create: jest.fn() },
  } as any;
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  const service = new InventarioService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('crea una bodega', async () => {
    prisma.bodega.create.mockResolvedValue({ id: 1, codigo: 'IBG' });
    const r = await service.crearBodega({ codigo: 'IBG', nombre: 'Ibagué' });
    expect(prisma.bodega.create).toHaveBeenCalledWith({
      data: {
        codigo: 'IBG',
        nombre: 'Ibagué',
        tipo: undefined,
        prioridad: undefined,
      },
    });
    expect(r).toMatchObject({ id: 1 });
  });

  it('registra stock con upsert (suma a lo disponible si ya existe)', async () => {
    prisma.inventarioPT.upsert.mockResolvedValue({ id: 9, cantDisponible: 50 });
    await service.registrarStock({
      productoConfiguradoId: 1,
      tallaId: 42,
      bodegaId: 1,
      cantidad: 50,
    });
    expect(prisma.inventarioPT.upsert).toHaveBeenCalledWith({
      where: {
        productoConfiguradoId_tallaId_bodegaId: {
          productoConfiguradoId: 1,
          tallaId: 42,
          bodegaId: 1,
        },
      },
      create: {
        productoConfiguradoId: 1,
        tallaId: 42,
        bodegaId: 1,
        cantDisponible: 50,
      },
      update: { cantDisponible: { increment: 50 } },
    });
  });
});

describe('InventarioService.consolidado', () => {
  const prisma = {
    inventarioMaterial: { findMany: jest.fn().mockResolvedValue([]) },
    par: { groupBy: jest.fn().mockResolvedValue([]) },
    inventarioPT: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
  const service = new InventarioService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('arma las tres vistas: materiales, WIP por célula y PT', async () => {
    prisma.inventarioMaterial.findMany.mockResolvedValue([
      {
        cantDisponible: 120,
        material: {
          id: 1, codigo: 'CUERO-NEG', nombreCanonico: 'Cuero negro',
          unidadMedida: { codigo: 'M2' },
        },
      },
    ]);
    prisma.par.groupBy.mockResolvedValue([
      { celulaActual: 'CORTE', _count: { _all: 14 } },
      { celulaActual: 'GUARNICION', _count: { _all: 22 } },
    ]);
    prisma.inventarioPT.findMany.mockResolvedValue([
      {
        id: 9, cantDisponible: 35, cantReservada: 5,
        productoConfigurado: { codigo: 'BOTA-X', nombreComercial: 'Bota X' },
        talla: { valor: 40 },
        bodega: { codigo: 'IBG', nombre: 'Ibagué' },
      },
    ]);

    const r = await service.consolidado();

    expect(r.materiales).toEqual([
      {
        materialId: 1, codigo: 'CUERO-NEG', nombre: 'Cuero negro',
        unidad: 'M2', cantDisponible: 120,
      },
    ]);
    // WIP siempre devuelve las 5 células en orden de flujo, aun sin pares (en 0)
    expect(r.wip).toEqual([
      { celula: 'CORTE', pares: 14 },
      { celula: 'GUARNICION', pares: 22 },
      { celula: 'ALMACEN', pares: 0 },
      { celula: 'INYECCION', pares: 0 },
      { celula: 'PT', pares: 0 },
    ]);
    expect(r.pt).toEqual([
      {
        producto: 'Bota X', codigo: 'BOTA-X', talla: 40,
        bodega: 'Ibagué', cantDisponible: 35, cantReservada: 5,
      },
    ]);
  });

  it('WIP excluye pares que no están EN_PROCESO', async () => {
    await service.consolidado();
    expect(prisma.par.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { estado: 'EN_PROCESO' } }),
    );
  });
});

describe('InventarioService.kardex', () => {
  const prisma = {
    movimientoInventario: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
  const service = new InventarioService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('lista movimientos por fecha descendente con límite por defecto 50', async () => {
    await service.kardex();
    expect(prisma.movimientoInventario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 }),
    );
  });

  it('acepta límite explícito con tope 200', async () => {
    await service.kardex(999);
    expect(prisma.movimientoInventario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });
});

describe('InventarioService.movimientoMaterial', () => {
  const prisma = {
    material: { findUnique: jest.fn() },
    inventarioMaterial: {
      upsert: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    movimientoInventario: { create: jest.fn().mockResolvedValue({ id: 1 }) },
  } as any;
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  const service = new InventarioService(prisma);
  const user = { sub: 7, role: 'ADMIN' };
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.inventarioMaterial.updateMany.mockResolvedValue({ count: 1 });
    prisma.material.findUnique.mockResolvedValue({ id: 3 });
  });

  it('ENTRADA por COMPRA: upsert que incrementa stock + movimiento con usuario', async () => {
    await service.movimientoMaterial(
      { materialId: 3, tipo: 'ENTRADA', motivo: 'COMPRA', cantidad: 100, referencia: 'OC-PROV-44' },
      user,
    );
    expect(prisma.inventarioMaterial.upsert).toHaveBeenCalledWith({
      where: { materialId: 3 },
      create: { materialId: 3, cantDisponible: 100 },
      update: { cantDisponible: { increment: 100 } },
    });
    expect(prisma.movimientoInventario.create).toHaveBeenCalledWith({
      data: {
        tipo: 'ENTRADA', motivo: 'COMPRA', materialId: 3,
        cantidad: 100, referencia: 'OC-PROV-44', observaciones: undefined, usuarioId: 7,
      },
    });
  });

  it('SALIDA por DEVOLUCION_PROVEEDOR: decrementa con guarda de stock', async () => {
    await service.movimientoMaterial(
      { materialId: 3, tipo: 'SALIDA', motivo: 'DEVOLUCION_PROVEEDOR', cantidad: 20 },
      user,
    );
    expect(prisma.inventarioMaterial.updateMany).toHaveBeenCalledWith({
      where: { materialId: 3, cantDisponible: { gte: 20 } },
      data: { cantDisponible: { decrement: 20 } },
    });
  });

  it('409 si la SALIDA dejaría stock negativo', async () => {
    prisma.inventarioMaterial.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.movimientoMaterial(
        { materialId: 3, tipo: 'SALIDA', motivo: 'CONSUMO_PRODUCCION', cantidad: 9999 },
        user,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('400 si la combinación tipo/motivo es inválida (core)', async () => {
    await expect(
      service.movimientoMaterial(
        { materialId: 3, tipo: 'SALIDA', motivo: 'COMPRA', cantidad: 5 },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404 si el material no existe', async () => {
    prisma.material.findUnique.mockResolvedValue(null);
    await expect(
      service.movimientoMaterial(
        { materialId: 999, tipo: 'ENTRADA', motivo: 'COMPRA', cantidad: 5 },
        user,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
