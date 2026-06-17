import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CrearMarcaDto } from './dto/crear-marca.dto';
import { ActualizarMarcaDto } from './dto/actualizar-marca.dto';

@Injectable()
export class MarcaService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearMarcaDto) {
    const existe = await this.prisma.marca.findUnique({
      where: { codigo: dto.codigo },
    });
    if (existe)
      throw new ConflictException(`Ya existe una marca con código ${dto.codigo}`);
    return this.prisma.marca.create({
      data: {
        codigo: dto.codigo,
        nombre: dto.nombre,
        tipo: dto.tipo,
        clienteId: dto.clienteId,
      },
    });
  }

  listar() {
    return this.prisma.marca.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  obtener(id: number) {
    return this.prisma.marca.findUnique({ where: { id } });
  }

  async actualizar(id: number, dto: ActualizarMarcaDto) {
    const existe = await this.prisma.marca.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException(`No existe la marca con id ${id}`);
    return this.prisma.marca.update({
      where: { id },
      data: {
        nombre: dto.nombre,
        tipo: dto.tipo,
        clienteId: dto.clienteId,
      },
    });
  }

  async desactivar(id: number) {
    const existe = await this.prisma.marca.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException(`No existe la marca con id ${id}`);
    return this.prisma.marca.update({
      where: { id },
      data: { activo: false },
    });
  }
}
