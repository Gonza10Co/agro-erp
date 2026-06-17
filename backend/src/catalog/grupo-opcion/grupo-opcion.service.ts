import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CrearGrupoOpcionDto } from './dto/crear-grupo-opcion.dto';
import { ActualizarGrupoOpcionDto } from './dto/actualizar-grupo-opcion.dto';
import { CrearOpcionDto } from './dto/crear-opcion.dto';

@Injectable()
export class GrupoOpcionService {
  constructor(private readonly prisma: PrismaService) {}

  async crearGrupo(dto: CrearGrupoOpcionDto) {
    const existe = await this.prisma.grupoOpcion.findUnique({
      where: { codigo: dto.codigo },
    });
    if (existe)
      throw new ConflictException(
        `Ya existe un grupo de opción con código ${dto.codigo}`,
      );
    return this.prisma.grupoOpcion.create({
      data: {
        codigo: dto.codigo,
        nombre: dto.nombre,
        obligatorio: dto.obligatorio,
        orden: dto.orden,
      },
    });
  }

  listarGrupos() {
    return this.prisma.grupoOpcion.findMany({
      orderBy: { orden: 'asc' },
      include: { opciones: { where: { activo: true } } },
    });
  }

  async actualizarGrupo(id: number, dto: ActualizarGrupoOpcionDto) {
    const existe = await this.prisma.grupoOpcion.findUnique({ where: { id } });
    if (!existe)
      throw new NotFoundException(`No existe el grupo de opción ${id}`);
    return this.prisma.grupoOpcion.update({
      where: { id },
      data: {
        nombre: dto.nombre,
        obligatorio: dto.obligatorio,
        orden: dto.orden,
      },
    });
  }

  async agregarOpcion(grupoId: number, dto: CrearOpcionDto) {
    const grupo = await this.prisma.grupoOpcion.findUnique({
      where: { id: grupoId },
    });
    if (!grupo)
      throw new NotFoundException(`No existe el grupo de opción ${grupoId}`);
    const existe = await this.prisma.opcion.findUnique({
      where: { grupoOpcionId_codigo: { grupoOpcionId: grupoId, codigo: dto.codigo } },
    });
    if (existe)
      throw new ConflictException(
        `Ya existe una opción con código ${dto.codigo} en el grupo ${grupoId}`,
      );
    return this.prisma.opcion.create({
      data: {
        grupoOpcionId: grupoId,
        codigo: dto.codigo,
        nombre: dto.nombre,
      },
    });
  }

  async desactivarOpcion(opcionId: number) {
    const existe = await this.prisma.opcion.findUnique({
      where: { id: opcionId },
    });
    if (!existe)
      throw new NotFoundException(`No existe la opción ${opcionId}`);
    return this.prisma.opcion.update({
      where: { id: opcionId },
      data: { activo: false },
    });
  }
}
