import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { agruparIndicadores, codigoReposicion, validarReporte } from './calidad-core';
import { ReportarIncidenciaDto } from './dto/reportar-incidencia.dto';

interface Usuario {
  sub: number;
  role: string;
}

const MSG_ESTADO: Record<string, string> = {
  TERMINADO: 'El par ya está terminado',
  CANCELADO: 'El par está cancelado (OP anulada)',
  DADO_DE_BAJA: 'El par ya fue dado de baja',
};

@Injectable()
export class CalidadService {
  constructor(private readonly prisma: PrismaService) {}

  listarTiposDano() {
    return this.prisma.tipoDano.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  async reportar(codigo: string, dto: ReportarIncidenciaDto, user: Usuario) {
    const par = await this.prisma.par.findUnique({ where: { codigo } });
    if (!par) throw new NotFoundException(`Par ${codigo} no existe`);
    const tipo = await this.prisma.tipoDano.findUnique({ where: { id: dto.tipoDanoId } });
    if (!tipo || !tipo.activo)
      throw new NotFoundException('Tipo de daño inexistente o inactivo');
    if (par.estado !== 'EN_PROCESO')
      throw new ConflictException(MSG_ESTADO[par.estado] ?? 'El par no está en proceso');

    const err = validarReporte(tipo.clase, dto.descripcion, user.role);
    if (err === 'ROL_INSUFICIENTE')
      throw new ForbiddenException('Solo un gerente puede autorizar una baja');
    if (err === 'SIN_DESCRIPCION')
      throw new BadRequestException('La baja requiere descripción (acta)');

    try {
      if (tipo.clase === 'REPROCESO') {
        const incidencia = await this.prisma.incidenciaCalidad.create({
          data: {
            parId: par.id,
            tipoDanoId: tipo.id,
            celulaDeteccion: par.celulaActual,
            operarioId: dto.operarioId,
            descripcion: dto.descripcion ?? null,
          },
          include: { tipoDano: true },
        });
        return { incidencia, parReposicion: null };
      }
      return await this.darDeBaja(par, tipo.id, dto, user);
    } catch (e: unknown) {
      // FK inválida del reporte → 400; cualquier otra cosa se relanza (patrón fabricacion).
      if ((e as { code?: string })?.code === 'P2003')
        throw new BadRequestException('Operario inexistente');
      throw e;
    }
  }

  private darDeBaja(
    par: {
      id: number;
      codigo: string;
      ofId: number;
      productoConfiguradoId: number;
      tallaId: number;
      celulaActual: any;
    },
    tipoDanoId: number,
    dto: ReportarIncidenciaDto,
    user: Usuario,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Condición sobre el estado para no pisar un par que otra tx acaba de
      // terminar/cancelar (mismo patrón que el cierre de OF en fabricacion).
      const res = await tx.par.updateMany({
        where: { id: par.id, estado: 'EN_PROCESO' },
        data: { estado: 'DADO_DE_BAJA' },
      });
      if (res.count === 0)
        throw new ConflictException(
          'El par cambió de estado durante la baja — recargalo e intentá de nuevo',
        );

      const parReposicion = await tx.par.create({
        data: {
          codigo: codigoReposicion(par.codigo),
          ofId: par.ofId,
          productoConfiguradoId: par.productoConfiguradoId,
          tallaId: par.tallaId,
          celulaActual: 'CORTE',
          reponeAParId: par.id,
        },
      });

      const incidencia = await tx.incidenciaCalidad.create({
        data: {
          parId: par.id,
          tipoDanoId,
          celulaDeteccion: par.celulaActual,
          operarioId: dto.operarioId,
          descripcion: dto.descripcion,
          autorizadoPorId: user.sub,
          parReposicionId: parReposicion.id,
        },
        include: { tipoDano: true },
      });

      return { incidencia, parReposicion };
    });
  }
}
