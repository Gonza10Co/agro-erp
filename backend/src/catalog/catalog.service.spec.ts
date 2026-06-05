import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  const prisma = {
    productoConfigurado: { findMany: jest.fn() },
    talla: { findMany: jest.fn() },
    referencia: { findMany: jest.fn(), findFirst: jest.fn() },
  } as any;
  const service = new CatalogService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('listarProductos pide activos con marca y rango de referencia', async () => {
    prisma.productoConfigurado.findMany.mockResolvedValue([{ id: 1 }]);
    const r = await service.listarProductos();
    expect(prisma.productoConfigurado.findMany).toHaveBeenCalledTimes(1);
    const arg = prisma.productoConfigurado.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ activo: true });
    expect(arg.select.marca).toBeDefined();
    expect(arg.select.referencia.select.tallaMin).toBeDefined();
    expect(arg.select.referencia.select.tallaMax).toBeDefined();
    expect(r).toEqual([{ id: 1 }]);
  });

  it('listarReferencias pide solo activas ordenadas por código', async () => {
    prisma.referencia.findMany.mockResolvedValue([{ id: 1, codigo: '101', nombreInterno: 'PODEROSA base' }]);
    const r = await service.listarReferencias();
    const arg = prisma.referencia.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ activo: true });
    expect(arg.orderBy).toEqual({ codigo: 'asc' });
    expect(arg.select).toEqual({ id: true, codigo: true, nombreInterno: true });
    expect(r).toEqual([{ id: 1, codigo: '101', nombreInterno: 'PODEROSA base' }]);
  });

  it('listarTallas devuelve las tallas ordenadas por orden', async () => {
    prisma.talla.findMany.mockResolvedValue([{ id: 1, valor: 38, orden: 1 }]);
    const r = await service.listarTallas();
    expect(prisma.talla.findMany).toHaveBeenCalledWith({ orderBy: { orden: 'asc' } });
    expect(r).toEqual([{ id: 1, valor: 38, orden: 1 }]);
  });

  it('configReferencia mapea marcas y ejes, y normaliza tallas', async () => {
    prisma.referencia.findFirst.mockResolvedValue({
      id: 1, codigo: '101', nombreInterno: 'PODEROSA base',
      tallaMin: { valor: 38 }, tallaMax: { valor: 46 },
      marcas: [{ marca: { id: 5, codigo: 'PODEROSA', nombre: 'Poderosa', tipo: 'PROPIA' } }],
      ejes: [
        { obligatorio: true, grupoOpcion: { id: 2, codigo: 'SUELA', nombre: 'Suela', orden: 2, opciones: [{ id: 9, codigo: 'RIVER', nombre: 'River Creek' }] } },
        { obligatorio: true, grupoOpcion: { id: 1, codigo: 'COLOR', nombre: 'Color', orden: 1, opciones: [{ id: 8, codigo: 'CAFE', nombre: 'Café' }] } },
      ],
    });
    const r = await service.configReferencia(1);
    expect(r.referencia).toEqual({ id: 1, codigo: '101', nombreInterno: 'PODEROSA base', tallaMin: 38, tallaMax: 46 });
    expect(r.marcas).toEqual([{ id: 5, codigo: 'PODEROSA', nombre: 'Poderosa', tipo: 'PROPIA' }]);
    expect(r.ejes.map((e) => e.grupo.codigo)).toEqual(['COLOR', 'SUELA']);
    expect(r.ejes[0]).toEqual({
      grupo: { id: 1, codigo: 'COLOR', nombre: 'Color', obligatorio: true },
      opciones: [{ id: 8, codigo: 'CAFE', nombre: 'Café' }],
    });
  });

  it('configReferencia lanza 404 si la referencia no existe', async () => {
    prisma.referencia.findFirst.mockResolvedValue(null);
    await expect(service.configReferencia(999)).rejects.toThrow('Referencia 999 no encontrada');
  });
});
