import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CrearLineaDto } from './dto/crear-linea.dto';
import { ActualizarLineaDto } from './dto/actualizar-linea.dto';

@Injectable()
export class LineaService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearLineaDto) {
    const existe = await this.prisma.linea.findUnique({
      where: { codigo: dto.codigo },
    });
    if (existe)
      throw new ConflictException(`Ya existe una línea con código ${dto.codigo}`);
    return this.prisma.linea.create({
      data: {
        codigo: dto.codigo,
        nombre: dto.nombre,
        celulaInicial: dto.celulaInicial,
      },
    });
  }

  listar() {
    return this.prisma.linea.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  obtener(id: number) {
    return this.prisma.linea.findUnique({ where: { id } });
  }

  async actualizar(id: number, dto: ActualizarLineaDto) {
    const existe = await this.prisma.linea.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException(`No existe la línea con id ${id}`);
    return this.prisma.linea.update({
      where: { id },
      data: { nombre: dto.nombre, celulaInicial: dto.celulaInicial },
    });
  }

  async desactivar(id: number) {
    const existe = await this.prisma.linea.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException(`No existe la línea con id ${id}`);
    return this.prisma.linea.update({ where: { id }, data: { activo: false } });
  }
}
