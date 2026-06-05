import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listarProductos() {
    return this.prisma.productoConfigurado.findMany({
      where: { activo: true },
      orderBy: { nombreComercial: 'asc' },
      select: {
        id: true,
        codigo: true,
        nombreComercial: true,
        marca: { select: { id: true, nombre: true } },
        referencia: {
          select: {
            id: true,
            codigo: true,
            tallaMin: { select: { id: true, valor: true, orden: true } },
            tallaMax: { select: { id: true, valor: true, orden: true } },
          },
        },
      },
    });
  }

  listarTallas() {
    return this.prisma.talla.findMany({ orderBy: { orden: 'asc' } });
  }

  listarReferencias() {
    return this.prisma.referencia.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombreInterno: true },
    });
  }
}
