import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CrearBodegaDto } from './dto/crear-bodega.dto';
import { RegistrarStockDto } from './dto/registrar-stock.dto';

@Injectable()
export class InventarioService {
  constructor(private readonly prisma: PrismaService) {}

  crearBodega(dto: CrearBodegaDto) {
    return this.prisma.bodega.create({
      data: {
        codigo: dto.codigo,
        nombre: dto.nombre,
        tipo: dto.tipo,
        prioridad: dto.prioridad,
      },
    });
  }

  registrarStock(dto: RegistrarStockDto) {
    const { productoConfiguradoId, tallaId, bodegaId, cantidad } = dto;
    return this.prisma.inventarioPT.upsert({
      where: {
        productoConfiguradoId_tallaId_bodegaId: {
          productoConfiguradoId,
          tallaId,
          bodegaId,
        },
      },
      create: {
        productoConfiguradoId,
        tallaId,
        bodegaId,
        cantDisponible: cantidad,
      },
      update: { cantDisponible: { increment: cantidad } },
    });
  }
}
