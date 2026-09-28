import { BadRequestException, ConflictException } from '@nestjs/common';
import { InventarioService } from './inventario.service';

describe('InventarioService: carga y ajuste de materia prima', () => {
  const prisma = {
    material: { findMany: jest.fn() },
    inventarioMaterial: { upsert: jest.fn(), updateMany: jest.fn() },
    movimientoInventario: { create: jest.fn() },
    $queryRawUnsafe: jest.fn(),
  } as any;
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  const service = new InventarioService(prisma);
  const user = { sub: 6, role: 'GERENTE' };

  // Los Decimal de Prisma llegan como objetos con toString(); aquí basta el texto.
  const cuero = (inventario: { cantDisponible: string; cantReservada: string } | null) => ({
    id: 1,
    codigo: 'CUERO-01',
    nombreCanonico: 'Cuero graso negro',
    activo: true,
    unidadMedida: { codigo: 'DM2' },
    categoria: { nombre: 'Cueros' },
    inventario,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 4n }]);
  });

  const filaDto = (over: Record<string, unknown> = {}) => ({
    fila: 2,
    codigo: 'CUERO-01',
    conteo: 12.5,
    ...over,
  });

  it('la plantilla trae los materiales activos con su saldo en unidades', async () => {
    prisma.material.findMany.mockResolvedValue([
      cuero({ cantDisponible: '20.5', cantReservada: '8.25' }),
      { ...cuero(null), codigo: 'HILO-02', nombreCanonico: 'Hilo' },
    ]);
    const filas = await service.plantillaAjusteMp();
    expect(prisma.material.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activo: true }, orderBy: { codigo: 'asc' } }),
    );
    expect(filas).toEqual([
      { codigo: 'CUERO-01', material: 'Cuero graso negro', unidad: 'DM2', categoria: 'Cueros', disponible: 20.5, reservado: 8.25 },
      { codigo: 'HILO-02', material: 'Hilo', unidad: 'DM2', categoria: 'Cueros', disponible: 0, reservado: 0 },
    ]);
  });

  it('previsualiza sin escribir nada', async () => {
    prisma.material.findMany.mockResolvedValue([cuero(null)]);
    const r = await service.previsualizarAjusteMp({ filas: [filaDto()] });
    expect(r.resumen).toMatchObject({ suben: 1, cantidadEntra: 12.5 });
    expect(r.filas[0]).not.toHaveProperty('ids');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('aplica: fija el saldo existente con guarda exacta y anota la salida con AJ-n', async () => {
    prisma.material.findMany.mockResolvedValue([cuero({ cantDisponible: '20.5', cantReservada: '8.25' })]);
    prisma.inventarioMaterial.updateMany.mockResolvedValue({ count: 1 });

    const r = await service.aplicarAjusteMp({ filas: [filaDto({ conteo: 12.3 })] }, user);

    expect(r.referencia).toBe('AJ-4');
    expect(prisma.inventarioMaterial.updateMany).toHaveBeenCalledWith({
      where: { materialId: 1, cantDisponible: '20.5000', cantReservada: { lte: '12.3000' } },
      data: { cantDisponible: '12.3000' },
    });
    expect(prisma.movimientoInventario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: 'SALIDA',
        motivo: 'AJUSTE_MANUAL',
        materialId: 1,
        cantidad: '8.2000',
        referencia: 'AJ-4',
        usuarioId: 6,
      }),
    });
  });

  it('aplica: un material sin saldo lo crea con lo contado y entra como ENTRADA', async () => {
    prisma.material.findMany.mockResolvedValue([cuero(null)]);
    prisma.inventarioMaterial.upsert.mockResolvedValue({ id: 90, cantDisponible: '12.5' });
    await service.aplicarAjusteMp({ filas: [filaDto()], observaciones: 'Conteo inicial' }, user);
    expect(prisma.inventarioMaterial.upsert).toHaveBeenCalledWith({
      where: { materialId: 1 },
      create: { materialId: 1, cantDisponible: '12.5000' },
      update: {},
    });
    expect(prisma.movimientoInventario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tipo: 'ENTRADA', cantidad: '12.5000', observaciones: 'Conteo inicial' }),
    });
  });

  it('no toca nada si alguna fila tiene error', async () => {
    prisma.material.findMany.mockResolvedValue([cuero(null)]);
    await expect(
      service.aplicarAjusteMp({ filas: [filaDto(), filaDto({ fila: 3, codigo: 'X' })] }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza un conteo que no cambia nada', async () => {
    prisma.material.findMany.mockResolvedValue([cuero({ cantDisponible: '12.5', cantReservada: '0' })]);
    await expect(service.aplicarAjusteMp({ filas: [filaDto()] }, user)).rejects.toThrow(
      /no cambia ningún saldo/,
    );
  });

  it('si el saldo cambió entre la revisión y el ajuste, aborta con 409', async () => {
    prisma.material.findMany.mockResolvedValue([cuero({ cantDisponible: '20', cantReservada: '0' })]);
    prisma.inventarioMaterial.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.aplicarAjusteMp({ filas: [filaDto()] }, user)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.movimientoInventario.create).not.toHaveBeenCalled();
  });

  it('si otro creó el saldo en el medio, el upsert no lo pisa y aborta con 409', async () => {
    prisma.material.findMany.mockResolvedValue([cuero(null)]);
    prisma.inventarioMaterial.upsert.mockResolvedValue({ id: 90, cantDisponible: '3' });
    await expect(service.aplicarAjusteMp({ filas: [filaDto()] }, user)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
