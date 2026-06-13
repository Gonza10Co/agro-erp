import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ComprasProveedorService } from './compras-proveedor.service';

const user = { sub: 1, role: 'ADMIN' };

function prismaMock() {
  const prisma: any = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ v: 1n }]),
    requerimientoCompra: { findUnique: jest.fn(), update: jest.fn() },
    ordenCompraProveedor: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    ordenCompraProveedorLinea: { update: jest.fn() },
    recepcionCompra: { create: jest.fn() },
    devolucionProveedor: { create: jest.fn() },
    inventarioMaterial: { upsert: jest.fn(), updateMany: jest.fn() },
    movimientoInventario: { createMany: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  return prisma;
}

describe('ComprasProveedorService.generarDesdeRequerimiento', () => {
  let prisma: any;
  let service: ComprasProveedorService;
  beforeEach(() => {
    prisma = prismaMock();
    service = new ComprasProveedorService(prisma);
  });

  it('404 si el requerimiento no existe', async () => {
    prisma.requerimientoCompra.findUnique.mockResolvedValue(null);
    await expect(service.generarDesdeRequerimiento(1)).rejects.toThrow(NotFoundException);
  });

  it('409 si ya tiene órdenes generadas', async () => {
    prisma.requerimientoCompra.findUnique.mockResolvedValue({
      id: 1,
      estado: 'CON_ORDEN',
      lineas: [],
    });
    await expect(service.generarDesdeRequerimiento(1)).rejects.toThrow(ConflictException);
  });

  it('400 si no hay líneas por comprar con proveedor', async () => {
    prisma.requerimientoCompra.findUnique.mockResolvedValue({
      id: 1,
      estado: 'CALCULADO',
      lineas: [
        { materialId: 1, proveedorId: null, cantAComprar: 5, material: { codigo: 'M1', nombreCanonico: 'Cuero' } },
        { materialId: 2, proveedorId: 7, cantAComprar: 0, material: { codigo: 'M2', nombreCanonico: 'Suela' } },
      ],
    });
    await expect(service.generarDesdeRequerimiento(1)).rejects.toThrow(BadRequestException);
  });

  it('crea una OCP por proveedor, marca CON_ORDEN y reporta sin-proveedor', async () => {
    prisma.requerimientoCompra.findUnique.mockResolvedValue({
      id: 1,
      consecutivo: 9,
      estado: 'CALCULADO',
      lineas: [
        { materialId: 1, proveedorId: 7, cantAComprar: 80, material: { codigo: 'M1', nombreCanonico: 'Cuero' } },
        { materialId: 2, proveedorId: 7, cantAComprar: 30, material: { codigo: 'M2', nombreCanonico: 'Hilo' } },
        { materialId: 3, proveedorId: 8, cantAComprar: 50, material: { codigo: 'M3', nombreCanonico: 'PVC' } },
        { materialId: 4, proveedorId: null, cantAComprar: 10, material: { codigo: 'M4', nombreCanonico: 'Ojal' } },
        { materialId: 5, proveedorId: 9, cantAComprar: 0, material: { codigo: 'M5', nombreCanonico: 'Caja' } },
      ],
    });
    prisma.$queryRawUnsafe
      .mockResolvedValueOnce([{ v: 1n }])
      .mockResolvedValueOnce([{ v: 2n }]);
    prisma.ordenCompraProveedor.create
      .mockResolvedValueOnce({ id: 100, consecutivo: 1, proveedor: { id: 7, nombre: 'Curtiembre' } })
      .mockResolvedValueOnce({ id: 101, consecutivo: 2, proveedor: { id: 8, nombre: 'Plásticos' } });

    const res = await service.generarDesdeRequerimiento(1);

    expect(prisma.ordenCompraProveedor.create).toHaveBeenCalledTimes(2);
    const primera = prisma.ordenCompraProveedor.create.mock.calls[0][0].data;
    expect(primera.proveedorId).toBe(7);
    expect(primera.requerimientoId).toBe(1);
    expect(primera.lineas.create).toEqual([
      { materialId: 1, cantPedida: 80 },
      { materialId: 2, cantPedida: 30 },
    ]);
    expect(prisma.requerimientoCompra.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { estado: 'CON_ORDEN' },
    });
    expect(res.ordenes).toHaveLength(2);
    expect(res.sinProveedor).toEqual([
      { materialId: 4, codigo: 'M4', nombre: 'Ojal', cantAComprar: 10 },
    ]);
  });
});

describe('ComprasProveedorService.registrarRecepcion', () => {
  let prisma: any;
  let service: ComprasProveedorService;
  const ocp = () => ({
    id: 10,
    consecutivo: 3,
    estado: 'PENDIENTE',
    lineas: [
      { id: 1, materialId: 7, cantPedida: 200, cantRecibida: 0 },
      { id: 2, materialId: 8, cantPedida: 50, cantRecibida: 0 },
    ],
  });
  beforeEach(() => {
    prisma = prismaMock();
    service = new ComprasProveedorService(prisma);
    prisma.recepcionCompra.create.mockResolvedValue({ id: 70, consecutivo: 1 });
  });

  it('404 si la OCP no existe', async () => {
    prisma.ordenCompraProveedor.findUnique.mockResolvedValue(null);
    await expect(
      service.registrarRecepcion(10, { lineas: [{ ocpLineaId: 1, cantidad: 5 }] }, user),
    ).rejects.toThrow(NotFoundException);
  });

  it('409 si la OCP ya está COMPLETA', async () => {
    prisma.ordenCompraProveedor.findUnique.mockResolvedValue({ ...ocp(), estado: 'COMPLETA' });
    await expect(
      service.registrarRecepcion(10, { lineas: [{ ocpLineaId: 1, cantidad: 5 }] }, user),
    ).rejects.toThrow(ConflictException);
  });

  it('400 si la validación del core falla (sobre-recepción)', async () => {
    prisma.ordenCompraProveedor.findUnique.mockResolvedValue(ocp());
    await expect(
      service.registrarRecepcion(10, { lineas: [{ ocpLineaId: 1, cantidad: 999 }] }, user),
    ).rejects.toThrow(BadRequestException);
  });

  it('recepción parcial: incrementa, alimenta inventario + kardex y queda PARCIAL', async () => {
    prisma.ordenCompraProveedor.findUnique.mockResolvedValue(ocp());

    const res = await service.registrarRecepcion(
      10,
      { lineas: [{ ocpLineaId: 1, cantidad: 100 }], observaciones: 'llegó la mitad' },
      user,
    );

    expect(prisma.ordenCompraProveedorLinea.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { cantRecibida: { increment: 100 } },
    });
    expect(prisma.inventarioMaterial.upsert).toHaveBeenCalledWith({
      where: { materialId: 7 },
      create: { materialId: 7, cantDisponible: 100 },
      update: { cantDisponible: { increment: 100 } },
    });
    const movs = prisma.movimientoInventario.createMany.mock.calls[0][0].data;
    expect(movs).toEqual([
      expect.objectContaining({
        tipo: 'ENTRADA',
        motivo: 'COMPRA',
        materialId: 7,
        cantidad: 100,
        referencia: 'OCP-3',
        usuarioId: 1,
      }),
    ]);
    expect(prisma.ordenCompraProveedor.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { estado: 'PARCIAL' },
    });
    expect(res.estado).toBe('PARCIAL');
  });

  it('recepción que completa todas las líneas deja la OCP COMPLETA', async () => {
    const o = ocp();
    o.lineas[0].cantRecibida = 100; // ya había una recepción parcial
    prisma.ordenCompraProveedor.findUnique.mockResolvedValue(o);

    const res = await service.registrarRecepcion(
      10,
      { lineas: [{ ocpLineaId: 1, cantidad: 100 }, { ocpLineaId: 2, cantidad: 50 }] },
      user,
    );

    expect(prisma.ordenCompraProveedor.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { estado: 'COMPLETA' },
    });
    expect(res.estado).toBe('COMPLETA');
  });
});

describe('ComprasProveedorService.registrarDevolucion', () => {
  let prisma: any;
  let service: ComprasProveedorService;
  const ocp = () => ({
    id: 10,
    consecutivo: 3,
    estado: 'PARCIAL',
    lineas: [{ id: 1, materialId: 7, cantPedida: 200, cantRecibida: 100 }],
  });
  beforeEach(() => {
    prisma = prismaMock();
    service = new ComprasProveedorService(prisma);
    prisma.devolucionProveedor.create.mockResolvedValue({ id: 80, consecutivo: 1 });
  });

  it('404 si la OCP no existe', async () => {
    prisma.ordenCompraProveedor.findUnique.mockResolvedValue(null);
    await expect(
      service.registrarDevolucion(10, { causa: 'Hongos', lineas: [{ materialId: 7, cantidad: 5 }] }, user),
    ).rejects.toThrow(NotFoundException);
  });

  it('400 si falta la causa', async () => {
    prisma.ordenCompraProveedor.findUnique.mockResolvedValue(ocp());
    await expect(
      service.registrarDevolucion(10, { causa: ' ', lineas: [{ materialId: 7, cantidad: 5 }] }, user),
    ).rejects.toThrow(BadRequestException);
  });

  it('400 si el material no pertenece a la OCP', async () => {
    prisma.ordenCompraProveedor.findUnique.mockResolvedValue(ocp());
    await expect(
      service.registrarDevolucion(10, { causa: 'Hongos', lineas: [{ materialId: 99, cantidad: 5 }] }, user),
    ).rejects.toThrow(BadRequestException);
  });

  it('409 si no hay stock suficiente para devolver', async () => {
    prisma.ordenCompraProveedor.findUnique.mockResolvedValue(ocp());
    prisma.inventarioMaterial.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.registrarDevolucion(10, { causa: 'Hongos', lineas: [{ materialId: 7, cantidad: 5000 }] }, user),
    ).rejects.toThrow(ConflictException);
  });

  it('devolución válida: descuenta stock con guarda y registra kardex SALIDA', async () => {
    prisma.ordenCompraProveedor.findUnique.mockResolvedValue(ocp());
    prisma.inventarioMaterial.updateMany.mockResolvedValue({ count: 1 });

    const res = await service.registrarDevolucion(
      10,
      { causa: 'Cuero con hongos', lineas: [{ materialId: 7, cantidad: 20 }] },
      user,
    );

    expect(prisma.inventarioMaterial.updateMany).toHaveBeenCalledWith({
      where: { materialId: 7, cantDisponible: { gte: 20 } },
      data: { cantDisponible: { decrement: 20 } },
    });
    const movs = prisma.movimientoInventario.createMany.mock.calls[0][0].data;
    expect(movs).toEqual([
      expect.objectContaining({
        tipo: 'SALIDA',
        motivo: 'DEVOLUCION_PROVEEDOR',
        materialId: 7,
        cantidad: 20,
        referencia: 'OCP-3',
        usuarioId: 1,
      }),
    ]);
    expect(res.consecutivo).toBe(1);
    // el estado de la OCP no se toca: la mercancía llegó, la devolución es el flujo inverso
    expect(prisma.ordenCompraProveedor.update).not.toHaveBeenCalled();
  });
});

describe('ComprasProveedorService.listar / obtener', () => {
  let prisma: any;
  let service: ComprasProveedorService;
  beforeEach(() => {
    prisma = prismaMock();
    service = new ComprasProveedorService(prisma);
  });

  it('listar mapea totales pedido/recibido por OCP', async () => {
    prisma.ordenCompraProveedor.findMany.mockResolvedValue([
      {
        id: 10,
        consecutivo: 3,
        estado: 'PARCIAL',
        fecha: new Date('2026-06-12'),
        proveedor: { id: 7, nombre: 'Curtiembre' },
        requerimiento: { id: 1, consecutivo: 9 },
        lineas: [
          { cantPedida: 200, cantRecibida: 100 },
          { cantPedida: 50, cantRecibida: 0 },
        ],
      },
    ]);
    const res = await service.listar();
    expect(res[0]).toEqual(
      expect.objectContaining({
        consecutivo: 3,
        estado: 'PARCIAL',
        totalPedido: 250,
        totalRecibido: 100,
      }),
    );
  });

  it('obtener: 404 si no existe', async () => {
    prisma.ordenCompraProveedor.findUnique.mockResolvedValue(null);
    await expect(service.obtener(99)).rejects.toThrow(NotFoundException);
  });

  it('obtener mapea líneas con pendiente', async () => {
    prisma.ordenCompraProveedor.findUnique.mockResolvedValue({
      id: 10,
      consecutivo: 3,
      estado: 'PARCIAL',
      fecha: new Date('2026-06-12'),
      observaciones: null,
      proveedor: { id: 7, nombre: 'Curtiembre' },
      requerimiento: { id: 1, consecutivo: 9 },
      lineas: [
        {
          id: 1,
          materialId: 7,
          cantPedida: 200,
          cantRecibida: 100,
          material: { codigo: 'M1', nombreCanonico: 'Cuero', unidadMedida: { codigo: 'm2' } },
        },
      ],
      recepciones: [
        {
          id: 70,
          consecutivo: 1,
          fecha: new Date('2026-06-12'),
          observaciones: 'parcial',
          lineas: [{ ocpLineaId: 1, cantidad: 100 }],
        },
      ],
      devoluciones: [],
    });
    const res = await service.obtener(10);
    expect(res.lineas[0]).toEqual(
      expect.objectContaining({ cantPedida: 200, cantRecibida: 100, pendiente: 100 }),
    );
    expect(res.recepciones).toHaveLength(1);
  });
});
