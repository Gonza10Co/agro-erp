import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { siguienteConsecutivo } from '../prisma/consecutivo';
import { FacturarDto } from './dto/facturar.dto';
import { FacturarServicioDto } from './dto/facturar-servicio.dto';
import { clavePrecio, lineasDeFactura, lineasDeServicio, totales } from './factura-core';
import { diasCredito } from '../cartera/cartera-core';
import { recalcularEstadoCartera } from '../cartera/recalcular-cartera';

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
        op: { include: { oc: { include: { lineas: true, cliente: true } } } },
      },
    });
    if (!despacho)
      throw new NotFoundException(`Despacho ${dto.despachoId} no existe`);
    if (despacho.factura)
      throw new BadRequestException('El despacho ya fue facturado');

    // Precio pactado por (producto, GRADO) desde las líneas de la OC: la segunda
    // se vendió a otro precio y tiene su propia línea en el pedido.
    const precioPorProducto = new Map<string, number>();
    for (const l of despacho.op.oc.lineas) {
      if (l.precioUnitario != null)
        precioPorProducto.set(clavePrecio(l.productoConfiguradoId, l.calidad), Number(l.precioUnitario));
    }
    const sinPrecio = despacho.lineas
      .filter((l: any) => !precioPorProducto.has(clavePrecio(l.productoConfiguradoId, l.calidad ?? 'PRIMERA')))
      .map((l: any) => `${l.productoConfiguradoId} (${l.calidad ?? 'PRIMERA'})`);
    if (sinPrecio.length > 0)
      throw new BadRequestException(
        `Productos despachados sin precio pactado en la OC: ${[...new Set(sinPrecio)].join(', ')}`,
      );

    const lineas = lineasDeFactura(despacho.lineas, precioPorProducto);
    const t = totales(lineas, ivaPct);

    // Vencimiento = fecha de emisión + días de crédito del cliente.
    const cliente = despacho.op.oc.cliente;
    const fecha = new Date();
    const fechaVencimiento = new Date(fecha);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + diasCredito(cliente.tipoCredito));

    return this.prisma.$transaction(async (tx) => {
      const consecutivo = await siguienteConsecutivo(tx, 'factura');
      const factura = await tx.factura.create({
        data: {
          consecutivo,
          tipo: 'PRODUCTO',
          despachoId: despacho.id,
          clienteId: cliente.id,
          // La línea del pedido también viaja a la factura: así el reporte por
          // línea no depende de navegar despacho→op para las de producto.
          lineaId: despacho.op.lineaId ?? null,
          fecha,
          fechaVencimiento,
          ivaPct,
          subtotal: t.subtotal,
          iva: t.iva,
          total: t.total,
          lineas: {
            create: lineas.map((l) => ({
              productoConfiguradoId: l.productoConfiguradoId,
              tallaId: l.tallaId,
              calidad: l.calidad,
              cantidad: l.cantidad,
              precioUnitario: l.precioUnitario,
              subtotal: l.subtotal,
            })),
          },
        },
      });
      // Emitir una CxC puede cambiar el estado de cartera del cliente.
      await recalcularEstadoCartera(tx, cliente.id, fecha);
      return factura;
    });
  }

  /**
   * Factura de SERVICIO: maquila (la inyección que se le presta a la capellada de
   * Bogotá) o mantenimiento. No hay despacho ni pares que descargar — es una línea
   * de ingreso aparte. Reusa el consecutivo de facturas para no partir la
   * numeración, y entra a cartera como cualquier otra CxC.
   */
  async facturarServicio(dto: FacturarServicioDto) {
    const ivaPct = dto.ivaPct ?? 19;
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: dto.clienteId },
      select: { id: true, tipoCredito: true, activo: true },
    });
    if (!cliente) throw new NotFoundException(`Cliente ${dto.clienteId} no existe`);
    if (!cliente.activo) throw new BadRequestException('El cliente está inactivo');

    if (dto.lineaId != null) {
      const linea = await this.prisma.linea.findUnique({
        where: { id: dto.lineaId },
        select: { activo: true },
      });
      if (!linea) throw new NotFoundException(`Línea ${dto.lineaId} no existe`);
      if (!linea.activo) throw new BadRequestException('La línea está inactiva');
    }

    const servicioIds = dto.lineas.map((l) => l.servicioId).filter((x): x is number => x != null);
    if (servicioIds.length) {
      const encontrados = await this.prisma.servicioCatalogo.findMany({
        where: { id: { in: servicioIds }, activo: true },
        select: { id: true },
      });
      const vivos = new Set(encontrados.map((s) => s.id));
      const faltan = [...new Set(servicioIds)].filter((id) => !vivos.has(id));
      if (faltan.length)
        throw new BadRequestException(`Servicios inexistentes o inactivos: ${faltan.join(', ')}`);
    }

    let lineas;
    try {
      lineas = lineasDeServicio(dto.lineas);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const t = totales(lineas, ivaPct);

    const fecha = dto.fecha ? new Date(dto.fecha) : new Date();
    if (Number.isNaN(fecha.getTime())) throw new BadRequestException('Fecha inválida');
    const fechaVencimiento = new Date(fecha);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + diasCredito(cliente.tipoCredito));

    return this.prisma.$transaction(async (tx) => {
      const consecutivo = await siguienteConsecutivo(tx, 'factura');
      const factura = await tx.factura.create({
        data: {
          consecutivo,
          tipo: 'SERVICIO',
          despachoId: null,
          clienteId: cliente.id,
          lineaId: dto.lineaId ?? null,
          fecha,
          fechaVencimiento,
          ivaPct,
          subtotal: t.subtotal,
          iva: t.iva,
          total: t.total,
          lineas: { create: lineas },
        },
        include: { lineas: true },
      });
      await recalcularEstadoCartera(tx, cliente.id, fecha);
      return factura;
    });
  }

  listarServicios() {
    return this.prisma.servicioCatalogo.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  /**
   * Cuánto facturarle a una línea por el servicio del mes: cuenta los pares que
   * esa línea llevó a PT en el período. Es el puente entre lo que el MES ya sabe
   * y la factura — sin esto habría que contar los pares a mano.
   */
  async sugerenciaServicio(lineaId: number, anio: number, mes: number) {
    const desde = new Date(Date.UTC(anio, mes - 1, 1));
    const hasta = new Date(Date.UTC(anio, mes, 1));
    const linea = await this.prisma.linea.findUnique({
      where: { id: lineaId },
      select: { id: true, codigo: true, nombre: true },
    });
    if (!linea) throw new NotFoundException(`Línea ${lineaId} no existe`);

    const pares = await this.prisma.eventoTrazabilidad.count({
      where: {
        celula: 'PT',
        timestamp: { gte: desde, lt: hasta },
        par: { lineaId },
      },
    });
    return { linea, anio, mes, paresTerminados: pares };
  }

  listar() {
    return this.prisma.factura.findMany({
      orderBy: { consecutivo: 'desc' },
      select: {
        id: true,
        consecutivo: true,
        tipo: true,
        fecha: true,
        total: true,
        estado: true,
        // El cliente sale de la factura: las de servicio no tienen despacho.
        cliente: { select: { nombre: true } },
        linea: { select: { codigo: true, nombre: true } },
        despacho: {
          select: {
            consecutivo: true,
            op: { select: { consecutivo: true } },
          },
        },
      },
    });
  }

  async obtener(id: number) {
    const f = await this.prisma.factura.findUnique({
      where: { id },
      include: {
        cliente: true,
        linea: { select: { codigo: true, nombre: true } },
        despacho: {
          select: {
            consecutivo: true,
            op: { select: { consecutivo: true, oc: { select: { consecutivo: true } } } },
          },
        },
        lineas: { include: { productoConfigurado: true, talla: true, servicio: true } },
      },
    });
    if (!f) throw new NotFoundException(`Factura ${id} no existe`);
    return f;
  }
}
