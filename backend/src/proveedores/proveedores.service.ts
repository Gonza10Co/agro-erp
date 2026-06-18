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

  listar() {
    return this.prisma.proveedor.findMany({
      where: { activo: true },
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
}
