import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CrearClienteDto } from './dto/crear-cliente.dto';

@Injectable()
export class ClientesService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearClienteDto) {
    const existe = await this.prisma.cliente.findUnique({ where: { nit: dto.nit } });
    if (existe) throw new ConflictException(`Ya existe un cliente con NIT ${dto.nit}`);
    return this.prisma.cliente.create({
      data: {
        nit: dto.nit,
        nombre: dto.nombre,
        ciudad: dto.ciudad,
        tipoCredito: dto.tipoCredito,
        cupo: dto.cupo,
      },
    });
  }

  listar() {
    return this.prisma.cliente.findMany({ orderBy: { nombre: 'asc' } });
  }

  obtener(id: number) {
    return this.prisma.cliente.findUnique({ where: { id } });
  }
}
