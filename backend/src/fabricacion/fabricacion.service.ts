import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { siguienteConsecutivo } from '../prisma/consecutivo';
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
      const consecutivo = await siguienteConsecutivo(tx, 'of');
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
    if (par.estado !== 'EN_PROCESO')
      throw new ConflictException(
        par.estado === 'TERMINADO'
          ? 'El par ya está terminado'
          : 'El par está cancelado (OP anulada)',
      );

    const celulaActual = par.celulaActual;
    const siguiente = siguienteCelula(celulaActual);

    // La bodega destino es configuración global (no cambia durante la tx):
    // se resuelve fuera de la transacción para no alargarla.
    let bodegaPT: { id: number } | null = null;
    if (siguiente === null) {
      bodegaPT = await this.prisma.bodega.findFirst({
        where: { tipo: 'PROPIA', activo: true },
        orderBy: { prioridad: 'asc' },
      });
      if (!bodegaPT)
        throw new BadRequestException('No hay bodega PROPIA configurada');
    }

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
        await tx.inventarioPT.upsert({
          where: {
            productoConfiguradoId_tallaId_bodegaId: {
              productoConfiguradoId: par.productoConfiguradoId,
              tallaId: par.tallaId,
              bodegaId: bodegaPT!.id,
            },
          },
          create: {
            productoConfiguradoId: par.productoConfiguradoId,
            tallaId: par.tallaId,
            bodegaId: bodegaPT!.id,
            cantDisponible: 1,
          },
          update: { cantDisponible: { increment: 1 } },
        });
        // El par ya fue marcado TERMINADO en esta misma tx, así que
        // este count no lo incluye (cuenta solo los que aún siguen en proceso).
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

  listarOF() {
    return this.prisma.ordenFabricacion.findMany({
      orderBy: { consecutivo: 'desc' },
      select: {
        id: true,
        consecutivo: true,
        estado: true,
        fecha: true,
        op: { select: { consecutivo: true } },
        _count: { select: { pares: true } },
      },
    });
  }

  async obtenerOF(id: number) {
    const of = await this.prisma.ordenFabricacion.findUnique({
      where: { id },
      include: {
        op: { select: { consecutivo: true } },
        pares: {
          orderBy: { codigo: 'asc' },
          select: {
            id: true,
            codigo: true,
            celulaActual: true,
            estado: true,
            talla: { select: { valor: true } },
          },
        },
      },
    });
    if (!of) throw new NotFoundException(`OF ${id} no existe`);
    return of;
  }

  tablero(ofId?: number) {
    return this.prisma.par.findMany({
      where: ofId ? { ofId } : {},
      orderBy: { codigo: 'asc' },
      select: {
        id: true,
        codigo: true,
        celulaActual: true,
        estado: true,
        talla: { select: { valor: true } },
        of: { select: { consecutivo: true } },
      },
    });
  }

  async obtenerPar(codigo: string) {
    const par = await this.prisma.par.findUnique({
      where: { codigo },
      include: {
        of: { select: { consecutivo: true } },
        talla: { select: { valor: true } },
        productoConfigurado: { select: { id: true } },
        eventos: {
          orderBy: { timestamp: 'asc' },
          include: {
            operario: { select: { nombre: true } },
            maquina: { select: { nombre: true } },
          },
        },
      },
    });
    if (!par) throw new NotFoundException(`Par ${codigo} no existe`);
    return par;
  }

  listarOperarios(celula?: string) {
    return this.prisma.operario.findMany({
      where: { activo: true, ...(celula ? { celula: celula as any } : {}) },
      orderBy: { nombre: 'asc' },
    });
  }

  listarMaquinas(celula?: string) {
    return this.prisma.maquina.findMany({
      where: { activo: true, ...(celula ? { celula: celula as any } : {}) },
      orderBy: { nombre: 'asc' },
    });
  }
}
