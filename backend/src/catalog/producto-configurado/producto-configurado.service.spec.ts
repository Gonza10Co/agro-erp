import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProductoConfiguradoService } from './producto-configurado.service';

const CONFIG = {
  referencia: { id: 1, codigo: '101', nombreInterno: 'PODEROSA' },
  marcas: [{ id: 5, codigo: 'PODEROSA', nombre: 'Poderosa', tipo: 'PROPIA' }],
  ejes: [
    { grupo: { id: 10, codigo: 'COLOR', nombre: 'Color', obligatorio: false },
      opciones: [{ id: 100, codigo: 'CAFE', nombre: 'Café' }] },
  ],
};

describe('ProductoConfiguradoService', () => {
  const prisma: any = {
    productoConfigurado: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    productoConfiguradoOpcion: { create: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  const catalog: any = { configReferencia: jest.fn() };
  const service = new ProductoConfiguradoService(prisma, catalog);

  beforeEach(() => {
    jest.clearAllMocks();
    catalog.configReferencia.mockResolvedValue(CONFIG);
    prisma.productoConfigurado.findUnique.mockResolvedValue(null);
    prisma.productoConfigurado.create.mockResolvedValue({ id: 50 });
  });

  it('crea el producto con código determinístico y sus opciones', async () => {
    await service.crear({ referenciaId: 1, marcaId: 5, opcionIds: [100] });
    expect(prisma.productoConfigurado.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ codigo: '101-PODEROSA-CAFE', referenciaId: 1, marcaId: 5 }),
      }),
    );
    expect(prisma.productoConfiguradoOpcion.create).toHaveBeenCalledWith({
      data: { productoConfiguradoId: 50, opcionId: 100 },
    });
  });

  it('rechaza una marca no habilitada (BadRequest)', async () => {
    await expect(
      service.crear({ referenciaId: 1, marcaId: 99, opcionIds: [100] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza si el producto ya existe (Conflict)', async () => {
    prisma.productoConfigurado.findUnique.mockResolvedValue({ id: 1, codigo: '101-PODEROSA-CAFE' });
    await expect(
      service.crear({ referenciaId: 1, marcaId: 5, opcionIds: [100] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  describe('obtenerOCrear', () => {
    const FULL = {
      id: 50, codigo: '101-PODEROSA-CAFE', nombreComercial: 'PODEROSA · Poderosa · Café',
      marca: { id: 5, nombre: 'Poderosa' },
      referencia: { id: 1, codigo: '101', tallaMin: { id: 1, valor: 36, orden: 1 }, tallaMax: { id: 9, valor: 44, orden: 9 } },
    };
    const DTO = { referenciaId: 1, marcaId: 5, opcionIds: [100] };
    // findUnique por código → { id, activo } | null ; por id → la forma completa del listado.
    function porCodigo(...resp: any[]) {
      const cola = [...resp];
      prisma.productoConfigurado.findUnique.mockImplementation(async (args: any) =>
        args.where.codigo ? cola.shift() ?? null : { ...FULL, id: args.where.id });
    }

    it('crea el producto si no existe y devuelve la forma del listado con creado=true', async () => {
      porCodigo(null);
      const r = await service.obtenerOCrear(DTO);
      expect(prisma.productoConfigurado.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ codigo: '101-PODEROSA-CAFE' }) }),
      );
      expect(prisma.productoConfiguradoOpcion.create).toHaveBeenCalledWith({
        data: { productoConfiguradoId: 50, opcionId: 100 },
      });
      expect(r).toEqual({ ...FULL, creado: true });
      // mismo select que el listado (marca + referencia con rango de tallas)
      expect(prisma.productoConfigurado.findUnique).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { id: 50 }, select: expect.objectContaining({ marca: expect.anything(), referencia: expect.anything() }) }),
      );
    });

    it('si ya existe activo lo devuelve sin crear ni tocar (creado=false)', async () => {
      porCodigo({ id: 77, activo: true });
      const r = await service.obtenerOCrear(DTO);
      expect(prisma.productoConfigurado.create).not.toHaveBeenCalled();
      expect(prisma.productoConfigurado.update).not.toHaveBeenCalled();
      expect(r).toEqual({ ...FULL, id: 77, creado: false });
    });

    it('si ya existe inactivo lo reactiva y lo devuelve', async () => {
      porCodigo({ id: 77, activo: false });
      const r = await service.obtenerOCrear(DTO);
      expect(prisma.productoConfigurado.update).toHaveBeenCalledWith({ where: { id: 77 }, data: { activo: true } });
      expect(prisma.productoConfigurado.create).not.toHaveBeenCalled();
      expect(r.creado).toBe(false);
    });

    it('carrera: si el create choca por unique (P2002) devuelve el que ganó', async () => {
      porCodigo(null, { id: 88, activo: true });
      prisma.productoConfigurado.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }));
      const r = await service.obtenerOCrear(DTO);
      expect(r).toEqual({ ...FULL, id: 88, creado: false });
    });

    it('otros errores del create se propagan', async () => {
      porCodigo(null);
      prisma.productoConfigurado.create.mockRejectedValueOnce(new Error('boom'));
      await expect(service.obtenerOCrear(DTO)).rejects.toThrow('boom');
    });

    it('configuración inválida → BadRequest, sin tocar la BD', async () => {
      await expect(
        service.obtenerOCrear({ referenciaId: 1, marcaId: 99, opcionIds: [100] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.productoConfigurado.findUnique).not.toHaveBeenCalled();
      expect(prisma.productoConfigurado.create).not.toHaveBeenCalled();
    });
  });
});
