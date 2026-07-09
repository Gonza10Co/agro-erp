import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { siguienteConsecutivo } from '../../prisma/consecutivo';
import { CrearOCDto } from './dto/crear-oc.dto';
import { ActualizarOCDto } from './dto/actualizar-oc.dto';
import { validarConfirmacionOC, OCParaValidar } from './oc-validacion';
import { estadoDemora } from './oc-demora';
import { resolverDestinoOC } from './oc-destino';
import { elegirSedePorDefecto } from '../../clientes/sedes-core';

@Injectable()
export class OcService {
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
      return tx.ordenCompra.create({
        data: {
          consecutivo,
          clienteId: dto.clienteId,
          ocCliente: dto.ocCliente,
          observaciones: dto.observaciones,
          sedeEntregaId,
          direccionDespacho,
          estado: 'BORRADOR',
          lineas: {
            create: dto.lineas.map((l) => ({
              productoConfiguradoId: l.productoConfiguradoId,
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
      return tx.ordenCompra.update({
        where: { id },
        data: {
          clienteId: dto.clienteId,
          ocCliente: dto.ocCliente,
          observaciones: dto.observaciones,
          sedeEntregaId,
          direccionDespacho,
          lineas: {
            create: dto.lineas.map((l) => ({
              productoConfiguradoId: l.productoConfiguradoId,
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

  async listar() {
    const ocs = await this.prisma.ordenCompra.findMany({
      orderBy: { consecutivo: 'desc' },
      include: {
        cliente: { select: { id: true, nit: true, nombre: true, estadoCartera: true } },
        ordenProduccion: {
          select: { id: true, consecutivo: true, estado: true },
        },
      },
    });
    // El semáforo de demora se calcula al vuelo (no se persiste): días desde la
    // confirmación cruzados con la cartera del cliente.
    const ahora = new Date();
    return ocs.map((oc) => {
      const demora = estadoDemora(oc.fechaConfirmacion, ahora, oc.cliente.estadoCartera, oc.estado);
      return { ...oc, diasDemora: demora.dias, estadoDemora: demora.estado };
    });
  }

  async obtener(id: number) {
    const oc = await this.prisma.ordenCompra.findUnique({
      where: { id },
      include: {
        cliente: true,
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
