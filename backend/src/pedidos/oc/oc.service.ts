import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { siguienteConsecutivo } from '../../prisma/consecutivo';
import { CrearOCDto } from './dto/crear-oc.dto';
import { validarConfirmacionOC, OCParaValidar } from './oc-validacion';

@Injectable()
export class OcService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearOCDto) {
    // nextval + create en la misma tx: si el create falla no queda hueco evitable.
    return this.prisma.$transaction(async (tx) => {
      const consecutivo = await siguienteConsecutivo(tx, 'oc');
      return tx.ordenCompra.create({
        data: {
          consecutivo,
          clienteId: dto.clienteId,
          ocCliente: dto.ocCliente,
          observaciones: dto.observaciones,
          estado: 'BORRADOR',
          lineas: {
            create: dto.lineas.map((l) => ({
              productoConfiguradoId: l.productoConfiguradoId,
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
      data: { estado: 'CONFIRMADA' },
    });
  }

  listar() {
    return this.prisma.ordenCompra.findMany({
      orderBy: { consecutivo: 'desc' },
      include: {
        cliente: { select: { id: true, nit: true, nombre: true } },
        ordenProduccion: {
          select: { id: true, consecutivo: true, estado: true },
        },
      },
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
