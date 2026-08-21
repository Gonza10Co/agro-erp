import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CorteService } from './corte.service';

const ordenBase = {
  id: 1,
  codigo: 'AGR-861',
  fecha: new Date('2026-08-01T00:00:00Z'),
  estado: 'PROGRAMADA',
  lineas: [
    { id: 10, cantProgramada: 600, cantCortada: 0, cantAmarrada: 0 },
    { id: 11, cantProgramada: 606, cantCortada: 0, cantAmarrada: 0 },
  ],
  avances: [],
};

function makePrisma(overrides: any = {}) {
  const tx = {
    ordenCorte: { update: jest.fn().mockResolvedValue({ id: 1 }) },
    ordenCorteLinea: { update: jest.fn().mockResolvedValue({}) },
    ...overrides.tx,
  };
  const prisma: any = {
    ordenCorte: {
      findUnique: jest.fn().mockResolvedValue(ordenBase),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 1, codigo: 'AGR-861' }),
    },
    avanceCorte: { create: jest.fn().mockResolvedValue({ id: 5 }) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
    ...overrides.root,
  };
  return { prisma, tx, service: new CorteService(prisma) };
}

describe('crear orden de corte', () => {
  const dto = {
    codigo: 'AGR-861',
    fecha: '2026-08-01',
    lineaId: 1,
    lineas: [{ productoConfiguradoId: 5, tallaId: 3, cantProgramada: 600 }],
  } as any;

  it('rechaza un código repetido: el número va escrito en la canasta', async () => {
    const { service } = makePrisma();
    await expect(service.crear(dto)).rejects.toThrow(ConflictException);
  });

  it('crea la orden con sus líneas cuando el código es nuevo', async () => {
    const { service, prisma } = makePrisma({
      root: { ordenCorte: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 1 }) } },
    });
    await service.crear(dto);
    const arg = prisma.ordenCorte.create.mock.calls[0][0];
    expect(arg.data.codigo).toBe('AGR-861');
    expect(arg.data.lineas.create).toHaveLength(1);
  });

  it('ancla la fecha al día programado: no se corre por zona horaria', async () => {
    const { service, prisma } = makePrisma({
      root: { ordenCorte: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 1 }) } },
    });
    await service.crear(dto);
    const fecha: Date = prisma.ordenCorte.create.mock.calls[0][0].data.fecha;
    expect(fecha.toISOString().slice(0, 10)).toBe('2026-08-01');
  });

  it('rechaza la misma referencia y talla repetida', async () => {
    const { service } = makePrisma({
      root: { ordenCorte: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() } },
    });
    await expect(
      service.crear({
        ...dto,
        lineas: [
          { productoConfiguradoId: 5, tallaId: 3, cantProgramada: 600 },
          { productoConfiguradoId: 5, tallaId: 3, cantProgramada: 100 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('avanzar la orden', () => {
  it('sella la fecha del toque al entrar al estado', async () => {
    const { service, tx } = makePrisma();
    await service.avanzar(1, { estado: 'EN_CORTE' } as any);
    const data = tx.ordenCorte.update.mock.calls[0][0].data;
    expect(data.estado).toBe('EN_CORTE');
    expect(data.inicioCorte).toBeInstanceOf(Date);
  });

  it('no deja devolver una orden ya entregada', async () => {
    const { service } = makePrisma({
      root: { ordenCorte: { findUnique: jest.fn().mockResolvedValue({ ...ordenBase, estado: 'ENTREGADA' }) } },
    });
    await expect(service.avanzar(1, { estado: 'EN_CORTE' } as any)).rejects.toThrow(ConflictException);
  });

  it('exige las cantidades cortadas al entregar: sin eso no hay cumplimiento', async () => {
    const { service } = makePrisma({
      root: { ordenCorte: { findUnique: jest.fn().mockResolvedValue({ ...ordenBase, estado: 'EN_CORTE' }) } },
    });
    await expect(service.avanzar(1, { estado: 'ENTREGADA' } as any)).rejects.toThrow(BadRequestException);
  });

  it('graba lo realmente cortado por línea al entregar', async () => {
    const { service, tx } = makePrisma({
      root: { ordenCorte: { findUnique: jest.fn().mockResolvedValue({ ...ordenBase, estado: 'EN_CORTE' }) } },
    });
    await service.avanzar(1, { estado: 'ENTREGADA', cantidades: { 10: 580, 11: 606 } } as any);
    expect(tx.ordenCorteLinea.update).toHaveBeenCalledTimes(2);
    expect(tx.ordenCorteLinea.update.mock.calls[0][0].data.cantCortada).toBe(580);
  });

  it('rechaza cantidades de una línea que no es de esta orden', async () => {
    const { service } = makePrisma({
      root: { ordenCorte: { findUnique: jest.fn().mockResolvedValue({ ...ordenBase, estado: 'EN_CORTE' }) } },
    });
    await expect(
      service.avanzar(1, { estado: 'ENTREGADA', cantidades: { 999: 10 } } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('revienta si la orden no existe', async () => {
    const { service } = makePrisma({ root: { ordenCorte: { findUnique: jest.fn().mockResolvedValue(null) } } });
    await expect(service.avanzar(9, { estado: 'EN_CORTE' } as any)).rejects.toThrow(NotFoundException);
  });
});

describe('registrar avance diario', () => {
  it('guarda las piezas repuestas — el indicador de Gabriel', async () => {
    const { service, prisma } = makePrisma();
    await service.registrarAvance(1, { piezasCortadas: 14000, piezasRepuestas: 120 } as any);
    expect(prisma.avanceCorte.create.mock.calls[0][0].data.piezasRepuestas).toBe(120);
  });

  it('guarda el consumo teórico contra el real', async () => {
    const { service, prisma } = makePrisma();
    await service.registrarAvance(1, {
      piezasCortadas: 100,
      consumos: [{ materialId: 3, cantTeorica: 10.5, cantReal: 11.2 }],
    } as any);
    const data = prisma.avanceCorte.create.mock.calls[0][0].data;
    expect(data.consumos.create[0]).toMatchObject({ materialId: 3, cantTeorica: 10.5, cantReal: 11.2 });
  });

  it('no acepta reponer más piezas de las cortadas', async () => {
    const { service } = makePrisma();
    await expect(
      service.registrarAvance(1, { piezasCortadas: 100, piezasRepuestas: 150 } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('una orden anulada no admite avances', async () => {
    const { service } = makePrisma({
      root: { ordenCorte: { findUnique: jest.fn().mockResolvedValue({ ...ordenBase, estado: 'ANULADA' }) } },
    });
    await expect(service.registrarAvance(1, { piezasCortadas: 10 } as any)).rejects.toThrow(ConflictException);
  });

  it('sin consumos no manda un create vacío a Prisma', async () => {
    const { service, prisma } = makePrisma();
    await service.registrarAvance(1, { piezasCortadas: 10 } as any);
    expect(prisma.avanceCorte.create.mock.calls[0][0].data.consumos).toBeUndefined();
  });
});

describe('tablero', () => {
  const conDatos = [
    {
      id: 1, codigo: 'AGR-861', fecha: new Date(), estado: 'ENTREGADA', linea: null, marca: null,
      lineas: [{ cantProgramada: 1000, cantCortada: 950, cantAmarrada: 900 }],
      avances: [{ piezasCortadas: 24000, piezasDanadas: 100, piezasRepuestas: 200 }],
    },
    {
      id: 2, codigo: 'AGR-862', fecha: new Date(), estado: 'EN_CORTE', linea: null, marca: null,
      lineas: [{ cantProgramada: 500, cantCortada: 500, cantAmarrada: 480 }],
      avances: [{ piezasCortadas: 12000, piezasDanadas: 0, piezasRepuestas: 50 }],
    },
  ];

  it('agrega los totales de todas las órdenes del período', async () => {
    const { service } = makePrisma({ root: { ordenCorte: { findMany: jest.fn().mockResolvedValue(conDatos) } } });
    const { resumen } = await service.tablero({});
    expect(resumen.programado).toBe(1500);
    expect(resumen.cortado).toBe(1450);
    expect(resumen.cantOrdenes).toBe(2);
  });

  it('calcula el cumplimiento y la reposición del período completo', async () => {
    const { service } = makePrisma({ root: { ordenCorte: { findMany: jest.fn().mockResolvedValue(conDatos) } } });
    const { resumen } = await service.tablero({});
    expect(resumen.cumplimiento).toBeCloseTo(1450 / 1500, 5);
    expect(resumen.indiceReposicion).toBeCloseTo(250 / 36000, 6);
  });

  it('cuenta cuántas órdenes traen alerta', async () => {
    const { service } = makePrisma({ root: { ordenCorte: { findMany: jest.fn().mockResolvedValue(conDatos) } } });
    const { resumen } = await service.tablero({});
    expect(resumen.conAlertas).toBe(1); // la 861 se desvió 5% y repuso de más
  });

  it('un período sin órdenes no divide por cero', async () => {
    const { service } = makePrisma({ root: { ordenCorte: { findMany: jest.fn().mockResolvedValue([]) } } });
    const { resumen } = await service.tablero({});
    expect(resumen.cumplimiento).toBeNull();
    expect(resumen.cantOrdenes).toBe(0);
  });

  it('filtra por línea y por rango de fechas', async () => {
    const { service, prisma } = makePrisma({ root: { ordenCorte: { findMany: jest.fn().mockResolvedValue([]) } } });
    await service.tablero({ lineaId: 4, desde: '2026-08-01', hasta: '2026-08-31' });
    const where = prisma.ordenCorte.findMany.mock.calls[0][0].where;
    expect(where.lineaId).toBe(4);
    expect(where.fecha.gte).toEqual(new Date('2026-08-01'));
  });
});

describe('obtener detalle', () => {
  it('devuelve la orden con indicadores y alertas calculados', async () => {
    const { service } = makePrisma({
      root: {
        ordenCorte: {
          findUnique: jest.fn().mockResolvedValue({
            ...ordenBase,
            lineas: [{ id: 10, cantProgramada: 1000, cantCortada: 1000, cantAmarrada: 1000 }],
            avances: [{ piezasCortadas: 1000, piezasDanadas: 0, piezasRepuestas: 10 }],
          }),
        },
      },
    });
    const o: any = await service.obtener(1);
    expect(o.indicadores.cumplimiento).toBe(1);
    expect(o.alertas).toEqual([]);
  });

  it('revienta si no existe', async () => {
    const { service } = makePrisma({ root: { ordenCorte: { findUnique: jest.fn().mockResolvedValue(null) } } });
    await expect(service.obtener(99)).rejects.toThrow(NotFoundException);
  });

  it('consolida el consumo de material de todos los avances', async () => {
    const { service } = makePrisma({
      root: {
        ordenCorte: {
          findUnique: jest.fn().mockResolvedValue({
            ...ordenBase,
            avances: [
              { piezasCortadas: 100, piezasDanadas: 0, piezasRepuestas: 0,
                consumos: [{ material: { id: 3, codigo: 'MP-001', nombreCanonico: 'Micropiel' }, cantTeorica: '10', cantReal: '12' }] },
              { piezasCortadas: 100, piezasDanadas: 0, piezasRepuestas: 0,
                consumos: [{ material: { id: 3, codigo: 'MP-001', nombreCanonico: 'Micropiel' }, cantTeorica: '10', cantReal: '10' }] },
            ],
          }),
        },
      },
    });
    const o: any = await service.obtener(1);
    expect(o.consumos).toHaveLength(1);
    expect(o.consumos[0].cantReal).toBe(22);
    expect(o.consumos[0].desviacion).toBeCloseTo(0.1, 5);
  });

  it('dice cuál es el siguiente estado, para que la UI sepa qué botón ofrecer', async () => {
    const { service } = makePrisma();
    const o: any = await service.obtener(1);
    expect(o.siguienteEstado).toBe('EN_CORTE');
  });
});
