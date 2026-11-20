import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { pendingOf, reservedOf } from '../op/op-need';
import { planMove, planShiftToStock, ReassignmentError } from './pt-reassignment-core';
import { ReassignPtDto, ReleasePtDto } from './dto/reassign-pt.dto';

/** Quién puede pasar o liberar pares reservados. Espejo de `ROLES_REASIGNAN_PARES` del front. */
export const ROLES_REASIGNAN_PARES = ['ADMIN', 'GERENTE'];

/** Una OP puede ceder o recibir pares mientras no esté despachada ni anulada. */
const ESTADOS_VIVOS = ['CREADA', 'AMARRADA', 'EN_PRODUCCION'] as const;

interface Usuario {
  sub: number;
  role: string;
}

type Calidad = 'PRIMERA' | 'SEGUNDA';

/**
 * Gerencia pasa pares RESERVADOS en PT de un pedido (A) a otro (B), o los libera.
 *
 * Qué pasa con cada uno (todo en una sola transacción):
 * - A: su reserva baja X. Si son primeras, `cantAProducir` sube X y `reassignedOut`
 *   sube X: la necesidad del pedido no cambia, así que A queda DEBIENDO X (el
 *   despacho falla por faltante, la proyección lo muestra por producir y los pares
 *   que sigan saliendo de su OF se le vuelven a reservar). No se crean OF ni pares;
 *   si su OF ya estaba TERMINADA se reabre para que puedan nacer los que debe.
 *   Las segundas no se fabrican: A queda debiendo sin reprogramar nada.
 * - B: su reserva sube X sobre la MISMA fila de InventarioPT (los pares no cambian
 *   de bodega ni de código). Lo que B tenía programado a producir de esa talla baja
 *   en lo recibido (pasa a "amarrado"), sin bajar de lo que ya nació en planta.
 * - Liberar: la reserva de A baja y `InventarioPT.cantReservada` baja X: quedan
 *   libres para que los amarre la OP del pedido que se genere después.
 */
@Injectable()
export class PtReassignmentService {
  constructor(private readonly prisma: PrismaService) {}

  reassign(fromOpId: number, dto: ReassignPtDto, user: Usuario) {
    return this.move(fromOpId, dto.toOpId, dto, user);
  }

  release(fromOpId: number, dto: ReleasePtDto, user: Usuario) {
    return this.move(fromOpId, null, dto, user);
  }

  private async move(fromOpId: number, toOpId: number | null, dto: ReleasePtDto, user: Usuario) {
    if (!ROLES_REASIGNAN_PARES.includes(user?.role))
      throw new ForbiddenException('Solo gerencia puede pasar o liberar pares reservados');
    const reason = (dto.reason ?? '').trim();
    if (!reason) throw new BadRequestException('El motivo es obligatorio');
    if (toOpId != null && toOpId === fromOpId)
      throw new BadRequestException('El pedido destino tiene que ser otro');

    const { productoConfiguradoId, tallaId } = dto;
    const calidad = dto.calidad as Calidad;
    const opIds = toOpId != null ? [fromOpId, toOpId] : [fromOpId];

    return this.prisma.$transaction(async (tx) => {
      // Locks en orden canónico (ORDER BY id): primero las OP (su estado se valida acá
      // adentro, así un despacho o una anulación en paralelo no se cuela entre la
      // validación y la escritura); luego el saldo de PT, como el amarre de la OP; y
      // las tallas de las dos OP, para que una reserva concurrente de fabricación no
      // lea una necesidad a medio cambiar.
      await tx.$queryRaw`SELECT id FROM "OrdenProduccion" WHERE id IN (${Prisma.join(opIds)}) ORDER BY id FOR UPDATE`;
      const from = await this.opViva(tx, fromOpId);
      const to = toOpId != null ? await this.opViva(tx, toOpId) : null;

      await tx.$queryRaw`SELECT id FROM "InventarioPT" WHERE "productoConfiguradoId" = ${productoConfiguradoId} AND "tallaId" = ${tallaId} AND "calidad" = ${calidad}::"CalidadPT" ORDER BY id FOR UPDATE`;
      await tx.$queryRaw`SELECT olt.id FROM "OrdenProduccionLineaTalla" olt JOIN "OrdenProduccionLinea" ol ON ol.id = olt."opLineaId" WHERE ol."opId" IN (${Prisma.join(opIds)}) AND ol."productoConfiguradoId" = ${productoConfiguradoId} AND ol."calidad" = ${calidad}::"CalidadPT" AND olt."tallaId" = ${tallaId} ORDER BY olt.id FOR UPDATE`;

      const filasA = await this.tallasDe(tx, from.id, productoConfiguradoId, tallaId, calidad);
      if (filasA.length === 0)
        throw new BadRequestException(`OP-${from.consecutivo} no tiene ese producto en esa talla y calidad`);
      if (filasA.every((f: any) => reservedOf(f) === 0))
        throw new BadRequestException(`OP-${from.consecutivo} no tiene pares reservados de esa talla`);

      let filasB: any[] = [];
      if (to) {
        filasB = await this.tallasDe(tx, to.id, productoConfiguradoId, tallaId, calidad);
        if (filasB.length === 0)
          throw new BadRequestException(
            `OP-${to.consecutivo} no pidió ese producto en esa talla y calidad: no puede recibir esos pares`,
          );
      }

      let plan: ReturnType<typeof planMove>;
      try {
        plan = planMove(
          filasA.flatMap((f: any) =>
            (f.reservas ?? []).map((r: any) => ({
              reservaId: r.id,
              opLineaTallaId: f.id,
              inventarioPTId: r.inventarioPTId,
              cantidad: r.cantidad,
              prioridad: r.inventarioPT?.bodega?.prioridad ?? 100,
            })),
          ),
          to ? filasB.map((f: any) => ({ opLineaTallaId: f.id, pending: pendingOf(f) })) : null,
          dto.quantity,
        );
      } catch (e) {
        if (e instanceof ReassignmentError) throw new BadRequestException(e.message);
        throw e;
      }

      // 1) A suelta la reserva.
      const reservaPorId = new Map(filasA.flatMap((f: any) => f.reservas ?? []).map((r: any) => [r.id, r]));
      for (const t of plan.takes) {
        const r: any = reservaPorId.get(t.reservaId);
        if (r.cantidad === t.cantidad) await tx.reservaInventarioPT.delete({ where: { id: t.reservaId } });
        else await tx.reservaInventarioPT.update({ where: { id: t.reservaId }, data: { cantidad: { decrement: t.cantidad } } });
      }

      // 2) A queda debiendo: vuelve a programar lo cedido (solo primeras).
      if (calidad === 'PRIMERA') {
        const porFila = new Map<number, number>();
        for (const t of plan.takes) porFila.set(t.opLineaTallaId, (porFila.get(t.opLineaTallaId) ?? 0) + t.cantidad);
        for (const [id, c] of porFila)
          await tx.ordenProduccionLineaTalla.update({
            where: { id },
            data: { cantAProducir: { increment: c }, reassignedOut: { increment: c } },
          });
        // Si la OF de A ya se había cerrado, se reabre: sin esto los pares que debe no
        // pueden nacer (una OF TERMINADA no nace más pares y la OP no admite otra OF).
        // Se vuelve a cerrar sola cuando nazca y termine lo que falta (terminarEnTx).
        await tx.ordenFabricacion.updateMany({
          where: { opId: from.id, estado: 'TERMINADA' },
          data: { estado: 'EN_PROCESO' },
        });
      }

      if (to) {
        // 3) B toma la reserva sobre la misma fila de inventario.
        for (const g of plan.gives) {
          const existente = await tx.reservaInventarioPT.findFirst({
            where: { opLineaTallaId: g.opLineaTallaId, inventarioPTId: g.inventarioPTId },
          });
          if (existente)
            await tx.reservaInventarioPT.update({ where: { id: existente.id }, data: { cantidad: { increment: g.cantidad } } });
          else
            await tx.reservaInventarioPT.create({
              data: { opLineaTallaId: g.opLineaTallaId, inventarioPTId: g.inventarioPTId, cantidad: g.cantidad },
            });
        }
        // 4) B deja de programar lo que recibió hecho.
        if (calidad === 'PRIMERA') {
          const ocupados = await this.ocupadosEnPlanta(tx, to.id, productoConfiguradoId, tallaId);
          for (const s of planShiftToStock(filasB, ocupados, dto.quantity))
            await tx.ordenProduccionLineaTalla.update({
              where: { id: s.id },
              data: { cantAmarrada: { increment: s.cantidad }, cantAProducir: { decrement: s.cantidad } },
            });
        }
      } else {
        // Liberar: los pares quedan libres en su bodega.
        const porInv = new Map<number, number>();
        for (const t of plan.takes) porInv.set(t.inventarioPTId, (porInv.get(t.inventarioPTId) ?? 0) + t.cantidad);
        for (const [id, c] of porInv)
          await tx.inventarioPT.update({ where: { id }, data: { cantReservada: { decrement: c } } });
      }

      return tx.ptReassignment.create({
        data: {
          fromOpId: from.id,
          toOpId: to?.id ?? null,
          productoConfiguradoId,
          tallaId,
          calidad,
          quantity: dto.quantity,
          reason,
          userId: user.sub,
        },
      });
    });
  }

  /**
   * Para el diálogo: lo que la OP tiene reservado por producto × talla × calidad y,
   * para cada uno, los pedidos vivos que pueden recibirlo (tienen esa línea y les falta).
   */
  async options(opId: number) {
    const op = await this.prisma.ordenProduccion.findUnique({
      where: { id: opId },
      select: {
        id: true,
        estado: true,
        lineas: {
          select: {
            productoConfiguradoId: true,
            calidad: true,
            productoConfigurado: { select: { nombreComercial: true } },
            tallas: {
              select: { tallaId: true, talla: { select: { valor: true } }, reservas: { select: { cantidad: true } } },
            },
          },
        },
      },
    });
    if (!op) throw new NotFoundException(`OP ${opId} no existe`);

    const grupos = new Map<string, any>();
    for (const l of op.lineas) {
      for (const t of l.tallas) {
        const reservado = reservedOf(t);
        if (reservado <= 0) continue;
        const k = `${l.productoConfiguradoId}|${t.tallaId}|${l.calidad}`;
        const g = grupos.get(k) ?? {
          productoConfiguradoId: l.productoConfiguradoId,
          producto: l.productoConfigurado?.nombreComercial ?? '',
          tallaId: t.tallaId,
          talla: t.talla?.valor ?? null,
          calidad: l.calidad,
          reservado: 0,
          targets: [] as any[],
        };
        g.reservado += reservado;
        grupos.set(k, g);
      }
    }
    if (grupos.size === 0 || !(ESTADOS_VIVOS as readonly string[]).includes(op.estado)) return [...grupos.values()];

    const candidatas = await this.prisma.ordenProduccionLineaTalla.findMany({
      where: {
        tallaId: { in: [...new Set([...grupos.values()].map((g) => g.tallaId))] },
        opLinea: {
          opId: { not: opId },
          productoConfiguradoId: { in: [...new Set([...grupos.values()].map((g) => g.productoConfiguradoId))] },
          op: { estado: { in: [...ESTADOS_VIVOS] } },
        },
      },
      select: {
        tallaId: true,
        cantAmarrada: true,
        cantAProducir: true,
        reassignedOut: true,
        dispatched: true,
        reservas: { select: { cantidad: true } },
        opLinea: {
          select: {
            productoConfiguradoId: true,
            calidad: true,
            op: {
              select: {
                id: true,
                consecutivo: true,
                oc: { select: { consecutivo: true, ocCliente: true, cliente: { select: { nombre: true } } } },
              },
            },
          },
        },
      },
    });
    for (const c of candidatas) {
      const g = grupos.get(`${c.opLinea.productoConfiguradoId}|${c.tallaId}|${c.opLinea.calidad}`);
      if (!g) continue;
      const pendiente = pendingOf(c);
      if (pendiente <= 0) continue;
      const op = c.opLinea.op;
      const prev = g.targets.find((x: any) => x.opId === op.id);
      if (prev) prev.pendiente += pendiente;
      else
        g.targets.push({
          opId: op.id,
          opConsecutivo: op.consecutivo,
          ocConsecutivo: op.oc?.consecutivo ?? null,
          ocCliente: op.oc?.ocCliente ?? null,
          cliente: op.oc?.cliente?.nombre ?? '',
          pendiente,
        });
    }
    for (const g of grupos.values()) g.targets.sort((a: any, b: any) => a.opConsecutivo - b.opConsecutivo);
    return [...grupos.values()];
  }

  /** Historial de la OP: lo que cedió, liberó y recibió, lo más reciente primero. */
  history(opId: number) {
    const opRef = { select: { id: true, consecutivo: true, oc: { select: { consecutivo: true, cliente: { select: { nombre: true } } } } } };
    return this.prisma.ptReassignment.findMany({
      where: { OR: [{ fromOpId: opId }, { toOpId: opId }] },
      orderBy: { createdAt: 'desc' },
      include: {
        fromOp: opRef,
        toOp: opRef,
        productoConfigurado: { select: { nombreComercial: true } },
        talla: { select: { valor: true } },
        user: { select: { username: true } },
      },
    });
  }

  private async opViva(tx: any, id: number) {
    const op = await tx.ordenProduccion.findUnique({
      where: { id },
      select: { id: true, consecutivo: true, estado: true },
    });
    if (!op) throw new NotFoundException(`OP ${id} no existe`);
    if (!(ESTADOS_VIVOS as readonly string[]).includes(op.estado))
      throw new BadRequestException(`OP-${op.consecutivo} está ${op.estado.toLowerCase()}: no puede ceder ni recibir pares`);
    return op;
  }

  private tallasDe(tx: any, opId: number, productoConfiguradoId: number, tallaId: number, calidad: Calidad) {
    return tx.ordenProduccionLineaTalla.findMany({
      where: { tallaId, opLinea: { opId, productoConfiguradoId, calidad } },
      orderBy: { id: 'asc' },
      include: { reservas: { orderBy: { id: 'asc' }, include: { inventarioPT: { include: { bodega: true } } } } },
    });
  }

  /** Lo que ya nació en planta para la OP en esa talla: pares vivos + etiquetas impresas sin nacer. */
  private async ocupadosEnPlanta(tx: any, opId: number, productoConfiguradoId: number, tallaId: number) {
    const [pares, etiquetas] = await Promise.all([
      tx.par.count({
        where: { of: { opId }, productoConfiguradoId, tallaId, reponeAParId: null, estado: { not: 'CANCELADO' } },
      }),
      tx.etiquetaReservada.count({
        where: { of: { opId }, productoConfiguradoId, tallaId, parId: null, anulada: false },
      }),
    ]);
    return pares + etiquetas;
  }
}
