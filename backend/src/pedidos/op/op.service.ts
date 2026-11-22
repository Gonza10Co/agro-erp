import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DISPATCH_SUMMARY_SELECT, dispatchSummary } from '../../despachos/dispatch-summary';
import { PrismaService } from '../../prisma/prisma.service';
import { siguienteConsecutivo } from '../../prisma/consecutivo';
import { ComprasService } from '../../compras/compras.service';
import { liberarReservasDeOp } from '../../compras/reserva-insumos';
import { amarrarTalla, DisponibilidadBodega } from './amarre';
import { PtHold, releasePtHolds } from './release-pt-holds';

@Injectable()
export class OpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compras: ComprasService,
  ) {}

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

    const creada = await this.prisma.$transaction(async (tx) => {
      // Bloquea la OC y revalida: un "devolver a borrador" en paralelo no puede
      // dejar una OP colgada de una OC en BORRADOR.
      const [locked] = await tx.$queryRaw<{ estado: string }[]>`
        SELECT estado FROM "OrdenCompra" WHERE id = ${ocId} FOR UPDATE`;
      if (locked && locked.estado !== 'CONFIRMADA') {
        throw new BadRequestException(
          'Solo se puede generar OP de una OC CONFIRMADA',
        );
      }
      const consecutivo = await siguienteConsecutivo(tx, 'op');
      const op = await tx.ordenProduccion.create({
        // La línea del pedido baja de la OC: fabricación la lee de la OP.
        data: { consecutivo, ocId, estado: 'CREADA', lineaId: oc.lineaId ?? null },
      });

      for (const linea of oc.lineas) {
        const opLinea = await tx.ordenProduccionLinea.create({
          data: {
            opId: op.id,
            productoConfiguradoId: linea.productoConfiguradoId,
            calidad: linea.calidad, // el grado pedido baja al despacho
          },
        });

        for (const t of linea.tallas) {
          // Lock pesimista: serializa amarres concurrentes del mismo producto/talla
          // para que dos OPs no reserven el mismo stock a la vez. ORDER BY id fija
          // un orden canónico de adquisición (evita deadlocks entre tx cruzadas).
          // Limitación conocida: con 0 filas no bloquea inserts nuevos de fabricación
          // simultánea — el amarre puede no ver ese stock (subóptimo, nunca negativo).
          // El amarre respeta el GRADO PEDIDO: un pedido de primeras nunca se
          // llena con segundas, y uno de segundas no vacía el stock bueno.
          // El lock se acota al mismo grado por la misma razón.
          const calidad = linea.calidad;
          await tx.$queryRaw`SELECT id FROM "InventarioPT" WHERE "productoConfiguradoId" = ${linea.productoConfiguradoId} AND "tallaId" = ${t.tallaId} AND "calidad" = ${calidad}::"CalidadPT" ORDER BY id FOR UPDATE`;

          const stock = await tx.inventarioPT.findMany({
            where: {
              productoConfiguradoId: linea.productoConfiguradoId,
              tallaId: t.tallaId,
              calidad,
            },
            include: { bodega: true },
          });
          // Un pedido para stock (mínimos) se fabrica completo: no toma de la bodega
          // que justamente viene a reponer.
          const disponibilidades: DisponibilidadBodega[] = oc.paraStock ? [] : stock.map((s) => ({
            bodegaId: s.bodegaId,
            inventarioPTId: s.id,
            disponible: s.cantDisponible - s.cantReservada,
            prioridad: s.bodega.prioridad,
          }));

          const res = amarrarTalla(
            { tallaId: t.tallaId, cantPedida: t.cantidad },
            disponibilidades,
          );

          // Las segundas NO se fabrican a pedido: salen de un defecto, no de una
          // orden. Lo que no alcance a amarrarse queda pendiente y se avisa; poner
          // pares de segunda a producir mandaría a planta a arruinar botas a propósito.
          const cantAProducir = calidad === 'SEGUNDA' ? 0 : res.cantAProducir;

          const opLineaTalla = await tx.ordenProduccionLineaTalla.create({
            data: {
              opLineaId: opLinea.id,
              tallaId: t.tallaId,
              cantPedida: res.cantPedida,
              cantAmarrada: res.cantAmarrada,
              cantAProducir,
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

    // La promesa de la Entrega 4: apenas se confirma el pedido, el sistema
    // amarra los insumos que ya hay en bodega y dice exactamente qué comprar.
    // Solo aplica si algo quedó A PRODUCIR (lo amarrado de PT no consume insumos).
    let requerimientoId: number | null = null;
    const aProducir = ((creada as any)?.lineas ?? []).some((l: any) =>
      (l.tallas ?? []).some((t: any) => t.cantAProducir > 0),
    );
    if (aProducir) {
      try {
        const req = await this.compras.calcularRequerimiento((creada as any).id);
        requerimientoId = req.id;
      } catch {
        // BOM incompleto u otro tropiezo: la OP queda creada igual y el
        // requerimiento se puede calcular a mano desde el detalle de la OP.
      }
    }
    return { ...(creada as any), requerimientoId };
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
    // Ya salió completa: no hay nada que soltar y el pedido quedó cerrado. Una OP
    // despachada por partes sí se puede anular: suelta solo lo que sigue reservado
    // (lo despachado ya se entregó y sus despachos quedan como están).
    if (op.estado === 'DESPACHADA')
      throw new BadRequestException('La OP ya fue despachada: no se puede anular');

    const reservas: PtHold[] = op.lineas.flatMap((l: any) => l.tallas.flatMap((t: any) => t.reservas ?? []));
    const tallaIds: number[] = op.lineas.flatMap((l: any) => l.tallas.map((t: any) => t.id));

    return this.prisma.$transaction(async (tx) => {
      // Las reservas se leyeron fuera de la transacción: se sueltan solo si siguen
      // como se leyeron (ver releasePtHolds).
      await releasePtHolds(tx, reservas, tallaIds, 'El pedido cambió mientras se anulaba, vuelve a intentar');
      // Una OP anulada no puede seguir fabricándose: se cancelan pares y OFs vivas.
      // Decisión de negocio: las OF TERMINADAS no se tocan — lo ya producido
      // quedó cargado en InventarioPT y puede amarrarse a otra OP.
      await tx.par.updateMany({
        where: { of: { opId }, estado: 'EN_PROCESO' },
        data: { estado: 'CANCELADO' },
      });
      await tx.ordenFabricacion.updateMany({
        where: { opId, estado: { in: ['ABIERTA', 'EN_PROCESO'] } },
        data: { estado: 'ANULADA' },
      });
      // El amarre de insumos también se suelta: esos materiales quedan libres
      // para otros pedidos.
      await liberarReservasDeOp(tx, opId);
      await tx.ordenProduccion.update({
        where: { id: opId },
        data: { estado: 'ANULADA' },
      });
      // Si ya salió una parte, el pedido no vuelve a CONFIRMADA: quedaría como si
      // no se hubiera entregado nada. Se cierra con lo que alcanzó a salir.
      const yaSalio = op.lineas.some((l: any) => l.tallas.some((t: any) => (t.dispatched ?? 0) > 0));
      return tx.ordenCompra.update({
        where: { id: op.ocId },
        data: { estado: yaSalio ? 'CERRADA' : 'CONFIRMADA' },
      });
    });
  }

  async listar() {
    const ops = await this.prisma.ordenProduccion.findMany({
      orderBy: { consecutivo: 'desc' },
      include: {
        oc: {
          select: {
            id: true,
            consecutivo: true,
            cliente: { select: { id: true, nombre: true } },
          },
        },
        // Una sola consulta para el chip "Despacho parcial" (sin N+1).
        ...DISPATCH_SUMMARY_SELECT,
      },
    });
    // Las tallas solo sirven para el resumen: no viajan a la lista.
    return ops.map(({ lineas, _count, ...op }) => ({ ...op, dispatch: dispatchSummary({ ...op, lineas, _count }) }));
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
        // Las entregas del pedido, en orden: "Entrega 1", "Entrega 2"… y cuál la cerró.
        despachos: {
          orderBy: { deliveryNumber: 'asc' },
          select: {
            id: true,
            consecutivo: true,
            fecha: true,
            deliveryNumber: true,
            isFinal: true,
            lineas: { select: { cantidad: true } },
            factura: { select: { id: true, consecutivo: true } },
          },
        },
      },
    });
    if (!op) throw new NotFoundException(`OP ${id} no existe`);
    return op;
  }
}
