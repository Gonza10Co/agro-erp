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
});
