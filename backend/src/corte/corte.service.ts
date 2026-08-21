import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstadoOrdenCorte } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  alertasDeOrden,
  consolidarConsumos,
  fechaDeJornada,
  rangoDeJornadas,
  esTransicionValida,
  indicadoresDeOrden,
  selloDeEstado,
  siguienteEstadoCorte,
  UMBRALES_CORTE_DEFAULT,
} from './orden-corte-core';
import { CrearOrdenCorteDto } from './dto/crear-orden-corte.dto';
import { AvanzarOrdenCorteDto } from './dto/avanzar-orden-corte.dto';
import { RegistrarAvanceDto } from './dto/registrar-avance.dto';

const INCLUDE_DETALLE = {
  linea: true,
  marca: true,
  lineas: {
    include: {
      productoConfigurado: { include: { referencia: true, marca: true } },
      talla: true,
    },
  },
  avances: {
    include: { operario: true, consumos: { include: { material: true } } },
    orderBy: { fecha: 'asc' as const },
  },
};

@Injectable()
export class CorteService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(filtros: { lineaId?: number; estado?: EstadoOrdenCorte; desde?: string; hasta?: string }) {
    const where: any = {};
    if (filtros.lineaId) where.lineaId = filtros.lineaId;
    if (filtros.estado) where.estado = filtros.estado;
    if (filtros.desde || filtros.hasta) {
      where.fecha = rangoDeJornadas(filtros.desde, filtros.hasta);
    }

    const ordenes = await this.prisma.ordenCorte.findMany({
      where,
      include: {
        linea: true,
        marca: true,
        lineas: { select: { cantProgramada: true, cantCortada: true, cantAmarrada: true } },
        avances: { select: { piezasCortadas: true, piezasDanadas: true, piezasRepuestas: true } },
      },
      orderBy: [{ fecha: 'desc' }, { codigo: 'desc' }],
    });

    return ordenes.map((o) => ({
      id: o.id,
      codigo: o.codigo,
      fecha: o.fecha,
      estado: o.estado,
      linea: o.linea,
      marca: o.marca,
      indicadores: indicadoresDeOrden(o),
      alertas: alertasDeOrden(o, UMBRALES_CORTE_DEFAULT),
    }));
  }

  async obtener(id: number) {
    const orden = await this.prisma.ordenCorte.findUnique({
      where: { id },
      include: INCLUDE_DETALLE,
    });
    if (!orden) throw new NotFoundException(`Orden de corte ${id} no existe`);

    return {
      ...orden,
      indicadores: indicadoresDeOrden(orden),
      alertas: alertasDeOrden(orden, UMBRALES_CORTE_DEFAULT),
      // El mismo material llega repartido entre los avances de varios días: se
      // consolida acá para poder compararlo contra el BOM de un vistazo.
      consumos: consolidarConsumos(orden.avances),
      siguienteEstado: siguienteEstadoCorte(orden.estado),
    };
  }

  async crear(dto: CrearOrdenCorteDto) {
    const repetida = await this.prisma.ordenCorte.findUnique({ where: { codigo: dto.codigo } });
    if (repetida) throw new ConflictException(`La orden de corte ${dto.codigo} ya existe`);

    // Una misma combinación producto+talla no puede venir dos veces: el formato
    // del cliente trae una columna por talla, así que sería un error de carga.
    const claves = dto.lineas.map((l) => `${l.productoConfiguradoId}-${l.tallaId}`);
    if (new Set(claves).size !== claves.length) {
      throw new BadRequestException('La orden trae la misma referencia y talla repetida');
    }

    return this.prisma.ordenCorte.create({
      data: {
        codigo: dto.codigo,
        fecha: fechaDeJornada(dto.fecha),
        lineaId: dto.lineaId,
        marcaId: dto.marcaId ?? null,
        observaciones: dto.observaciones ?? null,
        lineas: {
          create: dto.lineas.map((l) => ({
            productoConfiguradoId: l.productoConfiguradoId,
            tallaId: l.tallaId,
            cantProgramada: l.cantProgramada,
            ofId: l.ofId ?? null,
          })),
        },
      },
      include: INCLUDE_DETALLE,
    });
  }

  async avanzar(id: number, dto: AvanzarOrdenCorteDto) {
    const orden = await this.prisma.ordenCorte.findUnique({
      where: { id },
      include: { lineas: true },
    });
    if (!orden) throw new NotFoundException(`Orden de corte ${id} no existe`);

    if (!esTransicionValida(orden.estado, dto.estado)) {
      throw new ConflictException(
        `No se puede pasar la orden de ${orden.estado} a ${dto.estado}: el recorrido no se devuelve`,
      );
    }

    // Al entregar, corte reporta cuántos pares salieron de verdad. Sin ese dato
    // el cumplimiento no se puede calcular, así que se exige acá.
    const cantidades = dto.cantidades ?? {};
    if (dto.estado === 'ENTREGADA' && Object.keys(cantidades).length === 0) {
      throw new BadRequestException(
        'Para entregar la orden hay que reportar cuántos pares se cortaron por talla',
      );
    }

    const sello = selloDeEstado(dto.estado);

    return this.prisma.$transaction(async (tx) => {
      for (const [lineaId, cantCortada] of Object.entries(cantidades)) {
        const linea = orden.lineas.find((l) => l.id === Number(lineaId));
        if (!linea) {
          throw new BadRequestException(`La línea ${lineaId} no pertenece a esta orden`);
        }
        await tx.ordenCorteLinea.update({
          where: { id: linea.id },
          data: { cantCortada },
        });
      }

      return tx.ordenCorte.update({
        where: { id },
        data: {
          estado: dto.estado,
          ...(sello ? { [sello]: new Date() } : {}),
        },
        include: INCLUDE_DETALLE,
      });
    });
  }

  async registrarAvance(id: number, dto: RegistrarAvanceDto) {
    const orden = await this.prisma.ordenCorte.findUnique({ where: { id } });
    if (!orden) throw new NotFoundException(`Orden de corte ${id} no existe`);
    if (orden.estado === 'ANULADA') {
      throw new ConflictException('La orden está anulada: no admite avances');
    }
    if ((dto.piezasRepuestas ?? 0) > dto.piezasCortadas) {
      throw new BadRequestException(
        'No se pueden reponer más piezas de las que se cortaron',
      );
    }

    return this.prisma.avanceCorte.create({
      data: {
        ordenCorteId: id,
        piezasCortadas: dto.piezasCortadas,
        piezasDanadas: dto.piezasDanadas ?? 0,
        piezasRepuestas: dto.piezasRepuestas ?? 0,
        operarioId: dto.operarioId ?? null,
        observaciones: dto.observaciones ?? null,
        consumos: dto.consumos?.length
          ? {
              create: dto.consumos.map((c) => ({
                materialId: c.materialId,
                cantTeorica: c.cantTeorica,
                cantReal: c.cantReal,
              })),
            }
          : undefined,
      },
      include: { consumos: { include: { material: true } }, operario: true },
    });
  }

  /**
   * Resumen del período para el tablero: lo que Gabriel pidió ver de un vistazo.
   * Agrega los indicadores de todas las órdenes del rango.
   */
  async tablero(filtros: { lineaId?: number; desde?: string; hasta?: string }) {
    const ordenes = await this.listar(filtros);

    const total = ordenes.reduce(
      (acc, o) => ({
        programado: acc.programado + o.indicadores.programado,
        cortado: acc.cortado + o.indicadores.cortado,
        amarrado: acc.amarrado + o.indicadores.amarrado,
        piezasCortadas: acc.piezasCortadas + o.indicadores.piezasCortadas,
        piezasRepuestas: acc.piezasRepuestas + o.indicadores.piezasRepuestas,
        piezasDanadas: acc.piezasDanadas + o.indicadores.piezasDanadas,
      }),
      { programado: 0, cortado: 0, amarrado: 0, piezasCortadas: 0, piezasRepuestas: 0, piezasDanadas: 0 },
    );

    return {
      ordenes,
      resumen: {
        ...total,
        cantOrdenes: ordenes.length,
        cumplimiento: total.programado > 0 ? total.cortado / total.programado : null,
        indiceReposicion:
          total.piezasCortadas > 0 ? total.piezasRepuestas / total.piezasCortadas : null,
        wip: total.cortado - total.amarrado,
        conAlertas: ordenes.filter((o) => o.alertas.length > 0).length,
      },
    };
  }
}
