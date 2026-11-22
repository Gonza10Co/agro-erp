import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DISPATCH_SUMMARY_SELECT, dispatchSummary } from '../../despachos/dispatch-summary';
import { PrismaService } from '../../prisma/prisma.service';
import { siguienteConsecutivo } from '../../prisma/consecutivo';
import { CrearOCDto } from './dto/crear-oc.dto';
import { ActualizarOCDto } from './dto/actualizar-oc.dto';
import { validarConfirmacionOC, OCParaValidar } from './oc-validacion';
import { estadoDemora } from './oc-demora';
import { resolverDestinoOC } from './oc-destino';
import { elegirSedePorDefecto } from '../../clientes/sedes-core';
import { aplanarPedidos, PedidosExport } from './oc-export';
import { OC_UNCONFIRMABLE_STATES, unconfirmBlockers } from './oc-unconfirm';
import { liberarReservasDeOp } from '../../compras/reserva-insumos';
import { PtHold, releasePtHolds } from '../op/release-pt-holds';

/** 'YYYY-MM-DD' → día calendario (medianoche UTC, como guarda @db.Date). undefined no toca. */
function aFecha(s: string | null | undefined): Date | null | undefined {
  if (s === undefined) return undefined;
  if (s === null || s === '') return null;
  return new Date(`${s.slice(0, 10)}T00:00:00Z`);
}

/** Como aFecha, pero el día en que el cliente puso el pedido no puede ser futuro (hora Colombia, UTC-5). */
function aFechaPedidoCliente(s: string | null | undefined, ahora = new Date()): Date | null | undefined {
  const f = aFecha(s);
  if (!f) return f;
  const hoy = new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
  if (f.toISOString().slice(0, 10) > hoy) {
    throw new BadRequestException('La fecha del pedido del cliente no puede ser futura');
  }
  return f;
}

@Injectable()
export class OcService {
  private readonly logger = new Logger(OcService.name);
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearOCDto) {
    // nextval + create en la misma tx: si el create falla no queda hueco evitable.
    return this.prisma.$transaction(async (tx) => {
      const consecutivo = await siguienteConsecutivo(tx, 'oc');
      const { sedeEntregaId, direccionDespacho } = await this.resolverDestino(
        tx,
        dto.clienteId,
        dto,
      );
      const lineaId = await this.resolverLinea(tx, dto.lineaId);
      return tx.ordenCompra.create({
        data: {
          consecutivo,
          clienteId: dto.clienteId,
          ocCliente: dto.ocCliente,
          observaciones: dto.observaciones,
          sedeEntregaId,
          direccionDespacho,
          lineaId,
          paraStock: dto.paraStock ?? false,
          fechaEntrega: aFecha(dto.fechaEntrega),
          fechaPedidoCliente: aFechaPedidoCliente(dto.fechaPedidoCliente),
          estado: 'BORRADOR',
          lineas: {
            create: dto.lineas.map((l) => ({
              productoConfiguradoId: l.productoConfiguradoId,
              // Grado pedido: define de qué saldo amarra la OP y a qué precio se factura.
              calidad: l.calidad ?? 'PRIMERA',
              precioUnitario: l.precioUnitario,
              tallas: {
                create: l.tallas.map((t) => ({
                  tallaId: t.tallaId,
                  cantidad: t.cantidad,
                })),
              },
            })),
          },
        },
        include: { lineas: { include: { tallas: true } } },
      });
    });
  }

  // Edición de una OC en BORRADOR: reemplaza cabecera y líneas en una transacción.
  // Una OC ya CONFIRMADA (o en estados posteriores) no se edita: solo se anula.
  async actualizar(id: number, dto: ActualizarOCDto) {
    const oc = await this.prisma.ordenCompra.findUnique({ where: { id } });
    if (!oc) throw new NotFoundException(`OC ${id} no existe`);
    if (oc.estado !== 'BORRADOR') {
      throw new BadRequestException(
        'Solo se puede editar una OC en estado BORRADOR',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.ordenCompraLineaTalla.deleteMany({ where: { ocLinea: { ocId: id } } });
      await tx.ordenCompraLinea.deleteMany({ where: { ocId: id } });
      const { sedeEntregaId, direccionDespacho } = await this.resolverDestino(
        tx,
        dto.clienteId,
        dto,
      );
      // undefined no toca la línea: la edición actual del drawer no la reenvía.
      const lineaId = await this.resolverLinea(tx, dto.lineaId);
      return tx.ordenCompra.update({
        where: { id },
        data: {
          clienteId: dto.clienteId,
          ocCliente: dto.ocCliente,
          observaciones: dto.observaciones,
          sedeEntregaId,
          direccionDespacho,
          lineaId,
          // undefined no lo toca (el drawer viejo no lo reenvía).
          paraStock: dto.paraStock,
          fechaEntrega: aFecha(dto.fechaEntrega),
          fechaPedidoCliente: aFechaPedidoCliente(dto.fechaPedidoCliente),
          lineas: {
            create: dto.lineas.map((l) => ({
              productoConfiguradoId: l.productoConfiguradoId,
              // Grado pedido: define de qué saldo amarra la OP y a qué precio se factura.
              calidad: l.calidad ?? 'PRIMERA',
              precioUnitario: l.precioUnitario,
              tallas: {
                create: l.tallas.map((t) => ({
                  tallaId: t.tallaId,
                  cantidad: t.cantidad,
                })),
              },
            })),
          },
        },
        include: { lineas: { include: { tallas: true } } },
      });
    });
  }

  // Un borrador es una cotización: si el negocio no se cierra, se elimina del todo.
  // Solo BORRADOR — nada cuelga de él todavía (la OP nace al confirmar).
  async eliminar(id: number) {
    const oc = await this.prisma.ordenCompra.findUnique({ where: { id } });
    if (!oc) throw new NotFoundException(`OC ${id} no existe`);
    if (oc.estado !== 'BORRADOR') {
      throw new BadRequestException(
        'Solo se puede eliminar una OC en estado BORRADOR',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.ordenCompraLineaTalla.deleteMany({ where: { ocLinea: { ocId: id } } });
      await tx.ordenCompraLinea.deleteMany({ where: { ocId: id } });
      await tx.ordenCompra.delete({ where: { id } });
    });
  }

  /**
   * Línea de producción del pedido (línea por pedido: el mapeo marca→línea no es
   * fijo). Una línea elegida a mano tiene que existir y estar activa.
   */
  private async resolverLinea(
    tx: Pick<PrismaService, 'linea'>,
    lineaId?: number,
  ): Promise<number | undefined> {
    if (lineaId == null) return undefined;
    const linea = await tx.linea.findFirst({ where: { id: lineaId, activo: true } });
    if (!linea)
      throw new BadRequestException(`La línea ${lineaId} no existe o está inactiva`);
    return lineaId;
  }

  /**
   * Destino del pedido. Una sede elegida a mano tiene que ser del propio cliente y estar
   * activa; si no, el pedido terminaría despachándose a la bodega de otro.
   */
  private async resolverDestino(
    tx: Pick<PrismaService, 'sedeCliente'>,
    clienteId: number,
    dto: { sedeEntregaId?: number; direccionDespacho?: string },
  ) {
    const sedes = await tx.sedeCliente.findMany({ where: { clienteId } });

    let sedeElegida: (typeof sedes)[number] | null = null;
    if (dto.sedeEntregaId != null) {
      sedeElegida = sedes.find((s) => s.id === dto.sedeEntregaId && s.activo) ?? null;
      if (!sedeElegida)
        throw new BadRequestException(
          `La sede ${dto.sedeEntregaId} no pertenece al cliente ${clienteId} o está inactiva`,
        );
    }

    return resolverDestinoOC({
      sedeElegida,
      sedePrincipal: elegirSedePorDefecto(sedes),
      direccionManual: dto.direccionDespacho,
    });
  }

  /** La fecha prometida se mueve en cualquier estado: el cliente la renegocia con la OP andando. */
  async cambiarFechaEntrega(id: number, fechaEntrega: string | null) {
    const oc = await this.prisma.ordenCompra.findUnique({ where: { id } });
    if (!oc) throw new NotFoundException(`OC ${id} no existe`);
    if (oc.estado === 'ANULADA') {
      throw new BadRequestException('Un pedido anulado no tiene fecha de entrega');
    }
    return this.prisma.ordenCompra.update({
      where: { id },
      data: { fechaEntrega: aFecha(fechaEntrega) ?? null },
    });
  }

  /** El día en que el cliente puso el pedido se corrige en cualquier estado, salvo anulado. */
  async cambiarFechaPedidoCliente(id: number, fechaPedidoCliente: string | null) {
    const oc = await this.prisma.ordenCompra.findUnique({ where: { id } });
    if (!oc) throw new NotFoundException(`OC ${id} no existe`);
    if (oc.estado === 'ANULADA') {
      throw new BadRequestException('Un pedido anulado no se edita');
    }
    return this.prisma.ordenCompra.update({
      where: { id },
      data: { fechaPedidoCliente: aFechaPedidoCliente(fechaPedidoCliente) ?? null },
    });
  }

  async confirmar(id: number) {
    const oc = await this.prisma.ordenCompra.findUnique({
      where: { id },
      include: {
        cliente: true,
        lineas: {
          include: {
            productoConfigurado: {
              include: {
                referencia: { include: { tallaMin: true, tallaMax: true } },
              },
            },
            tallas: { include: { talla: true } },
          },
        },
      },
    });
    if (!oc) throw new NotFoundException(`OC ${id} no existe`);

    const paraValidar: OCParaValidar = {
      estado: oc.estado,
      clienteActivo: oc.cliente.activo,
      lineas: oc.lineas.map((l) => ({
        tallas: l.tallas.map((t) => ({
          tallaValor: t.talla.valor,
          cantidad: t.cantidad,
          refTallaMin: l.productoConfigurado.referencia.tallaMin.valor,
          refTallaMax: l.productoConfigurado.referencia.tallaMax.valor,
        })),
      })),
    };

    const errores = validarConfirmacionOC(paraValidar);
    if (errores.length > 0) throw new BadRequestException(errores);

    return this.prisma.ordenCompra.update({
      where: { id },
      // Se sella la fecha de confirmación: desde acá corre el reloj de demora.
      data: { estado: 'CONFIRMADA', fechaConfirmacion: new Date() },
    });
  }

  /**
   * Devolver a borrador una OC confirmada (se confirmó con un error). Deshace en UNA
   * transacción lo que hicieron confirmar + generar OP: suelta el amarre de PT y de
   * insumos, borra el requerimiento automático, las OF vacías y la OP, y deja la OC
   * en BORRADOR sin fecha de confirmación (al reconfirmar el reloj arranca de nuevo).
   *
   * La OP se BORRA y no se anula: `OrdenProduccion.ocId` es único, así que una OP
   * anulada impediría generar la nueva al reconfirmar. Por eso solo se permite si
   * nada arrancó físicamente (ver unconfirmBlockers): sin pares, etiquetas, consumo,
   * corte, despachos, facturas, pases de pares ni OCP, no hay historia que perder.
   * Ninguna reserva es movimiento de kardex: soltarlas no toca el kardex.
   */
  async unconfirm(id: number, userId: number | null) {
    const cambio = 'El pedido cambió mientras se devolvía a borrador, vuelve a intentar';
    const result = await this.prisma.$transaction(async (tx) => {
      // Mismo orden de locks que el despacho y el pase de pares: OP antes que inventario.
      await tx.$queryRaw`SELECT id FROM "OrdenCompra" WHERE id = ${id} FOR UPDATE`;
      const oc = await tx.ordenCompra.findUnique({ where: { id } });
      if (!oc) throw new NotFoundException(`OC ${id} no existe`);
      if (!(OC_UNCONFIRMABLE_STATES as readonly string[]).includes(oc.estado)) {
        throw new BadRequestException(
          oc.estado === 'BORRADOR'
            ? 'El pedido ya está en borrador'
            : 'Solo un pedido confirmado o en producción se puede devolver a borrador',
        );
      }

      const opRow = await tx.ordenProduccion.findUnique({ where: { ocId: id }, select: { id: true } });
      let opNumber: number | null = null;
      if (opRow) {
        await tx.$queryRaw`SELECT id FROM "OrdenProduccion" WHERE id = ${opRow.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "OrdenFabricacion" WHERE "opId" = ${opRow.id} ORDER BY id FOR UPDATE`;
        const op = await tx.ordenProduccion.findUnique({
          where: { id: opRow.id },
          include: {
            lineas: { include: { tallas: { include: { reservas: true } } } },
            despachos: { select: { consecutivo: true, factura: { select: { consecutivo: true } } } },
            ordenesFabricacion: {
              select: {
                id: true,
                consecutivo: true,
                estado: true,
                lineasCorte: { select: { ordenCorte: { select: { codigo: true } } } },
                _count: { select: { pares: true, etiquetasReservadas: true, movimientos: true } },
              },
            },
            requerimientos: { select: { id: true, consecutivo: true, ordenesCompra: { select: { consecutivo: true } } } },
            _count: { select: { ptReassignmentsOut: true, ptReassignmentsIn: true } },
          },
        });
        if (!op) throw new ConflictException(cambio);
        const tallas = op.lineas.flatMap((l) => l.tallas);
        const motivos = unconfirmBlockers({
          despachos: op.despachos,
          ofs: op.ordenesFabricacion.map((f) => ({
            consecutivo: f.consecutivo,
            estado: f.estado,
            pares: f._count.pares,
            etiquetasReservadas: f._count.etiquetasReservadas,
            movimientos: f._count.movimientos,
            ordenesCorte: [...new Set(f.lineasCorte.map((c) => c.ordenCorte.codigo))],
          })),
          ptReassignmentsOut: op._count.ptReassignmentsOut,
          ptReassignmentsIn: op._count.ptReassignmentsIn,
          tallas,
          requerimientos: op.requerimientos,
        });
        if (motivos.length > 0) {
          throw new ConflictException(`No se puede devolver a borrador: ${motivos.join('. ')}.`);
        }

        // 1) Amarre de PT: vuelve al disponible de cada fila de bodega.
        const holds: PtHold[] = tallas.flatMap((t) => t.reservas);
        await releasePtHolds(tx, holds, tallas.map((t) => t.id), cambio);
        // 2) Amarre de insumos (MP): vuelve al neto disponible, y el requerimiento
        //    automático (y los recalculados, ya liberados) se borra: nunca llegó a OCP.
        await liberarReservasDeOp(tx, op.id);
        const reqIds = op.requerimientos.map((r) => r.id);
        if (reqIds.length > 0) {
          await tx.requerimientoCompraLinea.deleteMany({ where: { requerimientoId: { in: reqIds } } });
          await tx.requerimientoCompra.deleteMany({ where: { id: { in: reqIds } } });
        }
        // 3) OF vacías (sin pares, etiquetas, consumo ni corte) y la OP con sus líneas.
        await tx.ordenFabricacion.deleteMany({ where: { opId: op.id } });
        await tx.ordenProduccionLineaTalla.deleteMany({ where: { opLinea: { opId: op.id } } });
        await tx.ordenProduccionLinea.deleteMany({ where: { opId: op.id } });
        await tx.ordenProduccion.delete({ where: { id: op.id } });
        opNumber = op.consecutivo;
      }

      const updated = await tx.ordenCompra.update({
        where: { id },
        data: {
          estado: 'BORRADOR',
          fechaConfirmacion: null,
          unconfirmedAt: new Date(),
          unconfirmedById: userId,
          unconfirmedOpNumber: opNumber,
        },
      });
      return { updated, opNumber };
    });
    this.logger.log(
      `OC-${result.updated.consecutivo} devuelta a borrador por el usuario ${userId ?? '?'}` +
        (result.opNumber != null ? ` (se borró la OP-${result.opNumber})` : ''),
    );
    return result.updated;
  }

  async listar() {
    const ocs = await this.prisma.ordenCompra.findMany({
      orderBy: { consecutivo: 'desc' },
      include: {
        cliente: { select: { id: true, nit: true, nombre: true, estadoCartera: true } },
        linea: { select: { id: true, codigo: true, nombre: true } },
        ordenProduccion: {
          // Conteo de despachos y tallas en la misma consulta: el chip "Despacho
          // parcial" de la lista sale de acá sin una consulta por pedido.
          select: { id: true, consecutivo: true, estado: true, ...DISPATCH_SUMMARY_SELECT },
        },
      },
    });
    // El semáforo de demora se calcula al vuelo (no se persiste): días desde la
    // confirmación cruzados con la cartera del cliente.
    const ahora = new Date();
    return ocs.map((oc) => {
      const demora = estadoDemora(oc.fechaConfirmacion, ahora, oc.cliente.estadoCartera, oc.estado);
      const op = oc.ordenProduccion;
      return {
        ...oc,
        // Las tallas solo sirven para el resumen: no viajan a la lista.
        ordenProduccion: op ? { id: op.id, consecutivo: op.consecutivo, estado: op.estado } : null,
        dispatch: op ? dispatchSummary(op) : null,
        diasDemora: demora.dias,
        estadoDemora: demora.estado,
      };
    });
  }

  /**
   * Todos los pedidos (también anulados) aplanados para Excel/Power Query.
   * Una sola consulta con los include; el aplanado vive en oc-export.ts.
   */
  async exportar(): Promise<PedidosExport> {
    const ocs = await this.prisma.ordenCompra.findMany({
      orderBy: { consecutivo: 'asc' },
      include: {
        cliente: { select: { nit: true, nombre: true } },
        sedeEntrega: { select: { nombre: true, ciudad: true } },
        linea: { select: { nombre: true } },
        lineas: {
          orderBy: { id: 'asc' },
          include: {
            productoConfigurado: {
              select: {
                codigo: true,
                nombreComercial: true,
                referencia: { select: { codigo: true } },
                marca: { select: { nombre: true } },
              },
            },
            tallas: { include: { talla: { select: { valor: true, orden: true } } } },
          },
        },
        ordenProduccion: {
          select: {
            consecutivo: true,
            estado: true,
            lineas: {
              select: {
                productoConfiguradoId: true,
                calidad: true,
                tallas: { select: { cantAmarrada: true, cantAProducir: true, talla: { select: { valor: true } } } },
              },
            },
            // Una OP puede tener varios despachos (parciales): suman todos.
            despachos: {
              select: {
                lineas: {
                  select: { productoConfiguradoId: true, calidad: true, cantidad: true, talla: { select: { valor: true } } },
                },
              },
            },
          },
        },
      },
    });
    return aplanarPedidos(ocs);
  }

  async obtener(id: number) {
    const oc = await this.prisma.ordenCompra.findUnique({
      where: { id },
      include: {
        cliente: true,
        linea: { select: { id: true, codigo: true, nombre: true } },
        ordenProduccion: {
          select: { id: true, consecutivo: true, estado: true },
        },
        lineas: {
          include: {
            productoConfigurado: true,
            tallas: {
              include: { talla: true },
              orderBy: { talla: { orden: 'asc' } },
            },
          },
        },
      },
    });
    if (!oc) throw new NotFoundException(`OC ${id} no existe`);
    return oc;
  }
}
