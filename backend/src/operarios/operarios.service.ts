import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Celula } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CrearOperarioDto } from './dto/crear-operario.dto';
import { ActualizarOperarioDto } from './dto/actualizar-operario.dto';

@Injectable()
export class OperariosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista TODOS por defecto (incluidos los inactivos): esta es la pantalla de
   * administración, donde hay que poder ver a quién se retiró para reactivarlo.
   * El selector del piso pide `soloActivos` — ahí un retirado no debe aparecer.
   */
  listar(opts?: { celula?: Celula; soloActivos?: boolean }) {
    return this.prisma.operario.findMany({
      where: {
        celula: opts?.celula,
        ...(opts?.soloActivos ? { activo: true } : {}),
      },
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
    });
  }

  async crear(dto: CrearOperarioDto) {
    // El nombre es lo único que identifica al operario en el piso; dos "Juan
    // Pérez" en la misma célula harían imposible saber quién escaneó.
    const existe = await this.prisma.operario.findFirst({
      where: { nombre: dto.nombre, celula: dto.celula },
    });
    if (existe)
      throw new ConflictException(
        `Ya hay un operario "${dto.nombre}" en ${dto.celula}`,
      );
    return this.prisma.operario.create({
      data: { nombre: dto.nombre, celula: dto.celula },
    });
  }

  async actualizar(id: number, dto: ActualizarOperarioDto) {
    const operario = await this.prisma.operario.findUnique({ where: { id } });
    if (!operario) throw new NotFoundException(`No existe el operario ${id}`);

    // Mover de célula a alguien que ya existe allá repetiría el choque de nombres.
    const nombre = dto.nombre ?? operario.nombre;
    const celula = dto.celula ?? operario.celula;
    if (nombre !== operario.nombre || celula !== operario.celula) {
      const choque = await this.prisma.operario.findFirst({
        where: { nombre, celula, id: { not: id } },
      });
      if (choque)
        throw new ConflictException(`Ya hay un operario "${nombre}" en ${celula}`);
    }

    return this.prisma.operario.update({
      where: { id },
      data: { nombre: dto.nombre, celula: dto.celula, activo: dto.activo },
    });
  }
}
