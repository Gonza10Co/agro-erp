import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

jest.setTimeout(60000);

// Devolver a borrador una OC confirmada: suelta el amarre de PT y de insumos sin
// dejar reservas fantasma, y el pedido se edita y se reconfirma con una OP nueva.
describe('Devolver OC a borrador (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let adminId = 0;
  let clienteId = 0;
  let productoId = 0;
  let tallaId = 0;
  let invId = 0;
  const NIT = 'E2E-OC-UNCONFIRM';
  const COD_PROD = 'E2E-OC-UNCONF-PROD';
  const auth = () => ({ Authorization: `Bearer ${token}` });

  const materialReservado = async () =>
    new Map((await prisma.inventarioMaterial.findMany()).map((m) => [m.materialId, Number(m.cantReservada)]));

  async function borrarOp(opId: number) {
    const reqs = await prisma.requerimientoCompra.findMany({ where: { opId } });
    await prisma.requerimientoCompraLinea.deleteMany({ where: { requerimientoId: { in: reqs.map((r) => r.id) } } });
    await prisma.requerimientoCompra.deleteMany({ where: { opId } });
    const ofs = await prisma.ordenFabricacion.findMany({ where: { opId } });
    await prisma.etiquetaReservada.deleteMany({ where: { ofId: { in: ofs.map((o) => o.id) } } });
    await prisma.ordenFabricacion.deleteMany({ where: { opId } });
    await prisma.reservaInventarioPT.deleteMany({ where: { opLineaTalla: { opLinea: { opId } } } });
    await prisma.ordenProduccionLineaTalla.deleteMany({ where: { opLinea: { opId } } });
    await prisma.ordenProduccionLinea.deleteMany({ where: { opId } });
    await prisma.ordenProduccion.delete({ where: { id: opId } });
  }

  async function limpiar() {
    const ops = await prisma.ordenProduccion.findMany({ where: { oc: { cliente: { nit: NIT } } } });
    for (const op of ops) {
      // Lo que quede reservado vuelve antes de borrar (no dejar basura en la base).
      await request(app.getHttpServer()).post(`/pedidos/op/${op.id}/anular`).set(auth());
      await borrarOp(op.id);
    }
    const prod = await prisma.productoConfigurado.findUnique({ where: { codigo: COD_PROD } });
    if (prod) {
      await prisma.ordenCompraLineaTalla.deleteMany({ where: { ocLinea: { productoConfiguradoId: prod.id } } });
      await prisma.ordenCompraLinea.deleteMany({ where: { productoConfiguradoId: prod.id } });
      await prisma.inventarioPT.deleteMany({ where: { productoConfiguradoId: prod.id } });
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
    adminId = (await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } })).id;

    await limpiar();
    clienteId = (await prisma.cliente.create({ data: { nit: NIT, nombre: 'Cliente OC unconfirm' } })).id;
    const ref = await prisma.referencia.findFirstOrThrow({ where: { codigo: '101' } });
    const marca = await prisma.marca.findFirstOrThrow({ where: { activo: true } });
    productoId = (await prisma.productoConfigurado.create({
      data: { codigo: COD_PROD, nombreComercial: 'Producto E2E unconfirm', referenciaId: ref.id, marcaId: marca.id },
    })).id;
    tallaId = (await prisma.talla.findFirstOrThrow({ where: { valor: 40 } })).id;
    const bodega = await prisma.bodega.findFirstOrThrow({ orderBy: { prioridad: 'asc' } });
    // 5 pares libres en bodega: el pedido amarra 5 y manda el resto a producir.
    invId = (await prisma.inventarioPT.create({
      data: { productoConfiguradoId: productoId, tallaId, bodegaId: bodega.id, cantDisponible: 5 },
    })).id;
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

  it('deshace confirmar + OP sin reservas fantasma y se reconfirma limpio', async () => {
    const mpAntes = await materialReservado();
    const oc = (await crearOC(12).expect(201)).body;
    await request(app.getHttpServer()).post(`/pedidos/oc/${oc.id}/confirmar`).set(auth()).expect(201);
    const op1 = (await request(app.getHttpServer()).post(`/pedidos/op/desde-oc/${oc.id}`).set(auth()).expect(201)).body;
    expect(op1.lineas[0].tallas[0]).toEqual(expect.objectContaining({ cantAmarrada: 5, cantAProducir: 7 }));
    expect((await prisma.inventarioPT.findUniqueOrThrow({ where: { id: invId } })).cantReservada).toBe(5);
    const req1 = await prisma.requerimientoCompra.findMany({ where: { opId: op1.id } });
    expect(req1).toHaveLength(1);
    // La prueba solo vale si el amarre de insumos apartó algo de bodega.
    const mpConReserva = await materialReservado();
    expect([...mpConReserva].some(([m, c]) => c > (mpAntes.get(m) ?? 0))).toBe(true);
    // Una OF vacía (aún sin pares) también se deshace.
    await prisma.ordenFabricacion.create({ data: { consecutivo: 900000 + op1.consecutivo, opId: op1.id } });

    const r = await request(app.getHttpServer()).post(`/pedidos/oc/${oc.id}/unconfirm`).set(auth()).expect(201);
    expect(r.body).toEqual(expect.objectContaining({
      estado: 'BORRADOR', fechaConfirmacion: null, unconfirmedById: adminId, unconfirmedOpNumber: op1.consecutivo,
    }));
    expect(r.body.unconfirmedAt).toBeTruthy();
    expect(await prisma.ordenProduccion.findUnique({ where: { id: op1.id } })).toBeNull();
    expect(await prisma.requerimientoCompra.count({ where: { id: req1[0].id } })).toBe(0);
    expect(await prisma.ordenFabricacion.count({ where: { opId: op1.id } })).toBe(0);
    expect((await prisma.inventarioPT.findUniqueOrThrow({ where: { id: invId } })).cantReservada).toBe(0);
    expect(await prisma.reservaInventarioPT.count({ where: { inventarioPTId: invId } })).toBe(0);
    expect(await materialReservado()).toEqual(mpAntes);

    // Se corrige la cantidad con el flujo normal del borrador y se reconfirma.
    await request(app.getHttpServer()).patch(`/pedidos/oc/${oc.id}`).set(auth())
      .send({ clienteId, lineas: [{ productoConfiguradoId: productoId, tallas: [{ tallaId, cantidad: 8 }] }] })
      .expect(200);
    await request(app.getHttpServer()).post(`/pedidos/oc/${oc.id}/confirmar`).set(auth()).expect(201);
    const op2 = (await request(app.getHttpServer()).post(`/pedidos/op/desde-oc/${oc.id}`).set(auth()).expect(201)).body;
    expect(op2.id).not.toBe(op1.id);
    expect(op2.lineas[0].tallas[0]).toEqual(expect.objectContaining({ cantPedida: 8, cantAmarrada: 5, cantAProducir: 3 }));
    expect((await prisma.inventarioPT.findUniqueOrThrow({ where: { id: invId } })).cantReservada).toBe(5);
    expect(await prisma.reservaInventarioPT.count({ where: { inventarioPTId: invId } })).toBe(1);
    // Lo reservado de MP es exactamente lo del requerimiento nuevo (nada del viejo).
    const req2 = await prisma.requerimientoCompra.findMany({ where: { opId: op2.id }, include: { lineas: true } });
    expect(req2).toHaveLength(1);
    const mpDespues = await materialReservado();
    for (const l of req2[0].lineas) {
      expect((mpDespues.get(l.materialId) ?? 0) - (mpAntes.get(l.materialId) ?? 0)).toBeCloseTo(Number(l.cantReservada), 4);
    }
    expect((await prisma.ordenCompra.findUniqueOrThrow({ where: { id: oc.id } })).estado).toBe('EN_PRODUCCION');
  });

  it('409 con el motivo si ya hay etiquetas impresas en la OF, sin tocar nada', async () => {
    const oc = (await crearOC(3).expect(201)).body;
    await request(app.getHttpServer()).post(`/pedidos/oc/${oc.id}/confirmar`).set(auth()).expect(201);
    const op = (await request(app.getHttpServer()).post(`/pedidos/op/desde-oc/${oc.id}`).set(auth()).expect(201)).body;
    const of = await prisma.ordenFabricacion.create({ data: { consecutivo: 910000 + op.consecutivo, opId: op.id } });
    await prisma.etiquetaReservada.create({ data: { codigo: `E2E-UNCONF-${of.id}`, ofId: of.id, productoConfiguradoId: productoId, tallaId } });

    const r = await request(app.getHttpServer()).post(`/pedidos/oc/${oc.id}/unconfirm`).set(auth()).expect(409);
    expect(r.body.message).toContain(`etiqueta impresa por adelantado en la OF-${of.consecutivo}`);
    expect(await prisma.ordenProduccion.findUnique({ where: { id: op.id } })).not.toBeNull();
    expect((await prisma.ordenCompra.findUniqueOrThrow({ where: { id: oc.id } })).estado).toBe('EN_PRODUCCION');
  });
});
