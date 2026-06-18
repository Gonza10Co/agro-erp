import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

jest.setTimeout(30000);

// Fase 4 — crear un ProductoConfigurado real sobre la referencia 101 del seed y
// verificar que queda disponible para el wizard de OC (GET /catalog/productos).
describe('ProductoConfigurado (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let referenciaId = 0;
  let marcaId = 0;
  let opcionIds: number[] = [];
  let codigoCreado = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const login = await request(app.getHttpServer())
      .post('/auth/login').send({ username: 'admin', password: 'admin123' }).expect(201);
    token = login.body.accessToken;

    const ref = await prisma.referencia.findUniqueOrThrow({ where: { codigo: '101' } });
    referenciaId = ref.id;
    const cfg = await request(app.getHttpServer())
      .get(`/catalog/referencias/${referenciaId}/config`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    marcaId = cfg.body.marcas[0].id;
    // Cubrir todos los ejes obligatorios con su primera opción.
    opcionIds = cfg.body.ejes
      .filter((e: any) => e.grupo.obligatorio)
      .map((e: any) => e.opciones[0].id);
  });

  afterAll(async () => {
    if (codigoCreado) {
      const p = await prisma.productoConfigurado.findUnique({ where: { codigo: codigoCreado } });
      if (p) {
        await prisma.productoConfiguradoOpcion.deleteMany({ where: { productoConfiguradoId: p.id } });
        await prisma.productoConfigurado.delete({ where: { id: p.id } });
      }
    }
    await app.close();
  });

  it('crea un producto válido y aparece en GET /catalog/productos', async () => {
    const res = await request(app.getHttpServer())
      .post('/catalog/productos')
      .set('Authorization', `Bearer ${token}`)
      .send({ referenciaId, marcaId, opcionIds })
      .expect(201);
    codigoCreado = res.body.codigo;
    expect(codigoCreado).toContain('101');

    const productos = await request(app.getHttpServer())
      .get('/catalog/productos').set('Authorization', `Bearer ${token}`).expect(200);
    expect(productos.body.some((p: any) => p.codigo === codigoCreado)).toBe(true);
  });

  it('rechaza recrear el mismo producto (409)', async () => {
    await request(app.getHttpServer())
      .post('/catalog/productos')
      .set('Authorization', `Bearer ${token}`)
      .send({ referenciaId, marcaId, opcionIds })
      .expect(409);
  });

  it('un CLIENTE no puede crear productos (403)', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login').send({ username: 'cliente', password: 'botas2026' }).expect(201);
    await request(app.getHttpServer())
      .post('/catalog/productos')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ referenciaId, marcaId, opcionIds })
      .expect(403);
  });
});
