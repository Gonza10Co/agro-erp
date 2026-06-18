import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

jest.setTimeout(30000);

// Fase 0 — verifica que la gestión comercial (crear cliente) está cerrada al rol
// CLIENTE y abierta a roles internos (ADMIN/GERENTE). El gating de UI no basta:
// el guard tiene que vivir en el backend.
describe('Clientes — seguridad por rol (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const NIT_TEST = 'E2E-ROLES-9999';

  const login = async (username: string, password: string) => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password })
      .expect(201);
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.cliente.deleteMany({ where: { nit: NIT_TEST } });
  });

  afterAll(async () => {
    await prisma.cliente.deleteMany({ where: { nit: NIT_TEST } });
    await app.close();
  });

  it('niega a un CLIENTE crear un cliente (403)', async () => {
    const token = await login('cliente', 'botas2026');
    await request(app.getHttpServer())
      .post('/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nit: NIT_TEST, nombre: 'No debería crearse' })
      .expect(403);
  });

  it('permite a un ADMIN crear un cliente (201)', async () => {
    const token = await login('admin', 'admin123');
    const res = await request(app.getHttpServer())
      .post('/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nit: NIT_TEST, nombre: 'Cliente de prueba E2E' })
      .expect(201);
    expect(res.body).toMatchObject({ nit: NIT_TEST });
  });
});
