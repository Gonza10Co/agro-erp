import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CrearProveedorDto } from './dto/crear-proveedor.dto';
import { ActualizarProveedorDto } from './dto/actualizar-proveedor.dto';

@Injectable()
export class ProveedoresService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearProveedorDto) {
    const existe = await this.prisma.proveedor.findUnique({
      where: { nit: dto.nit },
    });
    if (existe)
      throw new ConflictException(`Ya existe un proveedor con NIT ${dto.nit}`);
    return this.prisma.proveedor.create({
      data: {
        nit: dto.nit,
        nombre: dto.nombre,
        ciudad: dto.ciudad,
      },
    });
  }

  /** Solo activos salvo `incluirInactivas` (pantalla de maestros, para reactivar). */
  listar(incluirInactivas = false) {
    return this.prisma.proveedor.findMany({
      where: incluirInactivas ? {} : { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  obtener(id: number) {
    return this.prisma.proveedor.findUnique({ where: { id } });
  }

  async actualizar(id: number, dto: ActualizarProveedorDto) {
    const existe = await this.prisma.proveedor.findUnique({ where: { id } });
    if (!existe)
      throw new NotFoundException(`No existe el proveedor ${id}`);
    return this.prisma.proveedor.update({
      where: { id },
      data: {
        nombre: dto.nombre,
        ciudad: dto.ciudad,
      },
    });
  }

  async desactivar(id: number) {
    const existe = await this.prisma.proveedor.findUnique({ where: { id } });
    if (!existe)
      throw new NotFoundException(`No existe el proveedor ${id}`);
    return this.prisma.proveedor.update({
      where: { id },
      data: { activo: false },
    });
  }

  async reactivar(id: number) {
    const existe = await this.prisma.proveedor.findUnique({ where: { id } });
    if (!existe)
      throw new NotFoundException(`No existe el proveedor ${id}`);
    return this.prisma.proveedor.update({
      where: { id },
      data: { activo: true },
    });
  }
}
