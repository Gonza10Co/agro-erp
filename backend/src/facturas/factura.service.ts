import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { siguienteConsecutivo } from '../prisma/consecutivo';
import { FacturarDto } from './dto/facturar.dto';
import { lineasDeFactura, totales } from './factura-core';

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
        op: { include: { oc: { include: { lineas: true } } } },
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

    return this.prisma.$transaction(async (tx) => {
      const consecutivo = await siguienteConsecutivo(tx, 'factura');
      return tx.factura.create({
        data: {
          consecutivo,
          despachoId: despacho.id,
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
