import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../catalog.service';
import { CrearProductoDto } from './dto/crear-producto.dto';
import { armarProducto, ConfiguracionInvalida } from './producto-configurado-core';

@Injectable()
export class ProductoConfiguradoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async crear(dto: CrearProductoDto) {
    // configReferencia lanza NotFound si la referencia no existe/está inactiva.
    const config = await this.catalog.configReferencia(dto.referenciaId);

    let armado;
    try {
      armado = armarProducto(config, {
        marcaId: dto.marcaId,
        opcionIds: dto.opcionIds ?? [],
      });
    } catch (e) {
      if (e instanceof ConfiguracionInvalida) throw new BadRequestException(e.message);
      throw e;
    }

    const existe = await this.prisma.productoConfigurado.findUnique({
      where: { codigo: armado.codigo },
    });
    if (existe) {
      throw new ConflictException(`Ya existe el producto ${armado.codigo}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const prod = await tx.productoConfigurado.create({
        data: {
          codigo: armado.codigo,
          nombreComercial: armado.nombreComercial,
          referenciaId: dto.referenciaId,
          marcaId: armado.marcaId,
        },
      });
      for (const opcionId of armado.opcionIds) {
        await tx.productoConfiguradoOpcion.create({
          data: { productoConfiguradoId: prod.id, opcionId },
        });
      }
      return tx.productoConfigurado.findUnique({
        where: { id: prod.id },
        include: { opciones: true },
      });
    });
  }

  async desactivar(id: number) {
    const p = await this.prisma.productoConfigurado.findUnique({ where: { id } });
    if (!p) throw new NotFoundException(`Producto ${id} no existe`);
    return this.prisma.productoConfigurado.update({
      where: { id },
      data: { activo: false },
    });
  }
}
