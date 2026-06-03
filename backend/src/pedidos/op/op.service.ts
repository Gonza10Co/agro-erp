import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { amarrarTalla, DisponibilidadBodega } from './amarre';

@Injectable()
export class OpService {
  constructor(private readonly prisma: PrismaService) {}

  async generarDesdeOC(ocId: number) {
    const oc = await this.prisma.ordenCompra.findUnique({
      where: { id: ocId },
      include: { lineas: { include: { tallas: true } } },
    });
    if (!oc) throw new NotFoundException(`OC ${ocId} no existe`);
    if (oc.estado !== 'CONFIRMADA') {
      throw new BadRequestException(
        'Solo se puede generar OP de una OC CONFIRMADA',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const agg = await tx.ordenProduccion.aggregate({
        _max: { consecutivo: true },
      });
      const consecutivo = (agg._max.consecutivo ?? 0) + 1;
      const op = await tx.ordenProduccion.create({
        data: { consecutivo, ocId, estado: 'CREADA' },
      });

      for (const linea of oc.lineas) {
        const opLinea = await tx.ordenProduccionLinea.create({
          data: {
            opId: op.id,
            productoConfiguradoId: linea.productoConfiguradoId,
          },
        });

        for (const t of linea.tallas) {
          const stock = await tx.inventarioPT.findMany({
            where: {
              productoConfiguradoId: linea.productoConfiguradoId,
              tallaId: t.tallaId,
            },
            include: { bodega: true },
          });
          const disponibilidades: DisponibilidadBodega[] = stock.map((s) => ({
            bodegaId: s.bodegaId,
            inventarioPTId: s.id,
            disponible: s.cantDisponible - s.cantReservada,
            prioridad: s.bodega.prioridad,
          }));

          const res = amarrarTalla(
            { tallaId: t.tallaId, cantPedida: t.cantidad },
            disponibilidades,
          );

          const opLineaTalla = await tx.ordenProduccionLineaTalla.create({
            data: {
              opLineaId: opLinea.id,
              tallaId: t.tallaId,
              cantPedida: res.cantPedida,
              cantAmarrada: res.cantAmarrada,
              cantAProducir: res.cantAProducir,
            },
          });

          for (const r of res.reservas) {
            await tx.inventarioPT.update({
              where: { id: r.inventarioPTId },
              data: { cantReservada: { increment: r.cantidad } },
            });
            await tx.reservaInventarioPT.create({
              data: {
                opLineaTallaId: opLineaTalla.id,
                inventarioPTId: r.inventarioPTId,
                cantidad: r.cantidad,
              },
            });
          }
        }
      }

      await tx.ordenProduccion.update({
        where: { id: op.id },
        data: { estado: 'AMARRADA' },
      });
      await tx.ordenCompra.update({
        where: { id: ocId },
        data: { estado: 'EN_PRODUCCION' },
      });
      return tx.ordenProduccion.findUnique({
        where: { id: op.id },
        include: { lineas: { include: { tallas: true } } },
      });
    });
  }

  async anular(opId: number) {
    const op = await this.prisma.ordenProduccion.findUnique({
      where: { id: opId },
      include: {
        lineas: { include: { tallas: { include: { reservas: true } } } },
      },
    });
    if (!op) throw new NotFoundException(`OP ${opId} no existe`);
    if (op.estado === 'ANULADA')
      throw new BadRequestException('La OP ya está anulada');

    return this.prisma.$transaction(async (tx) => {
      for (const linea of op.lineas) {
        for (const t of linea.tallas) {
          for (const r of t.reservas) {
            await tx.inventarioPT.update({
              where: { id: r.inventarioPTId },
              data: { cantReservada: { decrement: r.cantidad } },
            });
          }
          await tx.reservaInventarioPT.deleteMany({
            where: { opLineaTallaId: t.id },
          });
        }
      }
      await tx.ordenProduccion.update({
        where: { id: opId },
        data: { estado: 'ANULADA' },
      });
      return tx.ordenCompra.update({
        where: { id: op.ocId },
        data: { estado: 'CONFIRMADA' },
      });
    });
  }

  listar() {
    return this.prisma.ordenProduccion.findMany({
      orderBy: { consecutivo: 'desc' },
      include: {
        oc: {
          select: {
            id: true,
            consecutivo: true,
            cliente: { select: { id: true, nombre: true } },
          },
        },
      },
    });
  }

  async obtener(id: number) {
    const op = await this.prisma.ordenProduccion.findUnique({
      where: { id },
      include: {
        oc: {
          include: {
            cliente: { select: { id: true, nit: true, nombre: true } },
          },
        },
        lineas: {
          include: {
            productoConfigurado: true,
            tallas: {
              orderBy: { talla: { orden: 'asc' } },
              include: {
                talla: true,
                reservas: {
                  include: { inventarioPT: { include: { bodega: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!op) throw new NotFoundException(`OP ${id} no existe`);
    return op;
  }
}
