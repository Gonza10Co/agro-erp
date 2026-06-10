import { IndicadoresService } from './indicadores.service';

function makePrisma(overrides: any = {}) {
  const prisma: any = {
    par: { findMany: jest.fn().mockResolvedValue([]) },
    umbralDemora: { findMany: jest.fn().mockResolvedValue([]) },
    ...overrides,
  };
  return prisma;
}

describe('IndicadoresService', () => {
  it('agrega tramos en etapas/operarios/maquinas', async () => {
    const prisma = makePrisma();
    prisma.par.findMany.mockResolvedValue([
      {
        codigo: 'P1',
        createdAt: new Date('2026-06-10T08:00:00Z'),
        celulaActual: 'GUARNICION',
        subPasoActual: 'AREA',
        estado: 'EN_PROCESO',
        eventos: [
          {
            celula: 'CORTE',
            subPaso: null,
            operarioId: 1,
            maquinaId: 1,
            timestamp: new Date('2026-06-10T08:20:00Z'),
            operario: { nombre: 'A' },
            maquina: { nombre: 'M1' },
          },
        ],
      },
    ]);

    const res = await new IndicadoresService(prisma).indicadores(
      new Date('2026-06-10T08:25:00Z'),
    );

    expect(res.etapas.length).toBeGreaterThan(0);
    expect(res.operarios[0]).toMatchObject({ nombre: 'A', tramos: 1 });
    expect(res.maquinas[0]).toMatchObject({ nombre: 'M1', tramos: 1 });
  });

  it('detecta alerta de demora con umbral por célula', async () => {
    const prisma = makePrisma();
    prisma.par.findMany.mockResolvedValue([
      {
        codigo: 'P2',
        createdAt: new Date('2026-06-10T06:00:00Z'),
        celulaActual: 'GUARNICION',
        subPasoActual: 'STROBEL',
        estado: 'EN_PROCESO',
        eventos: [
          {
            celula: 'GUARNICION',
            subPaso: 'REVISION',
            operarioId: 2,
            maquinaId: 2,
            timestamp: new Date('2026-06-10T09:00:00Z'),
            operario: { nombre: 'B' },
            maquina: { nombre: 'M2' },
          },
        ],
      },
    ]);
    prisma.umbralDemora.findMany.mockResolvedValue([
      { celula: 'GUARNICION', minutos: 30 },
    ]);

    // 180 min desde el último evento (09:00) hasta now (12:00) > umbral 30.
    const res = await new IndicadoresService(prisma).indicadores(
      new Date('2026-06-10T12:00:00Z'),
    );

    expect(res.alertas).toHaveLength(1);
    expect(res.alertas[0]).toMatchObject({
      codigo: 'P2',
      celula: 'GUARNICION',
      umbralMin: 30,
    });
  });

  it('usa createdAt como "desde" cuando el par no tiene eventos', async () => {
    const prisma = makePrisma();
    prisma.par.findMany.mockResolvedValue([
      {
        codigo: 'P3',
        createdAt: new Date('2026-06-10T10:00:00Z'),
        celulaActual: 'CORTE',
        subPasoActual: null,
        estado: 'EN_PROCESO',
        eventos: [],
      },
    ]);
    prisma.umbralDemora.findMany.mockResolvedValue([
      { celula: 'CORTE', minutos: 15 },
    ]);

    const res = await new IndicadoresService(prisma).indicadores(
      new Date('2026-06-10T11:00:00Z'),
    );

    expect(res.alertas).toHaveLength(1);
    expect(res.alertas[0]).toMatchObject({ codigo: 'P3', celula: 'CORTE' });
  });
});
