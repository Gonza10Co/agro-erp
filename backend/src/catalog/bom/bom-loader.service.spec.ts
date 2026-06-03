import { BomLoaderService } from './bom-loader.service';

// Prisma devuelve Decimal; en el test usamos números planos y stubbeamos toNumber via objeto.
const dec = (n: number) => ({ toNumber: () => n });

describe('BomLoaderService.cargarEntrada', () => {
  const prisma = {
    bom: { findFirst: jest.fn() },
    reglaOverride: { findMany: jest.fn() },
    material: { findMany: jest.fn() },
  } as any;

  const service = new BomLoaderService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('mapea el BOM base, overrides aplicables y materiales a EntradaResolucion', async () => {
    prisma.bom.findFirst.mockResolvedValue({
      id: 1,
      lineas: [
        {
          materialId: 10, claseConsumo: 'CURVA', consumoFijo: null, mermaPct: null,
          lineasTalla: [{ talla: { valor: 42 }, consumo: dec(0.107) }],
        },
        { materialId: 30, claseConsumo: 'FIJO', consumoFijo: dec(1), mermaPct: null, lineasTalla: [] },
      ],
    });
    prisma.reglaOverride.findMany.mockResolvedValue([
      {
        accion: 'ADD', opcionId: null, marcaId: 5, materialObjetivoId: null, materialNuevoId: 40,
        consumoFijo: dec(1), heredaCurva: false, tallas: [],
        marca: { id: 5 }, opcion: null,
      },
    ]);
    prisma.material.findMany.mockResolvedValue([
      { id: 10, origen: 'COMPRADO', bomPropio: null },
      { id: 30, origen: 'COMPRADO', bomPropio: null },
      {
        id: 40, origen: 'FABRICADO',
        bomPropio: { lineas: [{ materialId: 50, claseConsumo: 'FIJO', consumoFijo: dec(0.04), mermaPct: null, lineasTalla: [] }] },
      },
      { id: 50, origen: 'COMPRADO', bomPropio: null },
    ]);

    const entrada = await service.cargarEntrada({ referenciaId: 1, marcaId: 5, opcionIds: [], talla: 42 });

    expect(entrada.talla).toBe(42);
    expect(entrada.lineasBase).toHaveLength(2);
    expect(entrada.lineasBase[0]).toMatchObject({ materialId: 10, claseConsumo: 'CURVA', consumoPorTalla: { 42: 0.107 } });
    expect(entrada.overrides[0]).toMatchObject({ accion: 'ADD', materialNuevoId: 40, orden: 0 }); // marca → orden 0
    expect(entrada.materiales[40]).toMatchObject({ origen: 'FABRICADO' });
    expect(entrada.materiales[40].subBom[0]).toMatchObject({ materialId: 50, consumoFijo: 0.04 });
  });

  it('lanza NotFound si la referencia no tiene BOM activo', async () => {
    prisma.bom.findFirst.mockResolvedValue(null);
    await expect(
      service.cargarEntrada({ referenciaId: 999, marcaId: null, opcionIds: [], talla: 42 }),
    ).rejects.toThrow(/sin BOM/i);
  });
});
