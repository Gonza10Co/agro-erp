import { ConflictException, NotFoundException } from '@nestjs/common';
import { MaterialService } from './material.service';
import { OrigenMaterialDto, ClaseBomDto } from './dto/crear-material.dto';

describe('MaterialService', () => {
  const prisma = {
    material: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    categoriaMaterial: { findUnique: jest.fn(), findMany: jest.fn() },
    unidadMedida: { findUnique: jest.fn(), findMany: jest.fn() },
    materialAlias: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  } as any;
  const service = new MaterialService(prisma);
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.categoriaMaterial.findUnique.mockResolvedValue({ id: 1, nombre: 'FINIZAJE' });
    prisma.unidadMedida.findUnique.mockResolvedValue({ id: 2, codigo: 'M' });
  });

  const baseDto = {
    codigo: 'MAT-1',
    nombreCanonico: 'Cuero negro',
    categoriaId: 1,
    unidadMedidaId: 2,
    origen: OrigenMaterialDto.COMPRADO,
    claseBom: ClaseBomDto.DIRECTO_FIJO,
  };

  it('crea un material con los datos provistos', async () => {
    prisma.material.findUnique.mockResolvedValue(null);
    prisma.material.create.mockResolvedValue({ id: 1, ...baseDto });
    const r = await service.crear(baseDto);
    expect(prisma.material.create).toHaveBeenCalledWith({
      data: {
        codigo: 'MAT-1',
        nombreCanonico: 'Cuero negro',
        categoriaId: 1,
        unidadMedidaId: 2,
        origen: OrigenMaterialDto.COMPRADO,
        claseBom: ClaseBomDto.DIRECTO_FIJO,
        proveedorId: undefined,
      },
    });
    expect(r).toMatchObject({ id: 1, codigo: 'MAT-1' });
  });

  // Caso real (2026-09-28): el formulario pedía el id a mano, se escribió 0 y
  // la llave foránea reventaba como 500 "Internal server error".
  it('categoría o unidad inexistente es 400 con mensaje claro, no 500', async () => {
    prisma.material.findUnique.mockResolvedValue(null);
    prisma.categoriaMaterial.findUnique.mockResolvedValue(null);
    await expect(service.crear({ ...baseDto, categoriaId: 0 })).rejects.toThrow('La categoría elegida no existe');
    prisma.categoriaMaterial.findUnique.mockResolvedValue({ id: 1 });
    prisma.unidadMedida.findUnique.mockResolvedValue(null);
    await expect(service.crear(baseDto)).rejects.toThrow('La unidad de medida elegida no existe');
    expect(prisma.material.create).not.toHaveBeenCalled();
  });

  it('lista categorías y unidades para el formulario', async () => {
    prisma.categoriaMaterial.findMany.mockResolvedValue([{ id: 5, nombre: 'FINIZAJE' }]);
    prisma.unidadMedida.findMany.mockResolvedValue([{ id: 2, codigo: 'M', nombre: 'Metro' }]);
    expect(await service.categorias()).toEqual([{ id: 5, nombre: 'FINIZAJE' }]);
    expect(await service.unidades()).toEqual([{ id: 2, codigo: 'M', nombre: 'Metro' }]);
  });

  it('rechaza código duplicado', async () => {
    prisma.material.findUnique.mockResolvedValue({ id: 1, codigo: 'MAT-1' });
    await expect(service.crear(baseDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('lista con el shape {id,codigo,nombreCanonico,origen,unidad}', async () => {
    prisma.material.findMany.mockResolvedValue([
      {
        id: 1,
        codigo: 'MAT-1',
        nombreCanonico: 'Cuero negro',
        origen: 'COMPRADO',
        unidadMedida: { codigo: 'M2' },
      },
    ]);
    const r = await service.listar();
    expect(r).toEqual([
      {
        id: 1,
        codigo: 'MAT-1',
        nombreCanonico: 'Cuero negro',
        origen: 'COMPRADO',
        unidad: 'M2',
      },
    ]);
  });

  it('actualiza un material existente', async () => {
    prisma.material.findUnique.mockResolvedValue({ id: 1 });
    prisma.material.update.mockResolvedValue({ id: 1, nombreCanonico: 'X' });
    const r = await service.actualizar(1, { nombreCanonico: 'X' });
    expect(prisma.material.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ nombreCanonico: 'X' }),
    });
    expect(r).toMatchObject({ id: 1 });
  });

  it('lanza NotFound al actualizar material inexistente', async () => {
    prisma.material.findUnique.mockResolvedValue(null);
    await expect(
      service.actualizar(99, { nombreCanonico: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('desactiva un material existente', async () => {
    prisma.material.findUnique.mockResolvedValue({ id: 1 });
    prisma.material.update.mockResolvedValue({ id: 1, activo: false });
    await service.desactivar(1);
    expect(prisma.material.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { activo: false },
    });
  });

  it('agrega un alias a un material existente', async () => {
    prisma.material.findUnique.mockResolvedValue({ id: 1 });
    prisma.materialAlias.findUnique.mockResolvedValue(null);
    prisma.materialAlias.create.mockResolvedValue({
      id: 10,
      materialId: 1,
      textoLegacy: 'CUERO NEG',
    });
    const r = await service.agregarAlias(1, { textoLegacy: 'CUERO NEG' });
    expect(prisma.materialAlias.create).toHaveBeenCalledWith({
      data: { materialId: 1, textoLegacy: 'CUERO NEG' },
    });
    expect(r).toMatchObject({ id: 10 });
  });

  it('rechaza alias duplicado', async () => {
    prisma.material.findUnique.mockResolvedValue({ id: 1 });
    prisma.materialAlias.findUnique.mockResolvedValue({
      id: 10,
      materialId: 1,
      textoLegacy: 'CUERO NEG',
    });
    await expect(
      service.agregarAlias(1, { textoLegacy: 'CUERO NEG' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // Reactivar deshace un desactivar accidental (activo:true).
  it('reactiva (activo:true)', async () => {
    prisma.material.findUnique.mockResolvedValue({ id: 1, activo: false });
    prisma.material.update.mockResolvedValue({ id: 1, activo: true });
    const r = await service.reactivar(1);
    expect(prisma.material.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { activo: true },
    });
    expect(r).toMatchObject({ id: 1, activo: true });
  });

  it('lanza NotFound al reactivar uno inexistente', async () => {
    prisma.material.findUnique.mockResolvedValue(null);
    await expect(service.reactivar(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listar sin flag trae solo activos; con incluirInactivas trae todos', async () => {
    prisma.material.findMany.mockResolvedValue([]);
    await service.listar();
    expect(prisma.material.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { activo: true } }),
    );
    await service.listar(true);
    expect(prisma.material.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('listar expone `activo` para que la pantalla atenúe los inactivos', async () => {
    prisma.material.findMany.mockResolvedValue([
      { id: 2, codigo: 'MAT-2', nombreCanonico: 'Hilo', origen: 'COMPRADO', activo: false, unidadMedida: null },
    ]);
    const r = await service.listar(true);
    expect(r[0]).toMatchObject({ id: 2, activo: false, unidad: '' });
  });
});
