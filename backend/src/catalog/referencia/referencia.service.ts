import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CrearReferenciaDto } from './dto/crear-referencia.dto';
import { ActualizarReferenciaDto } from './dto/actualizar-referencia.dto';
import { AsignarMarcaDto } from './dto/asignar-marca.dto';
import { AsignarEjeDto } from './dto/asignar-eje.dto';

@Injectable()
export class ReferenciaAbmService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearReferenciaDto) {
    const existe = await this.prisma.referencia.findUnique({
      where: { codigo: dto.codigo },
    });
    if (existe)
      throw new ConflictException(
        `Ya existe una referencia con código ${dto.codigo}`,
      );
    return this.prisma.referencia.create({
      data: {
        codigo: dto.codigo,
        nombreInterno: dto.nombreInterno,
        tallaMinId: dto.tallaMinId,
        tallaMaxId: dto.tallaMaxId,
      },
    });
  }

  listar() {
    return this.prisma.referencia.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombreInterno: true, activo: true },
    });
  }

  async obtener(id: number) {
    const referencia = await this.prisma.referencia.findUnique({
      where: { id },
      include: { ejes: true, marcas: true },
    });
    if (!referencia)
      throw new NotFoundException(`No existe la referencia ${id}`);
    return referencia;
  }

  async actualizar(id: number, dto: ActualizarReferenciaDto) {
    const existe = await this.prisma.referencia.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException(`No existe la referencia ${id}`);
    return this.prisma.referencia.update({
      where: { id },
      data: {
        nombreInterno: dto.nombreInterno,
        tallaMinId: dto.tallaMinId,
        tallaMaxId: dto.tallaMaxId,
      },
    });
  }

  async desactivar(id: number) {
    const existe = await this.prisma.referencia.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException(`No existe la referencia ${id}`);
    return this.prisma.referencia.update({
      where: { id },
      data: { activo: false },
    });
  }

  async asignarMarca(referenciaId: number, dto: AsignarMarcaDto) {
    const referencia = await this.prisma.referencia.findUnique({
      where: { id: referenciaId },
    });
    if (!referencia)
      throw new NotFoundException(`No existe la referencia ${referenciaId}`);
    const yaAsignada = await this.prisma.referenciaMarca.findUnique({
      where: {
        referenciaId_marcaId: { referenciaId, marcaId: dto.marcaId },
      },
    });
    if (yaAsignada)
      throw new ConflictException(
        `La marca ${dto.marcaId} ya está asignada a la referencia ${referenciaId}`,
      );
    return this.prisma.referenciaMarca.create({
      data: { referenciaId, marcaId: dto.marcaId },
    });
  }

  async quitarMarca(referenciaMarcaId: number) {
    const existe = await this.prisma.referenciaMarca.findUnique({
      where: { id: referenciaMarcaId },
    });
    if (!existe)
      throw new NotFoundException(
        `No existe la asignación de marca ${referenciaMarcaId}`,
      );
    return this.prisma.referenciaMarca.delete({
      where: { id: referenciaMarcaId },
    });
  }

  async asignarEje(referenciaId: number, dto: AsignarEjeDto) {
    const referencia = await this.prisma.referencia.findUnique({
      where: { id: referenciaId },
    });
    if (!referencia)
      throw new NotFoundException(`No existe la referencia ${referenciaId}`);
    const yaAsignado = await this.prisma.referenciaEje.findUnique({
      where: {
        referenciaId_grupoOpcionId: {
          referenciaId,
          grupoOpcionId: dto.grupoOpcionId,
        },
      },
    });
    if (yaAsignado)
      throw new ConflictException(
        `El eje ${dto.grupoOpcionId} ya está asignado a la referencia ${referenciaId}`,
      );
    return this.prisma.referenciaEje.create({
      data: {
        referenciaId,
        grupoOpcionId: dto.grupoOpcionId,
        obligatorio: dto.obligatorio,
      },
    });
  }

  async quitarEje(referenciaEjeId: number) {
    const existe = await this.prisma.referenciaEje.findUnique({
      where: { id: referenciaEjeId },
    });
    if (!existe)
      throw new NotFoundException(
        `No existe la asignación de eje ${referenciaEjeId}`,
      );
    return this.prisma.referenciaEje.delete({
      where: { id: referenciaEjeId },
    });
  }
}
