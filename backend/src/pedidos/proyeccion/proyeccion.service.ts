import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CAPACIDAD_AGRO, PLAZO_ENTREGA_DIAS } from './capacidad-planta';
import { EntradaProyeccion, PedidoEntrada, Proyeccion, proyectarPedidos } from './proyeccion-core';
import { DeliveryEstimate, estimateDelivery } from './delivery-estimate';
import { DeliveryEstimateDto } from './dto/delivery-estimate.dto';
import { pendingToProduce } from '../op/op-need';

/** 'YYYY-MM-DD' en hora Colombia (UTC-5, sin horario de verano). */
export function claveColombia(d: Date): string {
  return new Date(d.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

@Injectable()
export class ProyeccionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Proyección de los pedidos vivos (confirmados o en producción) contra la capacidad
   * de la planta. Solo lee: no reserva ni programa nada.
   */
  async proyectar(ahora: Date = new Date()): Promise<Proyeccion> {
    const { entrada } = await this.cargarEntrada(ahora);
    return proyectarPedidos(entrada);
  }

  /**
   * Fecha de entrega sugerida para un pedido que se está montando: la misma
   * proyección con el borrador de último en la cola. Solo lee.
   */
  async estimarEntrega(dto: DeliveryEstimateDto, ahora: Date = new Date()): Promise<DeliveryEstimate> {
    const { entrada, valorTalla } = await this.cargarEntrada(ahora);
    return estimateDelivery(entrada, {
      paraStock: !!dto.paraStock,
      renglones: dto.lineas.flatMap((l) =>
        l.tallas.map((t) => ({
          productoConfiguradoId: l.productoConfiguradoId,
          producto: `Producto ${l.productoConfiguradoId}`,
          referencia: null,
          marca: null,
          talla: valorTalla.get(t.tallaId) ?? 0,
          calidad: l.calidad ?? 'PRIMERA',
          pedida: t.cantidad,
        })),
      ),
    });
  }

  /** Pedidos vivos, bodega, calendario y capacidad: la entrada de la proyección. */
  private async cargarEntrada(ahora: Date): Promise<{ entrada: EntradaProyeccion; valorTalla: Map<number, number> }> {
    const hoy = claveColombia(ahora);
    const [ocs, stock, calLaboral, noHabiles] = await Promise.all([
      this.prisma.ordenCompra.findMany({
        where: { estado: { in: ['CONFIRMADA', 'EN_PRODUCCION'] } },
        orderBy: { consecutivo: 'asc' },
        select: {
          id: true,
          consecutivo: true,
          ocCliente: true,
          fecha: true,
          fechaConfirmacion: true,
          paraStock: true,
          fechaEntrega: true,
          cliente: { select: { nombre: true } },
          lineas: {
            select: {
              productoConfiguradoId: true,
              calidad: true,
              productoConfigurado: {
                select: {
                  nombreComercial: true,
                  referencia: { select: { codigo: true } },
                  marca: { select: { nombre: true } },
                },
              },
              tallas: { select: { cantidad: true, talla: { select: { id: true, valor: true } } } },
            },
          },
          ordenProduccion: {
            select: {
              id: true,
              estado: true,
              lineas: {
                select: {
                  productoConfiguradoId: true,
                  calidad: true,
                  tallas: {
                    select: {
                      tallaId: true,
                      cantAmarrada: true,
                      cantAProducir: true,
                      reassignedOut: true,
                      // Lo que ya salió en despachos parciales no se vuelve a fabricar.
                      dispatched: true,
                      reservas: { select: { cantidad: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.inventarioPT.groupBy({
        by: ['productoConfiguradoId', 'tallaId', 'calidad'],
        _sum: { cantDisponible: true, cantReservada: true },
      }),
      this.prisma.calendarioLaboral.findUnique({ where: { id: 1 } }),
      this.prisma.diaNoHabil.findMany({
        where: { fecha: { gte: new Date(`${hoy}T00:00:00Z`) } },
        select: { fecha: true },
      }),
    ]);

    const [tallas, productos] = await Promise.all([
      this.prisma.talla.findMany({ select: { id: true, valor: true } }),
      this.prisma.productoConfigurado.findMany({
        where: { id: { in: [...new Set(stock.map((s) => s.productoConfiguradoId))] } },
        select: { id: true, nombreComercial: true, referencia: { select: { codigo: true } }, marca: { select: { nombre: true } } },
      }),
    ]);
    const valorTalla = new Map(tallas.map((t) => [t.id, t.valor]));
    const producto = new Map(productos.map((p) => [p.id, p]));

    const pedidos: PedidoEntrada[] = [];
    for (const oc of ocs) {
      const op = oc.ordenProduccion;
      // Una OP despachada ya salió; una anulada deja el pedido como si no tuviera OP.
      if (op?.estado === 'DESPACHADA') continue;
      const opViva = op && op.estado !== 'ANULADA' ? op : null;

      // Lo que la OP todavía debe fabricar = lo que necesita menos lo que ya tiene
      // reservado en bodega (mismo cálculo que el despacho). Hasta el 2026-11-19 era
      // `cantAProducir − pares TERMINADOS de su OF`, que no ve la reasignación de
      // gerencia: el pedido que cedía pares seguía contando como hechos los que se
      // fueron, y el que los recibía los volvía a poner a producir.
      const pendienteOP = new Map<string, number>();
      if (opViva) {
        for (const l of opViva.lineas) {
          for (const t of l.tallas) {
            const k = `${l.productoConfiguradoId}|${t.tallaId}|${l.calidad}`;
            pendienteOP.set(k, (pendienteOP.get(k) ?? 0) + pendingToProduce(l.calidad, t));
          }
        }
      }

      pedidos.push({
        ocId: oc.id,
        consecutivo: oc.consecutivo,
        cliente: oc.cliente.nombre,
        ocCliente: oc.ocCliente,
        fechaBase: claveColombia(oc.fechaConfirmacion ?? oc.fecha),
        fechaEntrega: oc.fechaEntrega ? oc.fechaEntrega.toISOString().slice(0, 10) : null,
        tieneOP: !!opViva,
        paraStock: oc.paraStock,
        renglones: oc.lineas.flatMap((l) =>
          l.tallas.map((t) => ({
            productoConfiguradoId: l.productoConfiguradoId,
            producto: l.productoConfigurado.nombreComercial,
            referencia: l.productoConfigurado.referencia?.codigo ?? null,
            marca: l.productoConfigurado.marca?.nombre ?? null,
            talla: t.talla.valor,
            calidad: l.calidad,
            pedida: t.cantidad,
            pendienteOP: opViva
              ? pendienteOP.get(`${l.productoConfiguradoId}|${t.talla.id}|${l.calidad}`) ?? 0
              : undefined,
          })),
        ),
      });
    }

    const entrada: EntradaProyeccion = {
      hoy,
      // Sin calendario configurado: lunes a sábado (la planta trabaja sábados).
      calendario: {
        diasSemana: calLaboral
          ? [calLaboral.domingo, calLaboral.lunes, calLaboral.martes, calLaboral.miercoles, calLaboral.jueves, calLaboral.viernes, calLaboral.sabado]
          : [false, true, true, true, true, true, true],
        noHabiles: noHabiles.map((d) => d.fecha.toISOString().slice(0, 10)),
      },
      capacidad: CAPACIDAD_AGRO,
      plazoDias: PLAZO_ENTREGA_DIAS,
      pedidos,
      stock: stock.map((s) => ({
        productoConfiguradoId: s.productoConfiguradoId,
        producto: producto.get(s.productoConfiguradoId)?.nombreComercial,
        referencia: producto.get(s.productoConfiguradoId)?.referencia?.codigo ?? null,
        marca: producto.get(s.productoConfiguradoId)?.marca?.nombre ?? null,
        talla: valorTalla.get(s.tallaId) ?? 0,
        calidad: s.calidad,
        libre: (s._sum.cantDisponible ?? 0) - (s._sum.cantReservada ?? 0),
      })),
    };
    return { entrada, valorTalla };
  }
}
