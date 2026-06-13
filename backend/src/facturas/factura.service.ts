import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { siguienteConsecutivo } from '../prisma/consecutivo';
import { FacturarDto } from './dto/facturar.dto';
import { lineasDeFactura, totales } from './factura-core';
import { diasCredito } from '../cartera/cartera-core';
import { recalcularEstadoCartera } from '../cartera/recalcular-cartera';

@Injectable()
export class FacturaService {
  constructor(private readonly prisma: PrismaService) {}

  async facturar(dto: FacturarDto) {
    const ivaPct = dto.ivaPct ?? 19;
    const despacho = await this.prisma.despacho.findUnique({
      where: { id: dto.despachoId },
      include: {
        factura: true,
        lineas: true,
        op: { include: { oc: { include: { lineas: true, cliente: true } } } },
      },
    });
    if (!despacho)
      throw new NotFoundException(`Despacho ${dto.despachoId} no existe`);
    if (despacho.factura)
      throw new BadRequestException('El despacho ya fue facturado');

    // Precio pactado por producto desde las líneas de la OC (Decimal → number).
    const precioPorProducto = new Map<number, number>();
    for (const l of despacho.op.oc.lineas) {
      if (l.precioUnitario != null)
        precioPorProducto.set(l.productoConfiguradoId, Number(l.precioUnitario));
    }
    const sinPrecio = despacho.lineas
      .filter((l: any) => !precioPorProducto.has(l.productoConfiguradoId))
      .map((l: any) => l.productoConfiguradoId);
    if (sinPrecio.length > 0)
      throw new BadRequestException(
        `Productos despachados sin precio pactado en la OC: ${[...new Set(sinPrecio)].join(', ')}`,
      );

    const lineas = lineasDeFactura(despacho.lineas, precioPorProducto);
    const t = totales(lineas, ivaPct);

    // Vencimiento = fecha de emisión + días de crédito del cliente.
    const cliente = despacho.op.oc.cliente;
    const fecha = new Date();
    const fechaVencimiento = new Date(fecha);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + diasCredito(cliente.tipoCredito));

    return this.prisma.$transaction(async (tx) => {
      const consecutivo = await siguienteConsecutivo(tx, 'factura');
      const factura = await tx.factura.create({
        data: {
          consecutivo,
          despachoId: despacho.id,
          fecha,
          fechaVencimiento,
          ivaPct,
          subtotal: t.subtotal,
          iva: t.iva,
          total: t.total,
          lineas: {
            create: lineas.map((l) => ({
              productoConfiguradoId: l.productoConfiguradoId,
              tallaId: l.tallaId,
              cantidad: l.cantidad,
              precioUnitario: l.precioUnitario,
              subtotal: l.subtotal,
            })),
          },
        },
      });
      // Emitir una CxC puede cambiar el estado de cartera del cliente.
      await recalcularEstadoCartera(tx, cliente.id, fecha);
      return factura;
    });
  }

  listar() {
    return this.prisma.factura.findMany({
      orderBy: { consecutivo: 'desc' },
      select: {
        id: true,
        consecutivo: true,
        fecha: true,
        total: true,
        estado: true,
        despacho: {
          select: {
            consecutivo: true,
            op: {
              select: {
                consecutivo: true,
                oc: { select: { cliente: { select: { nombre: true } } } },
              },
            },
          },
        },
      },
    });
  }

  async obtener(id: number) {
    const f = await this.prisma.factura.findUnique({
      where: { id },
      include: {
        despacho: {
          select: {
            consecutivo: true,
            op: {
              select: {
                consecutivo: true,
                oc: { select: { consecutivo: true, cliente: true } },
              },
            },
          },
        },
        lineas: { include: { productoConfigurado: true, talla: true } },
      },
    });
    if (!f) throw new NotFoundException(`Factura ${id} no existe`);
    return f;
  }
}
