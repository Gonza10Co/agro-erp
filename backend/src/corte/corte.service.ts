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
  pendientesDeCorte,
  selloDeEstado,
  siguienteEstadoCorte,
  UMBRALES_CORTE_DEFAULT,
} from './orden-corte-core';
import { CrearOrdenCorteDto } from './dto/crear-orden-corte.dto';
import { AvanzarOrdenCorteDto } from './dto/avanzar-orden-corte.dto';
import { RegistrarAvanceDto } from './dto/registrar-avance.dto';

// El consumo de corte solo necesita identificar el material: el select deja
// fuera `costoBase`/`costoPromedio`, que el jefe de corte no debe ver.
const MATERIAL_SIN_COSTO = { select: { id: true, codigo: true, nombreCanonico: true } };

// Las pantallas de corte solo muestran el nombre de la línea: el select deja fuera
// la razón social, el NIT y los datos de pago.
const LINEA_BASICA = { select: { id: true, codigo: true, nombre: true } };

const INCLUDE_DETALLE = {
  linea: LINEA_BASICA,
  marca: true,
  lineas: {
    include: {
      productoConfigurado: { include: { referencia: true, marca: true } },
      talla: true,
    },
  },
  avances: {
    include: { operario: true, consumos: { include: { material: MATERIAL_SIN_COSTO } } },
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
        linea: LINEA_BASICA,
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

    // Un renglón amarrado a una OF cerrada o inexistente sería corte huérfano.
    const ofIds = [...new Set(dto.lineas.map((l) => l.ofId).filter((x): x is number => !!x))];
    if (ofIds.length) {
      const abiertas = await this.prisma.ordenFabricacion.findMany({
        where: { id: { in: ofIds }, estado: { in: ['ABIERTA', 'EN_PROCESO'] } },
        select: { id: true },
      });
      const faltan = ofIds.filter((id) => !abiertas.some((o) => o.id === id));
      if (faltan.length) {
        throw new BadRequestException(
          `La OF ${faltan.join(', ')} no existe o ya no está abierta: no se le puede programar corte`,
        );
      }
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

  /**
   * Las OF abiertas que se pueden mandar a corte, con lo que falta programar por
   * producto × talla. Alimenta el formulario "Nueva orden de corte". Vive en
   * `corte/*` para que el jefe de corte lo use sin abrirle fabricación, y por eso
   * el select es corto: nombres e ids, nada de precios, NIT ni cartera.
   */
  async ofsDisponibles() {
    const ofs = await this.prisma.ordenFabricacion.findMany({
      where: {
        estado: { in: ['ABIERTA', 'EN_PROCESO'] },
        op: { estado: { in: ['CREADA', 'AMARRADA', 'EN_PRODUCCION'] } },
      },
      orderBy: { consecutivo: 'asc' },
      select: {
        id: true,
        consecutivo: true,
        estado: true,
        op: {
          select: {
            id: true,
            consecutivo: true,
            linea: LINEA_BASICA,
            oc: {
              select: {
                id: true,
                consecutivo: true,
                ocCliente: true,
                cliente: { select: { nombre: true } },
              },
            },
            lineas: {
              select: {
                productoConfiguradoId: true,
                productoConfigurado: {
                  select: { codigo: true, nombreComercial: true, referencia: { select: { codigo: true } } },
                },
                tallas: {
                  select: { tallaId: true, cantAProducir: true, talla: { select: { valor: true } } },
                },
              },
            },
          },
        },
        // Lo que ya salió para corte en órdenes de otros días. Una anulada no cuenta.
        lineasCorte: {
          where: { ordenCorte: { estado: { not: 'ANULADA' } } },
          select: { productoConfiguradoId: true, tallaId: true, cantProgramada: true },
        },
      },
    });

    return ofs.map((of) => {
      const producto = new Map<number, { codigo: string; nombre: string; referencia: string | null }>();
      const talla = new Map<number, number>();
      const programa = of.op.lineas.flatMap((l) => {
        producto.set(l.productoConfiguradoId, {
          codigo: l.productoConfigurado.codigo,
          nombre: l.productoConfigurado.nombreComercial,
          referencia: l.productoConfigurado.referencia?.codigo ?? null,
        });
        return l.tallas.map((t) => {
          talla.set(t.tallaId, t.talla.valor);
          return { productoConfiguradoId: l.productoConfiguradoId, tallaId: t.tallaId, cantAProducir: t.cantAProducir };
        });
      });
      const renglones = pendientesDeCorte(programa, of.lineasCorte)
        .map((r) => ({ ...r, producto: producto.get(r.productoConfiguradoId)!, talla: talla.get(r.tallaId)! }))
        .sort((a, b) => a.productoConfiguradoId - b.productoConfiguradoId || a.talla - b.talla);

      return {
        id: of.id,
        consecutivo: of.consecutivo,
        estado: of.estado,
        op: { id: of.op.id, consecutivo: of.op.consecutivo },
        oc: {
          id: of.op.oc.id,
          consecutivo: of.op.oc.consecutivo,
          ocCliente: of.op.oc.ocCliente,
          cliente: of.op.oc.cliente.nombre,
        },
        linea: of.op.linea,
        aProducir: renglones.reduce((a, r) => a + r.aProducir, 0),
        pendiente: renglones.reduce((a, r) => a + r.pendiente, 0),
        renglones,
      };
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
      include: { consumos: { include: { material: MATERIAL_SIN_COSTO } }, operario: true },
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
