import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

jest.setTimeout(30000);

// Fase 1 — verifica el versionado de BOM de punta a punta contra la DB real:
//  - crear v2 desactiva v1 y el resolver pasa a tomar v2
//  - el índice único parcial impide dos BOMs activos para la misma referencia
describe('BOM versionado (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let referenciaId: number;
  let suelaId: number;
  const COD_REF = 'E2E-BOMVER';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(201);
    token = login.body.accessToken;

    // Reusar talla y material del seed; crear una referencia de prueba aislada.
    const talla = await prisma.talla.findFirstOrThrow({ where: { valor: 38 } });
    const suela = await prisma.material.findFirstOrThrow({ where: { codigo: 'SUELA-BASE' } });
    suelaId = suela.id;
    await limpiar();
    const ref = await prisma.referencia.create({
      data: {
        codigo: COD_REF,
        nombreInterno: 'Referencia E2E versionado',
        tallaMinId: talla.id,
        tallaMaxId: talla.id,
      },
    });
    referenciaId = ref.id;
  });

  async function limpiar() {
    const ref = await prisma.referencia.findUnique({ where: { codigo: COD_REF } });
    if (!ref) return;
    await prisma.bomLineaTalla.deleteMany({ where: { bomLinea: { bom: { referenciaId: ref.id } } } });
    await prisma.bomLinea.deleteMany({ where: { bom: { referenciaId: ref.id } } });
    await prisma.bom.deleteMany({ where: { referenciaId: ref.id } });
    await prisma.referencia.delete({ where: { id: ref.id } });
  }

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  const crearVersion = (consumoSuela: number) =>
    request(app.getHttpServer())
      .post('/catalog/bom/version')
      .set('Authorization', `Bearer ${token}`)
      .send({
        referenciaId,
        lineas: [
          { materialId: suelaId, claseConsumo: 'FIJO', consumoFijo: consumoSuela },
        ],
      });

  it('crea la v1 y el resolver la usa (suela = 1)', async () => {
    await crearVersion(1).expect(201);
    const res = await request(app.getHttpServer())
      .get('/catalog/bom/resolve')
      .query({ referenciaId, talla: 38 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const suela = res.body.comprados.find((c: any) => c.materialId === suelaId);
    expect(Number(suela.consumo)).toBe(1);
  });

  it('crea la v2, desactiva la v1 y el resolver pasa a la v2 (suela = 2)', async () => {
    await crearVersion(2).expect(201);

    const versiones = await request(app.getHttpServer())
      .get(`/catalog/bom/${referenciaId}/versiones`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(versiones.body).toHaveLength(2);
    const activas = versiones.body.filter((b: any) => b.activo);
    expect(activas).toHaveLength(1);
    expect(activas[0].version).toBe(2);

    const res = await request(app.getHttpServer())
      .get('/catalog/bom/resolve')
      .query({ referenciaId, talla: 38 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const suela = res.body.comprados.find((c: any) => c.materialId === suelaId);
    expect(Number(suela.consumo)).toBe(2);
  });

  it('el índice único parcial impide dos BOMs activos para la misma referencia', async () => {
    await expect(
      prisma.bom.create({ data: { referenciaId, version: 99, activo: true } }),
    ).rejects.toThrow();
  });
});
