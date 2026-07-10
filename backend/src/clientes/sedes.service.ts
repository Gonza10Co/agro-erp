import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CrearSedeDto } from './dto/crear-sede.dto';
import { ActualizarSedeDto } from './dto/actualizar-sede.dto';
import { debeNacerPrincipal } from './sedes-core';

@Injectable()
export class SedesService {
  constructor(private readonly prisma: PrismaService) {}

  listar(clienteId: number) {
    return this.prisma.sedeCliente.findMany({
      where: { clienteId },
      orderBy: [{ esPrincipal: 'desc' }, { nombre: 'asc' }],
    });
  }

  async crear(clienteId: number, dto: CrearSedeDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.clienteExisteOFalla(clienteId);
      const existentes = await tx.sedeCliente.count({ where: { clienteId } });
      const principal = debeNacerPrincipal(existentes, dto.esPrincipal);
      if (principal) await this.destronarPrincipal(tx, clienteId);
      return tx.sedeCliente.create({
        data: {
          clienteId,
          nombre: dto.nombre,
          ciudad: dto.ciudad,
          direccion: dto.direccion,
          telefono: dto.telefono,
          esPrincipal: principal,
        },
      });
    });
  }

  async actualizar(clienteId: number, sedeId: number, dto: ActualizarSedeDto) {
    return this.prisma.$transaction(async (tx) => {
      const sede = await this.sedeExisteOFalla(clienteId, sedeId);

      // Nadie puede dejar al cliente sin sede principal quitándole la marca a la única
      // que la tiene: primero hay que coronar a otra.
      if (dto.esPrincipal === false && sede.esPrincipal)
        throw new BadRequestException(
          'Para quitar la marca de principal, primero designa otra sede como principal',
        );

      if (dto.esPrincipal === true && !sede.esPrincipal)
        await this.destronarPrincipal(tx, clienteId);

      return tx.sedeCliente.update({
        where: { id: sedeId },
        data: {
          nombre: dto.nombre,
          ciudad: dto.ciudad,
          direccion: dto.direccion,
          telefono: dto.telefono,
          esPrincipal: dto.esPrincipal,
        },
      });
    });
  }

  async desactivar(clienteId: number, sedeId: number) {
    const sede = await this.sedeExisteOFalla(clienteId, sedeId);

    if (sede.esPrincipal) {
      const otrasActivas = await this.prisma.sedeCliente.count({
        where: { clienteId, activo: true, id: { not: sedeId } },
      });
      if (otrasActivas > 0)
        throw new BadRequestException(
          'Es la sede principal: designa otra como principal antes de desactivarla',
        );
    }

    // Al archivarla suelta la corona; si no, chocaría con el índice único parcial
    // cuando el cliente vuelva a tener una sede principal.
    return this.prisma.sedeCliente.update({
      where: { id: sedeId },
      data: { activo: false, esPrincipal: false },
    });
  }

  /** Baja la marca de principal a quien la tenga. El índice único parcial no admite dos. */
  private destronarPrincipal(
    tx: Pick<PrismaService, 'sedeCliente'>,
    clienteId: number,
  ) {
    return tx.sedeCliente.updateMany({
      where: { clienteId, esPrincipal: true },
      data: { esPrincipal: false },
    });
  }

  private async clienteExisteOFalla(clienteId: number) {
    const c = await this.prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!c) throw new NotFoundException(`Cliente ${clienteId} no existe`);
    return c;
  }

  private async sedeExisteOFalla(clienteId: number, sedeId: number) {
    const sede = await this.prisma.sedeCliente.findUnique({ where: { id: sedeId } });
    if (!sede || sede.clienteId !== clienteId)
      throw new NotFoundException(`La sede ${sedeId} no existe para el cliente ${clienteId}`);
    return sede;
  }
}
