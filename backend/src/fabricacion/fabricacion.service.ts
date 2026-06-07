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
}
