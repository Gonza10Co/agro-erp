import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { generarPares, siguienteCelula, LineaProduccion } from './fabricacion-core';
import { AvanzarDto } from './dto/avanzar.dto';

@Injectable()
export class FabricacionService {
  constructor(private readonly prisma: PrismaService) {}

  async generarOF(opId: number) {
    const op = await this.prisma.ordenProduccion.findUnique({
      where: { id: opId },
      include: { lineas: { include: { tallas: true } }, ordenesFabricacion: true },
    });
    if (!op) throw new NotFoundException(`OP ${opId} no existe`);
    if (op.ordenesFabricacion.length > 0)
      throw new ConflictException('La OP ya tiene una OF');

    const lineas: LineaProduccion[] = op.lineas.flatMap((l: any) =>
      l.tallas
        .filter((t: any) => t.cantAProducir > 0)
        .map((t: any) => ({
          productoConfiguradoId: l.productoConfiguradoId,
          tallaId: t.tallaId,
          cantAProducir: t.cantAProducir,
        })),
    );
    if (lineas.length === 0)
      throw new BadRequestException('La OP no tiene producción pendiente');

    return this.prisma.$transaction(async (tx) => {
      const agg = await tx.ordenFabricacion.aggregate({ _max: { consecutivo: true } });
      const consecutivo = (agg._max.consecutivo ?? 0) + 1;
      const of = await tx.ordenFabricacion.create({ data: { consecutivo, opId } });
      const pares = generarPares(consecutivo, lineas).map((p) => ({ ...p, ofId: of.id }));
      await tx.par.createMany({ data: pares });
      return { id: of.id, consecutivo, opId, totalPares: pares.length };
    });
  }

  async avanzar(codigo: string, dto: AvanzarDto) {
    const par = await this.prisma.par.findUnique({
      where: { codigo },
      include: { of: true },
    });
    if (!par) throw new NotFoundException(`Par ${codigo} no existe`);
    if (par.estado === 'TERMINADO')
      throw new ConflictException('El par ya está terminado');

    const celulaActual = par.celulaActual;
    const siguiente = siguienteCelula(celulaActual);

    return this.prisma.$transaction(async (tx) => {
      await tx.eventoTrazabilidad.create({
        data: {
          parId: par.id,
          celula: celulaActual,
          operarioId: dto.operarioId,
          maquinaId: dto.maquinaId,
        },
      });

      if (siguiente === null) {
        // Última célula (PT): terminar el par y sumar a InventarioPT.
        const updated = await tx.par.update({
          where: { id: par.id },
          data: { estado: 'TERMINADO' },
        });
        const bodega = await tx.bodega.findFirst({
          where: { tipo: 'PROPIA', activo: true },
          orderBy: { prioridad: 'asc' },
        });
        if (!bodega)
          throw new BadRequestException('No hay bodega PROPIA configurada');
        await tx.inventarioPT.upsert({
          where: {
            productoConfiguradoId_tallaId_bodegaId: {
              productoConfiguradoId: par.productoConfiguradoId,
              tallaId: par.tallaId,
              bodegaId: bodega.id,
            },
          },
          create: {
            productoConfiguradoId: par.productoConfiguradoId,
            tallaId: par.tallaId,
            bodegaId: bodega.id,
            cantDisponible: 1,
          },
          update: { cantDisponible: { increment: 1 } },
        });
        const restantes = await tx.par.count({
          where: { ofId: par.ofId, estado: 'EN_PROCESO' },
        });
        if (restantes === 0)
          await tx.ordenFabricacion.update({
            where: { id: par.ofId },
            data: { estado: 'TERMINADA' },
          });
        return updated;
      }

      // Avance normal a la siguiente célula.
      if (celulaActual === 'CORTE' && par.of.estado === 'ABIERTA') {
        await tx.ordenFabricacion.update({
          where: { id: par.ofId },
          data: { estado: 'EN_PROCESO' },
        });
      }
      return tx.par.update({
        where: { id: par.id },
        data: { celulaActual: siguiente },
      });
    });
  }
}
