import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { saldoFactura, resumenCartera } from './cartera-core';
import { recalcularEstadoCartera } from './recalcular-cartera';

@Injectable()
export class CarteraService {
  constructor(private readonly prisma: PrismaService) {}

  async registrarPago(dto: RegistrarPagoDto) {
    // clienteId sale directo de la factura: una factura de servicio no tiene
    // despacho, así que la vieja cadena despacho→op→oc ya no sirve.
    const factura = await this.prisma.factura.findUnique({
      where: { id: dto.facturaId },
      select: { total: true, clienteId: true, pagos: { select: { monto: true } } },
    });
    if (!factura) throw new NotFoundException(`Factura ${dto.facturaId} no existe`);

    const saldoActual = saldoFactura(
      Number(factura.total),
      factura.pagos.map((p) => ({ monto: Number(p.monto) })),
    );
    if (dto.monto <= 0) throw new BadRequestException('El monto debe ser mayor a 0');
    if (dto.monto > saldoActual)
      throw new BadRequestException(
        `El monto (${dto.monto}) supera el saldo pendiente (${saldoActual})`,
      );

    const clienteId = factura.clienteId;
    const hoy = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.pago.create({
        data: { facturaId: dto.facturaId, monto: dto.monto, medio: dto.medio },
      });
      await recalcularEstadoCartera(tx, clienteId, hoy);
      return { facturaId: dto.facturaId, saldo: saldoFactura(saldoActual, [{ monto: dto.monto }]) };
    });
  }

  async listar() {
    const hoy = new Date();
    const facturas = await this.prisma.factura.findMany({
      where: { estado: 'EMITIDA' },
      orderBy: { fechaVencimiento: 'asc' },
      select: {
        id: true,
        consecutivo: true,
        total: true,
        fecha: true,
        fechaVencimiento: true,
        tipo: true,
        pagos: { select: { monto: true } },
        cliente: { select: { id: true, nombre: true } },
      },
    });

    return facturas
      .map((f) => {
        const pagado = f.pagos.reduce((acc, p) => acc + Number(p.monto), 0);
        const saldo = saldoFactura(Number(f.total), f.pagos.map((p) => ({ monto: Number(p.monto) })));
        const vencida =
          f.fechaVencimiento != null && saldo > 0 && f.fechaVencimiento.getTime() < hoy.getTime();
        return {
          facturaId: f.id,
          consecutivo: f.consecutivo,
          cliente: f.cliente,
          // Las de servicio entran a cartera igual que las de producto; el tipo
          // permite distinguirlas en pantalla sin una consulta aparte.
          tipo: f.tipo,
          total: Number(f.total),
          pagado,
          saldo,
          fecha: f.fecha,
          fechaVencimiento: f.fechaVencimiento,
          vencida,
        };
      })
      .filter((f) => f.saldo > 0);
  }

  async obtenerCliente(clienteId: number) {
    const hoy = new Date();
    const facturas = await this.prisma.factura.findMany({
      where: { clienteId },
      orderBy: { fechaVencimiento: 'asc' },
      select: {
        id: true,
        consecutivo: true,
        tipo: true,
        total: true,
        fecha: true,
        fechaVencimiento: true,
        estado: true,
        pagos: { select: { id: true, monto: true, fecha: true, medio: true } },
      },
    });

    const items = facturas.map((f) => {
      const pagado = f.pagos.reduce((acc, p) => acc + Number(p.monto), 0);
      const saldo = saldoFactura(Number(f.total), f.pagos.map((p) => ({ monto: Number(p.monto) })));
      return {
        facturaId: f.id,
        consecutivo: f.consecutivo,
        tipo: f.tipo,
        total: Number(f.total),
        pagado,
        saldo,
        fecha: f.fecha,
        fechaVencimiento: f.fechaVencimiento,
        estado: f.estado,
        pagos: f.pagos,
      };
    });

    const resumen = resumenCartera(
      items.map((i) => ({ total: i.total, pagado: i.pagado, saldo: i.saldo, fechaVencimiento: i.fechaVencimiento })),
      hoy,
    );
    return { clienteId, resumen, facturas: items };
  }
}
