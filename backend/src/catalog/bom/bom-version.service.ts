import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CrearBomVersionDto, BomLineaInput } from './dto/crear-bom-version.dto';

/**
 * Versionado de BOM. Editar un BOM NUNCA muta la versión vigente: desactiva la
 * activa y crea otra activa con version = max+1, dentro de una transacción. Así
 * las OPs/OFs ya emitidas siguen apuntando a la versión con que se calcularon.
 * El índice único parcial (WHERE activo=true) es la red de seguridad del invariante
 * "un solo BOM activo por referencia/material".
 */
@Injectable()
export class BomVersionService {
  constructor(private readonly prisma: PrismaService) {}

  async crearNuevaVersion(dto: CrearBomVersionDto) {
    const { referenciaId, materialId, lineas } = dto;

    // Exactamente una clave: BOM de referencia O BOM de material FABRICADO.
    if ((referenciaId == null) === (materialId == null)) {
      throw new BadRequestException(
        'Indica exactamente uno: referenciaId o materialId',
      );
    }

    this.validarLineas(lineas, materialId ?? null);

    if (referenciaId != null) {
      const ref = await this.prisma.referencia.findUnique({ where: { id: referenciaId } });
      if (!ref) throw new NotFoundException(`Referencia ${referenciaId} no existe`);
    } else {
      const mat = await this.prisma.material.findUnique({ where: { id: materialId! } });
      if (!mat) throw new NotFoundException(`Material ${materialId} no existe`);
    }

    const clave = referenciaId != null ? { referenciaId } : { materialId: materialId! };

    return this.prisma.$transaction(async (tx) => {
      const ultima = await tx.bom.findFirst({
        where: clave,
        orderBy: { version: 'desc' },
      });
      const siguiente = (ultima?.version ?? 0) + 1;

      // Desactivar la versión activa actual ANTES de activar la nueva.
      await tx.bom.updateMany({
        where: { ...clave, activo: true },
        data: { activo: false },
      });

      const bom = await tx.bom.create({
        data: { ...clave, version: siguiente, activo: true },
      });

      for (const l of lineas) {
        const linea = await tx.bomLinea.create({
          data: {
            bomId: bom.id,
            materialId: l.materialId,
            claseConsumo: l.claseConsumo,
            consumoFijo: l.claseConsumo === 'FIJO' ? l.consumoFijo : null,
            mermaPct: l.mermaPct ?? null,
          },
        });
        if (l.claseConsumo === 'CURVA') {
          for (const t of l.tallas ?? []) {
            await tx.bomLineaTalla.create({
              data: { bomLineaId: linea.id, tallaId: t.tallaId, consumo: t.consumo },
            });
          }
        }
      }

      return tx.bom.findUnique({
        where: { id: bom.id },
        include: { lineas: { include: { lineasTalla: true } } },
      });
    });
  }

  /** Lista el histórico de versiones de una referencia (la activa primero). */
  listarVersiones(referenciaId: number) {
    return this.prisma.bom.findMany({
      where: { referenciaId },
      orderBy: { version: 'desc' },
      include: { lineas: { include: { lineasTalla: true } } },
    });
  }

  private validarLineas(lineas: BomLineaInput[], materialId: number | null) {
    for (const l of lineas) {
      if (materialId != null && l.materialId === materialId) {
        throw new BadRequestException(
          `El material ${materialId} no puede ser insumo de su propio BOM (ciclo directo)`,
        );
      }
      if (l.claseConsumo === 'CURVA' && (!l.tallas || l.tallas.length === 0)) {
        throw new BadRequestException(
          `La línea del material ${l.materialId} es CURVA y requiere al menos una talla`,
        );
      }
      if (l.claseConsumo === 'FIJO' && l.consumoFijo == null) {
        throw new BadRequestException(
          `La línea del material ${l.materialId} es FIJO y requiere consumoFijo`,
        );
      }
    }
  }
}
