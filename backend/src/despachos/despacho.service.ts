import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { siguienteConsecutivo } from '../prisma/consecutivo';
import { liberarReservasDeOp } from '../compras/reserva-insumos';
import { DespacharDto } from './dto/despachar.dto';
import { construirLineasDespacho, ReservaPlana } from './despacho-lineas';
import { pendingOf } from '../pedidos/op/op-need';

const CAMBIO_EN_CURSO = 'El pedido cambió mientras se despachaba, vuelve a intentar';

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
    // Producción pendiente = lo que el pedido necesita (amarrado de bodega +
    // programado a fabricar − lo cedido a otro pedido) menos lo que ya tiene
    // reservado (el amarre inicial más cada par que entró a PT). `cantAProducir`
    // no baja al producir: es lo programado, y así lo leen el corte y los tableros.
    // Un pedido al que gerencia le pasó pares a otro queda debiendo y falla acá.
    const faltan = op.lineas.reduce(
      (acc: number, l: any) => acc + l.tallas.reduce((a: number, t: any) => a + pendingOf(t), 0),
      0,
    );
    if (faltan > 0)
      throw new BadRequestException(
        `OP con producción pendiente: faltan ${faltan} pares por terminar; no se puede despachar`,
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
            // El grado sale del saldo del que se reservó, no de la línea: es lo
            // que físicamente sale de bodega.
            calidad: r.inventarioPT.calidad ?? 'PRIMERA',
            cantidad: r.cantidad,
            inventarioPTId: r.inventarioPTId,
            reservaId: r.id,
          })),
        ),
      );
    // Orden canónico de locks (por fila de inventario): dos despachos o un despacho y
    // una reasignación que tocan las mismas filas las bloquean en el mismo orden.
    reservas.sort((a, b) => a.inventarioPTId - b.inventarioPTId || a.reservaId - b.reservaId);
    const tallaIds: number[] = op.lineas.flatMap((l: any) => l.tallas.map((t: any) => t.id)).filter((id: any) => id != null);
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
            `Inventario insuficiente al despachar (producto ${r.productoConfiguradoId}, talla ${r.tallaId}, bodega ${r.bodegaId}) — reintentá o revisá reservas`,
          );
        // Las reservas se leyeron fuera de la transacción: si una reasignación de pares
        // la cambió en el medio, no se despacha con datos viejos.
        const borrada = await tx.reservaInventarioPT.deleteMany({ where: { id: r.reservaId, cantidad: r.cantidad } });
        if (borrada.count === 0) throw new ConflictException(CAMBIO_EN_CURSO);
      }
      // Y si le llegó una reserva nueva (recibió pares) tampoco: quedaría colgando de
      // una OP despachada, ocupando stock para siempre.
      if (tallaIds.length > 0) {
        const quedan = await tx.reservaInventarioPT.count({ where: { opLineaTallaId: { in: tallaIds } } });
        if (quedan > 0) throw new ConflictException(CAMBIO_EN_CURSO);
      }

      // Kardex: una SALIDA por reserva despachada, trazable al despacho.
      // La línea de la OP se sella en el movimiento (kardex PT por línea).
      await tx.movimientoInventario.createMany({
        data: reservas.map((r) => ({
          tipo: 'SALIDA' as const,
          motivo: 'DESPACHO' as const,
          inventarioPTId: r.inventarioPTId,
          cantidad: r.cantidad,
          referencia: `DSP-${consecutivo}`,
          usuarioId: user.sub,
          lineaId: op.lineaId ?? null,
        })),
      });

      const despacho = await tx.despacho.create({
        data: {
          consecutivo,
          opId: op.id,
          // Destino sellado en el remito. La OC ya congeló su dirección al crearse
          // (de la sede elegida o de la principal), así que acá solo se copia.
          direccionEntrega: op.oc.direccionDespacho ?? null,
          autorizadoPorId: bloqueada ? user.sub : null,
          motivoAutorizacion: bloqueada ? (dto.motivo ?? null) : null,
          lineas: { create: lineas },
        },
      });

      await tx.ordenProduccion.update({
        where: { id: op.id },
        data: { estado: 'DESPACHADA' },
      });
      // La producción terminó: el amarre de insumos de esta OP ya cumplió y se
      // libera (el consumo real por OF es de Fase B).
      await liberarReservasDeOp(tx, op.id);
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
        direccionEntrega: true,
        autorizadoPorId: true,
        factura: { select: { id: true, consecutivo: true } },
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
