import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CAPACIDAD_AGRO, PLAZO_ENTREGA_DIAS } from './capacidad-planta';
import { PedidoEntrada, Proyeccion, proyectarPedidos } from './proyeccion-core';

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
    const hoy = claveColombia(ahora);
    const [ocs, stock, terminados, calLaboral, noHabiles] = await Promise.all([
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
                  tallas: { select: { tallaId: true, cantAProducir: true } },
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
      // Lo que cada OP ya terminó: se resta de lo que le falta por fabricar.
      this.prisma.par.findMany({
        where: { estado: 'TERMINADO', of: { op: { estado: { in: ['CREADA', 'AMARRADA', 'EN_PRODUCCION'] } } } },
        select: { productoConfiguradoId: true, tallaId: true, of: { select: { opId: true } } },
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

    const hechos = new Map<string, number>();
    for (const p of terminados) {
      const k = `${p.of.opId}|${p.productoConfiguradoId}|${p.tallaId}`;
      hechos.set(k, (hechos.get(k) ?? 0) + 1);
    }

    const pedidos: PedidoEntrada[] = [];
    for (const oc of ocs) {
      const op = oc.ordenProduccion;
      // Una OP despachada ya salió; una anulada deja el pedido como si no tuviera OP.
      if (op?.estado === 'DESPACHADA') continue;
      const opViva = op && op.estado !== 'ANULADA' ? op : null;

      const pendienteOP = new Map<string, number>();
      if (opViva) {
        for (const l of opViva.lineas) {
          for (const t of l.tallas) {
            const k = `${l.productoConfiguradoId}|${t.tallaId}|${l.calidad}`;
            const hecho = hechos.get(`${opViva.id}|${l.productoConfiguradoId}|${t.tallaId}`) ?? 0;
            pendienteOP.set(k, (pendienteOP.get(k) ?? 0) + Math.max(0, t.cantAProducir - hecho));
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

    return proyectarPedidos({
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
    });
  }
}
