import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService, PRODUCTO_FULL_SELECT } from '../catalog.service';
import { CrearProductoDto } from './dto/crear-producto.dto';
import {
  armarProducto, ConfiguracionInvalida, esViolacionUnica, ProductoArmado,
} from './producto-configurado-core';

@Injectable()
export class ProductoConfiguradoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async crear(dto: CrearProductoDto) {
    const armado = await this.armar(dto);

    const existe = await this.prisma.productoConfigurado.findUnique({
      where: { codigo: armado.codigo },
    });
    if (existe) {
      throw new ConflictException(`Ya existe el producto ${armado.codigo}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const id = await this.insertar(tx, dto.referenciaId, armado);
      return tx.productoConfigurado.findUnique({
        where: { id },
        include: { opciones: true },
      });
    });
  }

  /**
   * Arma el producto desde la OC: cualquier referencia se vende con cualquier marca,
   * así que no se pre-crean todos; se obtienen (o crean) al vuelo. Idempotente:
   *  - si el código ya existe, lo devuelve (reactivándolo si estaba inactivo);
   *  - si no, lo crea;
   *  - si otro usuario lo creó en paralelo (P2002), devuelve el de él.
   * Devuelve la forma del listado (PRODUCTO_FULL_SELECT) + `creado`.
   */
  async obtenerOCrear(dto: CrearProductoDto) {
    const armado = await this.armar(dto);

    const existe = await this.buscarPorCodigo(armado.codigo);
    if (existe) return this.devolverExistente(existe);

    let id: number;
    try {
      id = await this.prisma.$transaction((tx) => this.insertar(tx, dto.referenciaId, armado));
    } catch (e) {
      if (!esViolacionUnica(e)) throw e;
      const ganador = await this.buscarPorCodigo(armado.codigo);
      if (!ganador) throw e;
      return this.devolverExistente(ganador);
    }
    return { ...(await this.full(id)), creado: true };
  }

  async desactivar(id: number) {
    const p = await this.prisma.productoConfigurado.findUnique({ where: { id } });
    if (!p) throw new NotFoundException(`Producto ${id} no existe`);
    return this.prisma.productoConfigurado.update({
      where: { id },
      data: { activo: false },
    });
  }

  // Valida la selección contra la config de la referencia. configReferencia lanza
  // NotFound si la referencia no existe/está inactiva; la config inválida es un 400.
  private async armar(dto: CrearProductoDto): Promise<ProductoArmado> {
    const config = await this.catalog.configReferencia(dto.referenciaId);
    try {
      return armarProducto(config, {
        marcaId: dto.marcaId,
        opcionIds: dto.opcionIds ?? [],
      });
    } catch (e) {
      if (e instanceof ConfiguracionInvalida) throw new BadRequestException(e.message);
      throw e;
    }
  }

  private async insertar(
    tx: Prisma.TransactionClient,
    referenciaId: number,
    armado: ProductoArmado,
  ): Promise<number> {
    const prod = await tx.productoConfigurado.create({
      data: {
        codigo: armado.codigo,
        nombreComercial: armado.nombreComercial,
        referenciaId,
        marcaId: armado.marcaId,
      },
    });
    for (const opcionId of armado.opcionIds) {
      await tx.productoConfiguradoOpcion.create({
        data: { productoConfiguradoId: prod.id, opcionId },
      });
    }
    return prod.id;
  }

  private buscarPorCodigo(codigo: string) {
    return this.prisma.productoConfigurado.findUnique({
      where: { codigo },
      select: { id: true, activo: true },
    });
  }

  private async devolverExistente(p: { id: number; activo: boolean }) {
    if (!p.activo) {
      await this.prisma.productoConfigurado.update({
        where: { id: p.id },
        data: { activo: true },
      });
    }
    return { ...(await this.full(p.id)), creado: false };
  }

  private async full(id: number) {
    const p = await this.prisma.productoConfigurado.findUnique({
      where: { id },
      select: PRODUCTO_FULL_SELECT,
    });
    if (!p) throw new NotFoundException(`Producto ${id} no existe`);
    return p;
  }
}
