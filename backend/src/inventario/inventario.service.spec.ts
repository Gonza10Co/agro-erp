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
    // Sin grado explícito la carga es de PRIMERA: las cargas que ya existían
    // siguen comportándose igual.
    expect(prisma.inventarioPT.upsert).toHaveBeenCalledWith({
      where: {
        productoConfiguradoId_tallaId_bodegaId_calidad: {
          productoConfiguradoId: 1,
          tallaId: 42,
          bodegaId: 1,
          calidad: 'PRIMERA',
        },
      },
      create: {
        productoConfiguradoId: 1,
        tallaId: 42,
        bodegaId: 1,
        calidad: 'PRIMERA',
        cantDisponible: 50,
      },
      update: { cantDisponible: { increment: 50 } },
    });
  });

  it('permite cargar saldo de SEGUNDA sin tocar el de primera (caso SEGUNDAS FEROZ)', async () => {
    prisma.inventarioPT.upsert.mockResolvedValue({ id: 10, cantDisponible: 336 });
    await service.registrarStock({
      productoConfiguradoId: 1,
      tallaId: 42,
      bodegaId: 1,
      cantidad: 336,
      calidad: 'SEGUNDA',
    });
    expect(prisma.inventarioPT.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productoConfiguradoId_tallaId_bodegaId_calidad: {
            productoConfiguradoId: 1,
            tallaId: 42,
            bodegaId: 1,
            calidad: 'SEGUNDA',
          },
        },
        create: expect.objectContaining({ calidad: 'SEGUNDA', cantDisponible: 336 }),
      }),
    );
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
        cantReservada: 20,
        material: {
          id: 1, codigo: 'CUERO-NEG', nombreCanonico: 'Cuero negro',
          unidadMedida: { codigo: 'M2' },
          categoria: { nombre: 'Cueros' },
        },
      },
    ]);
    prisma.par.groupBy.mockResolvedValue([
      { celulaActual: 'CORTE', _count: { _all: 14 } },
      { celulaActual: 'GUARNICION', _count: { _all: 22 } },
    ]);
    prisma.inventarioPT.findMany.mockResolvedValue([
      {
        id: 9, cantDisponible: 35, cantReservada: 5, calidad: 'PRIMERA',
        productoConfigurado: {
          codigo: 'BOTA-X', nombreComercial: 'Bota X',
          referencia: { codigo: '101' },
          marca: { nombre: 'PODEROSA', linea: { id: 4, nombre: 'Basarili' } },
        },
        talla: { valor: 40 },
        bodega: { codigo: 'IBG', nombre: 'Ibagué' },
      },
    ]);

    const r = await service.consolidado();

    expect(r.materiales).toEqual([
      {
        materialId: 1, codigo: 'CUERO-NEG', nombre: 'Cuero negro',
        unidad: 'M2', categoria: 'Cueros', cantDisponible: 120, cantReservada: 20,
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
        producto: 'Bota X', codigo: 'BOTA-X', referencia: '101', marca: 'PODEROSA',
        lineaId: 4, linea: 'Basarili', talla: 40, calidad: 'PRIMERA',
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

  it('filtra el WIP por línea cuando se pasa lineaId', async () => {
    await service.consolidado(4);
    expect(prisma.par.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { estado: 'EN_PROCESO', lineaId: 4 } }),
    );
  });
});

describe('InventarioService.wipDetail', () => {
  const prisma = {
    par: { groupBy: jest.fn() },
    productoConfigurado: { findMany: jest.fn() },
    talla: { findMany: jest.fn() },
    linea: { findMany: jest.fn() },
    ordenFabricacion: { findMany: jest.fn() },
  } as any;
  const service = new InventarioService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('sin pares en proceso no consulta catálogos', async () => {
    prisma.par.groupBy.mockResolvedValue([]);
    expect(await service.wipDetail()).toEqual([]);
    expect(prisma.productoConfigurado.findMany).not.toHaveBeenCalled();
    expect(prisma.par.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { estado: 'EN_PROCESO' } }),
    );
  });

  it('agrupa por célula, OF, producto y talla, y filtra por línea', async () => {
    prisma.par.groupBy.mockResolvedValue([
      { celulaActual: 'INYECCION', productoConfiguradoId: 7, tallaId: 3, lineaId: 4, ofId: 2, calidad: 'PRIMERA', _count: { _all: 12 } },
    ]);
    prisma.productoConfigurado.findMany.mockResolvedValue([
      { id: 7, codigo: 'PC-7', nombreComercial: 'PODEROSA · Con puntera', referencia: { codigo: '101' }, marca: { nombre: 'PODEROSA' } },
    ]);
    prisma.talla.findMany.mockResolvedValue([{ id: 3, valor: 40 }]);
    prisma.linea.findMany.mockResolvedValue([{ id: 4, nombre: 'Basarili' }]);
    prisma.ordenFabricacion.findMany.mockResolvedValue([{ id: 2, consecutivo: 21 }]);

    const r = await service.wipDetail(4);

    expect(prisma.par.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { estado: 'EN_PROCESO', lineaId: 4 } }),
    );
    expect(r).toEqual([
      {
        celula: 'INYECCION', of: 21, linea: 'Basarili', referencia: '101', marca: 'PODEROSA',
        producto: 'PODEROSA · Con puntera', codigo: 'PC-7', talla: 40, calidad: 'PRIMERA', pares: 12,
      },
    ]);
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
