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
          materialId: 10,
          claseConsumo: 'CURVA',
          consumoFijo: null,
          mermaPct: null,
          lineasTalla: [{ talla: { valor: 42 }, consumo: dec(0.107) }],
        },
        {
          materialId: 30,
          claseConsumo: 'FIJO',
          consumoFijo: dec(1),
          mermaPct: null,
          lineasTalla: [],
        },
      ],
    });
    prisma.reglaOverride.findMany.mockResolvedValue([
      {
        accion: 'ADD',
        opcionId: null,
        marcaId: 5,
        materialObjetivoId: null,
        materialNuevoId: 40,
        consumoFijo: dec(1),
        heredaCurva: false,
        tallas: [],
        marca: { id: 5 },
        opcion: null,
      },
    ]);
    const TODOS_MATERIALES: Record<number, any> = {
      10: { id: 10, origen: 'COMPRADO', bomsPropios: [] },
      30: { id: 30, origen: 'COMPRADO', bomsPropios: [] },
      40: {
        id: 40,
        origen: 'FABRICADO',
        bomsPropios: [
          {
            lineas: [
              {
                materialId: 50,
                claseConsumo: 'FIJO',
                consumoFijo: dec(0.04),
                mermaPct: null,
                lineasTalla: [],
              },
            ],
          },
        ],
      },
      50: { id: 50, origen: 'COMPRADO', bomsPropios: [] },
    };
    prisma.material.findMany.mockImplementation((args: any) =>
      Promise.resolve(
        args.where.id.in
          .map((id: number) => TODOS_MATERIALES[id])
          .filter(Boolean),
      ),
    );

    const entrada = await service.cargarEntrada({
      referenciaId: 1,
      marcaId: 5,
      opcionIds: [],
      talla: 42,
    });

    expect(entrada.talla).toBe(42);
    expect(entrada.lineasBase).toHaveLength(2);
    expect(entrada.lineasBase[0]).toMatchObject({
      materialId: 10,
      claseConsumo: 'CURVA',
      consumoPorTalla: { 42: 0.107 },
    });
    expect(entrada.overrides[0]).toMatchObject({
      accion: 'ADD',
      materialNuevoId: 40,
      orden: 0,
    }); // marca → orden 0
    expect(entrada.materiales[40]).toMatchObject({ origen: 'FABRICADO' });
    expect(entrada.materiales[40].subBom[0]).toMatchObject({
      materialId: 50,
      consumoFijo: 0.04,
    });
    // Verifica que el while loop iteró dos veces (carga multinivel genuina)
    expect(prisma.material.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.material.findMany.mock.calls[1][0].where.id.in).toContain(50);
  });

  it('calcula orden de override por opción según grupoOpcion.orden (orden = grupo.orden + 1)', async () => {
    prisma.bom.findFirst.mockResolvedValue({ id: 1, lineas: [] });
    prisma.reglaOverride.findMany.mockResolvedValue([
      {
        accion: 'ADD',
        opcionId: 7,
        marcaId: null,
        materialObjetivoId: null,
        materialNuevoId: 99,
        consumoFijo: null,
        heredaCurva: false,
        tallas: [],
        opcion: { grupoOpcion: { orden: 3 } },
        marca: null,
      },
    ]);
    prisma.material.findMany.mockResolvedValue([
      { id: 99, origen: 'COMPRADO', bomsPropios: [] },
    ]);

    const entrada = await service.cargarEntrada({
      referenciaId: 1,
      marcaId: null,
      opcionIds: [7],
      talla: 38,
    });

    expect(entrada.overrides[0]).toMatchObject({
      accion: 'ADD',
      materialNuevoId: 99,
      orden: 4,
    }); // 3 + 1
  });

  it('incluye las reglas GLOBALES de la marca (referenciaId NULL) en la consulta', async () => {
    prisma.bom.findFirst.mockResolvedValue({ id: 1, lineas: [] });
    prisma.reglaOverride.findMany.mockResolvedValue([]);
    prisma.material.findMany.mockResolvedValue([]);

    await service.cargarEntrada({ referenciaId: 3, marcaId: 5, opcionIds: [7], talla: 40 });

    const where = prisma.reglaOverride.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { referenciaId: 3, OR: [{ marcaId: 5 }, { opcionId: { in: [7] } }] },
      { referenciaId: null, marcaId: 5 },
    ]);
  });

  it('sin marca no busca reglas globales', async () => {
    prisma.bom.findFirst.mockResolvedValue({ id: 1, lineas: [] });
    prisma.reglaOverride.findMany.mockResolvedValue([]);
    prisma.material.findMany.mockResolvedValue([]);

    await service.cargarEntrada({ referenciaId: 3, marcaId: null, opcionIds: [7], talla: 40 });

    const where = prisma.reglaOverride.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ referenciaId: 3, OR: [{ opcionId: { in: [7] } }] }]);
  });

  it('la regla de marca de la referencia pisa a la global del mismo material objetivo', async () => {
    prisma.bom.findFirst.mockResolvedValue({ id: 1, lineas: [] });
    const regla = (referenciaId: number | null, nuevo: number) => ({
      accion: 'REPLACE', referenciaId, opcionId: null, marcaId: 5,
      materialObjetivoId: 10, materialNuevoId: nuevo, consumoFijo: null,
      heredaCurva: true, tallas: [], opcion: null,
    });
    prisma.reglaOverride.findMany.mockResolvedValue([regla(null, 11), regla(3, 12)]);
    prisma.material.findMany.mockResolvedValue([]);

    const entrada = await service.cargarEntrada({ referenciaId: 3, marcaId: 5, opcionIds: [], talla: 40 });

    expect(entrada.overrides).toHaveLength(1);
    expect(entrada.overrides[0]).toMatchObject({ materialNuevoId: 12, heredaCurva: true, orden: 0 });
  });

  it('trae en UNA consulta los hermanos de familia-talla y los marca en materiales', async () => {
    prisma.bom.findFirst.mockResolvedValue({
      id: 1,
      lineas: [
        {
          materialId: 10,
          claseConsumo: 'CURVA',
          consumoFijo: null,
          mermaPct: null,
          lineasTalla: [{ talla: { valor: 38 }, consumo: dec(1) }],
        },
      ],
    });
    prisma.reglaOverride.findMany.mockResolvedValue([]);
    const pu = (id: number, codigo: string, valor: number, activo = true) => ({
      id, codigo, origen: 'COMPRADO', activo, familiaTalla: 'PLANTILLA PU',
      talla: { valor }, bomsPropios: [],
    });
    prisma.material.findMany.mockImplementation((args: any) =>
      Promise.resolve(
        args.where.familiaTalla
          ? [pu(10, 'PPLA229', 40), pu(11, 'PPLA227', 38), pu(12, 'MRP-022', 38, false)]
          : [pu(10, 'PPLA229', 40)],
      ),
    );

    const entrada = await service.cargarEntrada({ referenciaId: 1, marcaId: null, opcionIds: [], talla: 38 });

    expect(prisma.material.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.material.findMany.mock.calls[1][0].where).toEqual({
      familiaTalla: { in: ['PLANTILLA PU'] },
    });
    expect(entrada.materiales[10].familiaTalla).toEqual({
      familia: 'PLANTILLA PU', tallaValor: 40, codigo: 'PPLA229', activo: true,
    });
    expect(entrada.materiales[11].familiaTalla).toMatchObject({ tallaValor: 38 });
    expect(entrada.materiales[12].familiaTalla).toMatchObject({ activo: false });
  });

  it('sin materiales con familia no hace la consulta de hermanos', async () => {
    prisma.bom.findFirst.mockResolvedValue({
      id: 1,
      lineas: [{ materialId: 10, claseConsumo: 'FIJO', consumoFijo: dec(1), mermaPct: null, lineasTalla: [] }],
    });
    prisma.reglaOverride.findMany.mockResolvedValue([]);
    prisma.material.findMany.mockResolvedValue([
      { id: 10, codigo: 'X', origen: 'COMPRADO', familiaTalla: null, talla: null, bomsPropios: [] },
    ]);

    const entrada = await service.cargarEntrada({ referenciaId: 1, marcaId: null, opcionIds: [], talla: 38 });

    expect(prisma.material.findMany).toHaveBeenCalledTimes(1);
    expect(entrada.materiales[10].familiaTalla).toBeUndefined();
  });

  it('lanza NotFound si la referencia no tiene BOM activo', async () => {
    prisma.bom.findFirst.mockResolvedValue(null);
    await expect(
      service.cargarEntrada({
        referenciaId: 999,
        marcaId: null,
        opcionIds: [],
        talla: 42,
      }),
    ).rejects.toThrow(/sin BOM/i);
  });
});
