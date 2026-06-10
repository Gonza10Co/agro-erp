import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { siguienteConsecutivo } from '../prisma/consecutivo';
import { DespacharDto } from './dto/despachar.dto';
import { construirLineasDespacho, ReservaPlana } from './despacho-lineas';

interface Usuario {
  sub: number;
  role: string;
}

@Injectable()
export class DespachoService {
  constructor(private readonly prisma: PrismaService) {}

  async despachar(dto: DespacharDto, user: Usuario) {
    const op = await this.prisma.ordenProduccion.findUnique({
      where: { id: dto.opId },
      include: {
        despacho: true,
        oc: { include: { cliente: true } },
        lineas: {
          include: {
            tallas: { include: { reservas: { include: { inventarioPT: true } } } },
          },
        },
      },
    });
    if (!op) throw new NotFoundException(`OP ${dto.opId} no existe`);
    if (op.despacho) throw new BadRequestException('La OP ya fue despachada');
    if (op.estado !== 'AMARRADA')
      throw new BadRequestException('Solo se puede despachar una OP AMARRADA');
    const pendiente = op.lineas.some((l: any) =>
      l.tallas.some((t: any) => t.cantAProducir > 0),
    );
    if (pendiente)
      throw new BadRequestException(
        'OP con producción pendiente; no se puede despachar',
      );

    const estado = op.oc.cliente.estadoCartera;
    const bloqueada = estado === 'VENCIDO' || estado === 'BLOQUEADO';
    if (bloqueada) {
      if (!dto.autorizar)
        throw new ConflictException(
          `Cliente con cartera ${estado} — requiere autorización del gerente`,
        );
      if (user.role !== 'GERENTE' && user.role !== 'ADMIN')
        throw new ForbiddenException(
          'Solo un gerente puede autorizar el despacho',
        );
    }

    const reservas: (ReservaPlana & { inventarioPTId: number; reservaId: number })[] =
      op.lineas.flatMap((l: any) =>
        l.tallas.flatMap((t: any) =>
          t.reservas.map((r: any) => ({
            productoConfiguradoId: l.productoConfiguradoId,
            tallaId: t.tallaId,
            bodegaId: r.inventarioPT.bodegaId,
            cantidad: r.cantidad,
            inventarioPTId: r.inventarioPTId,
            reservaId: r.id,
          })),
        ),
      );
    const lineas = construirLineasDespacho(reservas);

    return this.prisma.$transaction(async (tx) => {
      const consecutivo = await siguienteConsecutivo(tx, 'despacho');

      for (const r of reservas) {
        const res = await tx.inventarioPT.updateMany({
          where: {
            id: r.inventarioPTId,
            cantDisponible: { gte: r.cantidad },
            cantReservada: { gte: r.cantidad },
          },
          data: {
            cantDisponible: { decrement: r.cantidad },
            cantReservada: { decrement: r.cantidad },
          },
        });
        if (res.count === 0)
          throw new ConflictException(
            'Inventario insuficiente al despachar — reintentá o revisá reservas',
          );
        await tx.reservaInventarioPT.delete({ where: { id: r.reservaId } });
      }

      const despacho = await tx.despacho.create({
        data: {
          consecutivo,
          opId: op.id,
          autorizadoPorId: bloqueada ? user.sub : null,
          motivoAutorizacion: bloqueada ? (dto.motivo ?? null) : null,
          lineas: { create: lineas },
        },
      });

      await tx.ordenProduccion.update({
        where: { id: op.id },
        data: { estado: 'DESPACHADA' },
      });
      await tx.ordenCompra.update({
        where: { id: op.ocId },
        data: { estado: 'CERRADA' },
      });
      return despacho;
    });
  }

  listar() {
    return this.prisma.despacho.findMany({
      orderBy: { consecutivo: 'desc' },
      select: {
        id: true,
        consecutivo: true,
        fecha: true,
        autorizadoPorId: true,
        op: {
          select: {
            consecutivo: true,
            oc: { select: { cliente: { select: { nombre: true } } } },
          },
        },
      },
    });
  }

  async obtener(id: number) {
    const d = await this.prisma.despacho.findUnique({
      where: { id },
      include: {
        op: { select: { consecutivo: true, oc: { select: { cliente: { select: { nombre: true } } } } } },
        autorizadoPor: { select: { username: true } },
        lineas: {
          include: { productoConfigurado: true, talla: true, bodega: true },
        },
      },
    });
    if (!d) throw new NotFoundException(`Despacho ${id} no existe`);
    return d;
  }
}
