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
import { construirLineasDespacho } from './despacho-lineas';
import { DispatchError, planDispatch, TallaDespachable } from './dispatch-plan';
import { pendingOf, undispatchedOf } from '../pedidos/op/op-need';

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
        oc: { include: { cliente: true } },
        lineas: {
          include: {
            tallas: {
              include: { reservas: { include: { inventarioPT: { include: { bodega: true } } } } },
            },
          },
        },
      },
    });
    if (!op) throw new NotFoundException(`OP ${dto.opId} no existe`);
    if (op.estado === 'DESPACHADA') throw new BadRequestException('La OP ya fue despachada');
    // AMARRADA = salió toda de bodega; EN_PRODUCCION = se fabrica y su estado no
    // cambia al terminar: lo que manda es lo que ya está reservado en PT (abajo).
    if (op.estado !== 'AMARRADA' && op.estado !== 'EN_PRODUCCION')
      throw new BadRequestException('Solo se puede despachar una OP amarrada o en producción');

    const parcial = dto.lines != null;
    if (!parcial) {
      // El despacho de siempre (sin `lines`): sale todo y el pedido tiene que estar
      // completo. Producción pendiente = lo que el pedido necesita (amarrado de bodega +
      // programado a fabricar − lo cedido a otro pedido) menos lo que ya tiene
      // reservado y lo que ya salió en despachos parciales. `cantAProducir` no baja al
      // producir: es lo programado, y así lo leen el corte y los tableros.
      const faltan = op.lineas.reduce(
        (acc: number, l: any) => acc + l.tallas.reduce((a: number, t: any) => a + pendingOf(t), 0),
        0,
      );
      if (faltan > 0)
        throw new BadRequestException(
          `OP con producción pendiente: faltan ${faltan} pares por terminar; no se puede despachar completa (despacha una parte)`,
        );
    }

    const tallas: TallaDespachable[] = op.lineas.flatMap((l: any) =>
      l.tallas.map((t: any) => ({
        opLineaTallaId: t.id,
        productoConfiguradoId: l.productoConfiguradoId,
        tallaId: t.tallaId,
        cantAmarrada: t.cantAmarrada,
        cantAProducir: t.cantAProducir,
        reassignedOut: t.reassignedOut,
        dispatched: t.dispatched,
        reservas: (t.reservas ?? []).map((r: any) => ({
          reservaId: r.id,
          inventarioPTId: r.inventarioPTId,
          bodegaId: r.inventarioPT.bodegaId,
          prioridad: r.inventarioPT.bodega?.prioridad ?? 100,
          // El grado sale del saldo del que se reservó, no de la línea: es lo
          // que físicamente sale de bodega.
          calidad: r.inventarioPT.calidad ?? 'PRIMERA',
          cantidad: r.cantidad,
        })),
      })),
    );
    let plan: ReturnType<typeof planDispatch>;
    try {
      plan = planDispatch(tallas, dto.lines ?? null);
    } catch (e) {
      if (e instanceof DispatchError) throw new BadRequestException(e.message);
      throw e;
    }

    // La regla de cartera aplica igual a cada despacho, parcial o total.
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

    const tallaIds: number[] = tallas.map((t) => t.opLineaTallaId).filter((id) => id != null);
    const lineas = construirLineasDespacho(plan.takes);

    return this.prisma.$transaction(async (tx) => {
      // La OP primero (mismo orden que la reasignación de pares): dos despachos de la
      // misma OP, o un despacho y una reasignación, no se cruzan.
      await tx.$queryRaw`SELECT id FROM "OrdenProduccion" WHERE id = ${op.id} FOR UPDATE`;
      const vigente = await tx.ordenProduccion.findUnique({ where: { id: op.id }, select: { estado: true } });
      if (vigente?.estado !== 'AMARRADA' && vigente?.estado !== 'EN_PRODUCCION')
        throw new ConflictException(CAMBIO_EN_CURSO);

      const consecutivo = await siguienteConsecutivo(tx, 'despacho');

      for (const r of plan.takes) {
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
        // (o la entrada de un par a PT) la cambió en el medio, no se despacha con datos
        // viejos. Si sale entera se borra; si sale una parte, baja.
        const tocada =
          r.cantidad === r.reservaCantidad
            ? await tx.reservaInventarioPT.deleteMany({ where: { id: r.reservaId, cantidad: r.reservaCantidad } })
            : await tx.reservaInventarioPT.updateMany({
                where: { id: r.reservaId, cantidad: r.reservaCantidad },
                data: { cantidad: { decrement: r.cantidad } },
              });
        if (tocada.count === 0) throw new ConflictException(CAMBIO_EN_CURSO);
      }
      // Lo despachado sube lo mismo que bajó la reserva: deja de contar como pendiente.
      for (const [id, c] of plan.perTalla)
        await tx.ordenProduccionLineaTalla.update({ where: { id }, data: { dispatched: { increment: c } } });

      // El despacho total sale con TODO lo reservado: si le llegó una reserva nueva
      // (recibió pares) en el medio, quedaría colgando de una OP cerrada.
      if (!parcial && tallaIds.length > 0) {
        const quedan = await tx.reservaInventarioPT.count({ where: { opLineaTallaId: { in: tallaIds } } });
        if (quedan > 0) throw new ConflictException(CAMBIO_EN_CURSO);
      }

      // Kardex: una SALIDA por reserva despachada, trazable al despacho.
      // La línea de la OP se sella en el movimiento (kardex PT por línea).
      await tx.movimientoInventario.createMany({
        data: plan.takes.map((r) => ({
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

      // ¿Ya salió todo? Se decide con lo despachado leído DESPUÉS del lock (un despacho
      // parcial anterior pudo terminar entre la lectura de afuera y el lock).
      const actuales = await tx.ordenProduccionLineaTalla.findMany({
        where: { opLinea: { opId: op.id } },
        select: { id: true, cantAmarrada: true, cantAProducir: true, reassignedOut: true, dispatched: true },
      });
      const cierra = actuales.every((t: any) => undispatchedOf(t) === 0);
      if (!cierra) return { ...despacho, opClosed: false };

      // Si al cerrar queda algo reservado (más de lo que el pedido necesitaba), se
      // suelta en bodega: una OP despachada no puede seguir ocupando stock.
      const sobrantes = await tx.reservaInventarioPT.findMany({
        where: { opLineaTallaId: { in: actuales.map((t: any) => t.id) } },
        orderBy: [{ inventarioPTId: 'asc' }, { id: 'asc' }],
      });
      for (const r of sobrantes) {
        await tx.reservaInventarioPT.delete({ where: { id: r.id } });
        await tx.inventarioPT.update({
          where: { id: r.inventarioPTId },
          data: { cantReservada: { decrement: r.cantidad } },
        });
      }

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
      return { ...despacho, opClosed: true };
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
        // Para la lista: cuántos pares salieron y si es parte de un despacho parcial
        // (la OP sigue abierta o salió en más de un despacho).
        lineas: { select: { cantidad: true } },
        op: {
          select: {
            consecutivo: true,
            estado: true,
            _count: { select: { despachos: true } },
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
