import { BadRequestException, ConflictException } from '@nestjs/common';
import { InventarioService } from './inventario.service';

describe('InventarioService: carga y ajuste de producto terminado', () => {
  const prisma = {
    productoConfigurado: { findMany: jest.fn() },
    talla: { findMany: jest.fn() },
    bodega: { findMany: jest.fn() },
    inventarioPT: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    movimientoInventario: { create: jest.fn() },
    $queryRawUnsafe: jest.fn(),
  } as any;
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  const service = new InventarioService(prisma);
  const user = { sub: 6, role: 'GERENTE' };

  const producto = {
    id: 1,
    codigo: '101-PODEROSA',
    nombreComercial: 'Bota Poderosa',
    referencia: { codigo: '101', tallaMin: { valor: 38 }, tallaMax: { valor: 40 } },
    marca: { nombre: 'Poderosa' },
  };
  const tallas = [
    { id: 13, valor: 37 },
    { id: 14, valor: 38 },
    { id: 16, valor: 40 },
    { id: 17, valor: 41 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.productoConfigurado.findMany.mockResolvedValue([producto]);
    prisma.talla.findMany.mockResolvedValue(tallas);
    prisma.bodega.findMany.mockResolvedValue([{ id: 5, codigo: 'IBG' }]);
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 3n }]);
  });

  const filaDto = (over: Record<string, unknown> = {}) => ({
    fila: 2,
    codigo: '101-PODEROSA',
    talla: 38,
    bodega: 'IBG',
    calidad: 'PRIMERA',
    conteo: 25,
    ...over,
  });

  it('la plantilla trae el rango de tallas en PRIMERA y la SEGUNDA solo donde hay saldo', async () => {
    prisma.inventarioPT.findMany.mockResolvedValue([
      { productoConfiguradoId: 1, tallaId: 14, bodegaId: 5, calidad: 'PRIMERA', cantDisponible: 20, cantReservada: 8 },
      { productoConfiguradoId: 1, tallaId: 16, bodegaId: 5, calidad: 'SEGUNDA', cantDisponible: 2, cantReservada: 0 },
    ]);
    const filas = await service.plantillaAjustePt();
    expect(filas.map((f) => `${f.talla}-${f.calidad}-${f.disponible}`)).toEqual([
      '38-PRIMERA-20',
      '40-PRIMERA-0',
      '40-SEGUNDA-2',
    ]);
    expect(filas[0]).toMatchObject({ referencia: '101', marca: 'Poderosa', bodega: 'IBG', reservado: 8 });
  });

  it('previsualiza sin escribir nada', async () => {
    prisma.inventarioPT.findMany.mockResolvedValue([]);
    const r = await service.previsualizarAjustePt({ filas: [filaDto()] });
    expect(r.resumen).toMatchObject({ suben: 1, paresEntran: 25 });
    expect(r.filas[0]).not.toHaveProperty('ids');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('aplica: fija el saldo existente con guarda y anota la salida en el kardex con AJ-n', async () => {
    prisma.inventarioPT.findMany.mockResolvedValue([
      { productoConfiguradoId: 1, tallaId: 14, bodegaId: 5, calidad: 'PRIMERA', cantDisponible: 20, cantReservada: 8 },
    ]);
    prisma.inventarioPT.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventarioPT.findUniqueOrThrow.mockResolvedValue({ id: 77 });

    const r = await service.aplicarAjustePt({ filas: [filaDto({ conteo: 12 })] }, user);

    expect(r.referencia).toBe('AJ-3');
    expect(prisma.inventarioPT.updateMany).toHaveBeenCalledWith({
      where: {
        productoConfiguradoId: 1,
        tallaId: 14,
        bodegaId: 5,
        calidad: 'PRIMERA',
        cantDisponible: 20,
        cantReservada: { lte: 12 },
      },
      data: { cantDisponible: 12 },
    });
    expect(prisma.movimientoInventario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: 'SALIDA',
        motivo: 'AJUSTE_MANUAL',
        inventarioPTId: 77,
        cantidad: 8,
        referencia: 'AJ-3',
        usuarioId: 6,
      }),
    });
  });

  it('aplica: un saldo nuevo nace con lo contado y entra como ENTRADA', async () => {
    prisma.inventarioPT.findMany.mockResolvedValue([]);
    prisma.inventarioPT.upsert.mockResolvedValue({ id: 90, cantDisponible: 25 });
    await service.aplicarAjustePt({ filas: [filaDto()], observaciones: 'Conteo inicial' }, user);
    expect(prisma.movimientoInventario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: 'ENTRADA', cantidad: 25, observaciones: 'Conteo inicial' }),
    });
  });

  it('no toca nada si alguna fila tiene error', async () => {
    prisma.inventarioPT.findMany.mockResolvedValue([]);
    await expect(
      service.aplicarAjustePt({ filas: [filaDto(), filaDto({ fila: 3, codigo: 'X' })] }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza un conteo que no cambia nada', async () => {
    prisma.inventarioPT.findMany.mockResolvedValue([
      { productoConfiguradoId: 1, tallaId: 14, bodegaId: 5, calidad: 'PRIMERA', cantDisponible: 25, cantReservada: 0 },
    ]);
    await expect(service.aplicarAjustePt({ filas: [filaDto()] }, user)).rejects.toThrow(
      /no cambia ningún saldo/,
    );
  });

  it('si el saldo cambió entre la revisión y el ajuste, aborta con 409', async () => {
    prisma.inventarioPT.findMany.mockResolvedValue([
      { productoConfiguradoId: 1, tallaId: 14, bodegaId: 5, calidad: 'PRIMERA', cantDisponible: 20, cantReservada: 0 },
    ]);
    prisma.inventarioPT.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.aplicarAjustePt({ filas: [filaDto()] }, user)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.movimientoInventario.create).not.toHaveBeenCalled();
  });
});
