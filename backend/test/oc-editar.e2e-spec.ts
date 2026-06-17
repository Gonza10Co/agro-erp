import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

jest.setTimeout(30000);

// Fase 6 — editar una OC en BORRADOR (cambiar cantidades) y que una OC
// CONFIRMADA ya no se pueda editar. Usa un producto propio (no compartido con
// otros e2e) para no competir por el mismo recurso.
describe('Editar OC en BORRADOR (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let clienteId = 0;
  let productoId = 0;
  let tallaId = 0;
  const NIT = 'E2E-OC-EDIT';
  const COD_PROD = 'E2E-OC-PROD';
  const creadas: number[] = [];

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function limpiar() {
    const prod = await prisma.productoConfigurado.findUnique({ where: { codigo: COD_PROD } });
    if (prod) {
      await prisma.ordenCompraLineaTalla.deleteMany({ where: { ocLinea: { productoConfiguradoId: prod.id } } });
      await prisma.ordenCompraLinea.deleteMany({ where: { productoConfiguradoId: prod.id } });
    }
    await prisma.ordenCompra.deleteMany({ where: { cliente: { nit: NIT } } });
    if (prod) await prisma.productoConfigurado.delete({ where: { id: prod.id } });
    await prisma.cliente.deleteMany({ where: { nit: NIT } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const login = await request(app.getHttpServer())
      .post('/auth/login').send({ username: 'admin', password: 'admin123' }).expect(201);
    token = login.body.accessToken;

    await limpiar();
    const cli = await prisma.cliente.create({ data: { nit: NIT, nombre: 'Cliente OC edit' } });
    clienteId = cli.id;

    // Producto propio (vía Prisma) sobre la ref 101 + una marca del seed.
    const ref = await prisma.referencia.findFirstOrThrow({ where: { codigo: '101' } });
    const marca = await prisma.marca.findFirstOrThrow({ where: { activo: true } });
    const prod = await prisma.productoConfigurado.create({
      data: { codigo: COD_PROD, nombreComercial: 'Producto E2E OC', referenciaId: ref.id, marcaId: marca.id },
    });
    productoId = prod.id;
    tallaId = (await prisma.talla.findFirstOrThrow({ where: { valor: 40 } })).id;
  });

  afterAll(async () => {
    await limpiar();
    await app.close();
  });

  const crearOC = (cantidad: number) =>
    request(app.getHttpServer()).post('/pedidos/oc').set(auth()).send({
      clienteId,
      lineas: [{ productoConfiguradoId: productoId, tallas: [{ tallaId, cantidad }] }],
    });

  it('edita las cantidades de una OC en BORRADOR', async () => {
    const oc = await crearOC(10).expect(201);
    creadas.push(oc.body.id);

    await request(app.getHttpServer())
      .patch(`/pedidos/oc/${oc.body.id}`).set(auth())
      .send({ clienteId, observaciones: 'ajustada', lineas: [{ productoConfiguradoId: productoId, tallas: [{ tallaId, cantidad: 25 }] }] })
      .expect(200);

    const detalle = await request(app.getHttpServer())
      .get(`/pedidos/oc/${oc.body.id}`).set(auth()).expect(200);
    expect(detalle.body.observaciones).toBe('ajustada');
    expect(detalle.body.lineas[0].tallas[0].cantidad).toBe(25);
  });

  it('no permite editar una OC ya CONFIRMADA (400)', async () => {
    const oc = await crearOC(10).expect(201);
    creadas.push(oc.body.id);
    await request(app.getHttpServer()).post(`/pedidos/oc/${oc.body.id}/confirmar`).set(auth()).expect(201);

    await request(app.getHttpServer())
      .patch(`/pedidos/oc/${oc.body.id}`).set(auth())
      .send({ clienteId, lineas: [{ productoConfiguradoId: productoId, tallas: [{ tallaId, cantidad: 99 }] }] })
      .expect(400);
  });
});
