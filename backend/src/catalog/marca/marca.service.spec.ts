import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MarcaService } from './marca.service';
import { TipoMarcaDto } from './dto/crear-marca.dto';

describe('MarcaService', () => {
  const prisma = {
    marca: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  } as any;
  const service = new MarcaService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('crea una marca con los datos provistos', async () => {
    prisma.marca.findUnique.mockResolvedValue(null);
    prisma.marca.create.mockResolvedValue({
      id: 1,
      codigo: 'M001',
      nombre: 'Basarili',
    });
    const r = await service.crear({
      codigo: 'M001',
      nombre: 'Basarili',
      tipo: TipoMarcaDto.PROPIA,
    });
    expect(prisma.marca.create).toHaveBeenCalledWith({
      data: {
        codigo: 'M001',
        nombre: 'Basarili',
        tipo: TipoMarcaDto.PROPIA,
        clienteId: undefined,
        lineaId: undefined,
      },
    });
    expect(r).toMatchObject({ id: 1, codigo: 'M001' });
  });

  it('rechaza código duplicado', async () => {
    prisma.marca.findUnique.mockResolvedValue({ id: 1, codigo: 'M001' });
    await expect(
      service.crear({
        codigo: 'M001',
        nombre: 'X',
        tipo: TipoMarcaDto.PROPIA,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('actualiza una marca existente', async () => {
    prisma.marca.findUnique.mockResolvedValue({ id: 1, codigo: 'M001' });
    prisma.marca.update.mockResolvedValue({ id: 1, nombre: 'Nuevo nombre' });
    const r = await service.actualizar(1, { nombre: 'Nuevo nombre', lineaId: 4 });
    expect(prisma.marca.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { nombre: 'Nuevo nombre', tipo: undefined, clienteId: undefined, lineaId: 4 },
    });
    expect(r).toMatchObject({ id: 1, nombre: 'Nuevo nombre' });
  });

  it('lanza NotFound al actualizar una marca inexistente', async () => {
    prisma.marca.findUnique.mockResolvedValue(null);
    await expect(
      service.actualizar(99, { nombre: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('desactiva una marca (activo:false)', async () => {
    prisma.marca.findUnique.mockResolvedValue({ id: 1, codigo: 'M001' });
    prisma.marca.update.mockResolvedValue({ id: 1, activo: false });
    const r = await service.desactivar(1);
    expect(prisma.marca.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { activo: false },
    });
    expect(r).toMatchObject({ id: 1, activo: false });
  });

  // Reactivar deshace un desactivar accidental (activo:true).
  it('reactiva (activo:true)', async () => {
    prisma.marca.findUnique.mockResolvedValue({ id: 1, activo: false });
    prisma.marca.update.mockResolvedValue({ id: 1, activo: true });
    const r = await service.reactivar(1);
    expect(prisma.marca.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { activo: true },
    });
    expect(r).toMatchObject({ id: 1, activo: true });
  });

  it('lanza NotFound al reactivar uno inexistente', async () => {
    prisma.marca.findUnique.mockResolvedValue(null);
    await expect(service.reactivar(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listar sin flag trae solo activos; con incluirInactivas trae todos', async () => {
    prisma.marca.findMany.mockResolvedValue([]);
    await service.listar();
    expect(prisma.marca.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { activo: true } }),
    );
    await service.listar(true);
    expect(prisma.marca.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});

describe('MarcaService · materiales propios de la marca', () => {
  const prisma = {
    marca: { findUnique: jest.fn() },
    material: { findMany: jest.fn() },
    reglaOverride: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  } as any;
  const service = new MarcaService(prisma);
  const MAT = (id: number, nombre: string, activo = true) => ({
    id, codigo: `M${id}`, nombreCanonico: nombre, activo,
  });
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.marca.findUnique.mockResolvedValue({ id: 5, nombre: 'ABRUZZO' });
  });

  it('lista las reglas globales REPLACE de la marca con nombres de material', async () => {
    prisma.reglaOverride.findMany.mockResolvedValue([
      {
        id: 9,
        materialObjetivo: MAT(10, 'MARQUILLA AGRO'),
        materialNuevo: MAT(11, 'MARQUILLA ABRUZZO'),
      },
    ]);
    const r = await service.listarMateriales(5);
    expect(prisma.reglaOverride.findMany.mock.calls[0][0].where).toEqual({
      marcaId: 5, referenciaId: null, accion: 'REPLACE',
    });
    expect(r).toEqual([
      {
        id: 9,
        materialObjetivo: { id: 10, codigo: 'M10', nombre: 'MARQUILLA AGRO' },
        materialNuevo: { id: 11, codigo: 'M11', nombre: 'MARQUILLA ABRUZZO' },
      },
    ]);
  });

  it('listar lanza NotFound si la marca no existe', async () => {
    prisma.marca.findUnique.mockResolvedValue(null);
    await expect(service.listarMateriales(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('agrega un reemplazo global: REPLACE, referenciaId null, heredaCurva true', async () => {
    prisma.material.findMany.mockResolvedValue([
      MAT(10, 'MARQUILLA AGRO'), MAT(11, 'MARQUILLA ABRUZZO'),
    ]);
    prisma.reglaOverride.findFirst.mockResolvedValue(null);
    prisma.reglaOverride.create.mockResolvedValue({
      id: 9, materialObjetivo: MAT(10, 'MARQUILLA AGRO'), materialNuevo: MAT(11, 'MARQUILLA ABRUZZO'),
    });
    const r = await service.agregarMaterial(5, { materialObjetivoId: 10, materialNuevoId: 11 });
    expect(prisma.reglaOverride.create.mock.calls[0][0].data).toEqual({
      accion: 'REPLACE',
      marcaId: 5,
      referenciaId: null,
      materialObjetivoId: 10,
      materialNuevoId: 11,
      heredaCurva: true,
    });
    expect(r).toMatchObject({ id: 9, materialNuevo: { nombre: 'MARQUILLA ABRUZZO' } });
  });

  it('rechaza el mismo material a ambos lados', async () => {
    await expect(
      service.agregarMaterial(5, { materialObjetivoId: 10, materialNuevoId: 10 }),
    ).rejects.toThrow(/distinto/i);
    expect(prisma.reglaOverride.create).not.toHaveBeenCalled();
  });

  it('rechaza materiales inexistentes o inactivos', async () => {
    prisma.material.findMany.mockResolvedValue([MAT(10, 'MARQUILLA AGRO'), MAT(11, 'X', false)]);
    await expect(
      service.agregarMaterial(5, { materialObjetivoId: 10, materialNuevoId: 11 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.material.findMany.mockResolvedValue([MAT(10, 'MARQUILLA AGRO')]);
    await expect(
      service.agregarMaterial(5, { materialObjetivoId: 10, materialNuevoId: 11 }),
    ).rejects.toThrow(/no existe|inactivo/i);
    expect(prisma.reglaOverride.create).not.toHaveBeenCalled();
  });

  it('rechaza duplicar el mismo material objetivo en la marca', async () => {
    prisma.material.findMany.mockResolvedValue([MAT(10, 'MARQUILLA AGRO'), MAT(12, 'OTRA')]);
    prisma.reglaOverride.findFirst.mockResolvedValue({
      id: 9, materialNuevo: MAT(11, 'MARQUILLA ABRUZZO'),
    });
    await expect(
      service.agregarMaterial(5, { materialObjetivoId: 10, materialNuevoId: 12 }),
    ).rejects.toThrow(/ya se reemplaza/i);
    expect(prisma.reglaOverride.findFirst.mock.calls[0][0].where).toEqual({
      marcaId: 5, referenciaId: null, materialObjetivoId: 10,
    });
  });

  it('agregar lanza NotFound si la marca no existe', async () => {
    prisma.marca.findUnique.mockResolvedValue(null);
    await expect(
      service.agregarMaterial(99, { materialObjetivoId: 10, materialNuevoId: 11 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('quita una regla global de la marca', async () => {
    prisma.reglaOverride.findFirst.mockResolvedValue({ id: 9 });
    prisma.reglaOverride.delete.mockResolvedValue({ id: 9 });
    await service.quitarMaterial(5, 9);
    expect(prisma.reglaOverride.findFirst.mock.calls[0][0].where).toEqual({
      id: 9, marcaId: 5, referenciaId: null,
    });
    expect(prisma.reglaOverride.delete).toHaveBeenCalledWith({ where: { id: 9 } });
  });

  it('quitar lanza NotFound si la regla no es global de esa marca', async () => {
    prisma.reglaOverride.findFirst.mockResolvedValue(null);
    await expect(service.quitarMaterial(5, 9)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.reglaOverride.delete).not.toHaveBeenCalled();
  });
});
