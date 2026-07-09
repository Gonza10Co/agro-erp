import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CrearPiezaDto } from './dto/crear-pieza.dto';
import { ActualizarPiezaDto } from './dto/actualizar-pieza.dto';

/**
 * Catálogo del despiece de la bota (capellada, lateral, talón…). Una línea de BOM puede
 * apuntar a una pieza para decir "esta micropiel es la del lateral".
 */
@Injectable()
export class PiezaService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearPiezaDto) {
    const codigo = dto.codigo.trim().toUpperCase();
    const existe = await this.prisma.pieza.findUnique({ where: { codigo } });
    if (existe) throw new ConflictException(`Ya existe una pieza con código ${codigo}`);
    return this.prisma.pieza.create({
      data: { codigo, nombre: dto.nombre, orden: dto.orden ?? 100 },
    });
  }

  listar() {
    return this.prisma.pieza.findMany({
      where: { activo: true },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
  }

  obtener(id: number) {
    return this.prisma.pieza.findUnique({ where: { id } });
  }

  async actualizar(id: number, dto: ActualizarPiezaDto) {
    await this.existeOFalla(id);
    return this.prisma.pieza.update({
      where: { id },
      data: { nombre: dto.nombre, orden: dto.orden },
    });
  }

  /**
   * No se archiva una pieza que alguna receta esté usando: el `ON DELETE SET NULL` de la FK
   * dejaría esas líneas como "bota completa" y el consumo del lateral pasaría a ser genérico
   * sin que nadie se entere.
   */
  async desactivar(id: number) {
    await this.existeOFalla(id);
    const enUso = await this.prisma.bomLinea.count({ where: { piezaId: id } });
    if (enUso > 0)
      throw new BadRequestException(
        `La pieza está usada en ${enUso} línea(s) de BOM; quítala de las recetas antes de archivarla`,
      );
    return this.prisma.pieza.update({ where: { id }, data: { activo: false } });
  }

  private async existeOFalla(id: number) {
    const p = await this.prisma.pieza.findUnique({ where: { id } });
    if (!p) throw new NotFoundException(`No existe la pieza con id ${id}`);
    return p;
  }
}
