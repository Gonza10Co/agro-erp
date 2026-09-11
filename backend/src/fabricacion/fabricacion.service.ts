import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Celula, EstadoPar, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { siguienteConsecutivo } from '../prisma/consecutivo';
import {
  estacionDeEstado,
  generarPares,
  LineaProduccion,
  EstacionDef,
  siguienteEstacion,
  esEstacionTerminal,
  estacionNacimiento,
  validarEstacion,
  paresPorEstacion,
  avanceHoyPorEstacion,
  inicioDelDiaBogota,
  OFFSET_BOGOTA_HORAS,
} from './fabricacion-core';
import { diasHabilesDelMes, metaDiaria } from '../reportes/calendario-habil';
import { AvanzarDto } from './dto/avanzar.dto';
import { NacerDto } from './dto/nacer.dto';
import { RegistrarConsumoDto } from './dto/registrar-consumo.dto';
import {
  consolidarConsumo,
  repartirDescargaDeReserva,
  LineaReservaMin,
} from './consumo-of-core';
import { BomLoaderService } from '../catalog/bom/bom-loader.service';
import { resolverBom } from '../catalog/bom/bom-resolver';
import { EntradaResolucion } from '../catalog/bom/bom-resolver.types';

type DecimalLike = { toNumber(): number } | number | null | undefined;
const num = (d: DecimalLike): number =>
  d == null ? 0 : typeof d === 'number' ? d : d.toNumber();

/** Columna del tablero para los pares que no están en ninguna estación activa. */
export const OTRAS_ESTACIONES = 'OTROS';
/** Columna del tablero para lo programado que todavía no nació: sus piezas están en corte. */
export const CORTE_PENDIENTE = 'CORTE_PENDIENTE';

@Injectable()
export class FabricacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bomLoader: BomLoaderService,
  ) {}

  /** Envoltorio espiable del resolver puro de Demo 2 (igual que en compras). */
  protected resolver(entrada: EntradaResolucion) {
    return resolverBom(entrada);
  }

  async generarOF(opId: number) {
    const op = await this.prisma.ordenProduccion.findUnique({
      where: { id: opId },
      include: {
        // La línea del PEDIDO (heredada de la OC) define el punto de arranque del
        // par; la de la marca queda solo como fallback histórico.
        linea: true,
        lineas: {
          include: {
            tallas: true,
            productoConfigurado: { include: { marca: { include: { linea: true } } } },
          },
        },
        ordenesFabricacion: true,
      },
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
          // Línea por pedido: la de la OP manda; marca = fallback; sin línea → CORTE.
          celulaInicial:
            op.linea?.celulaInicial ??
            l.productoConfigurado?.marca?.linea?.celulaInicial ??
            'CORTE',
          // Punto de conversión lote→par. Hoy nadie lo tiene puesto, así que el
          // par sigue entrando a guarnición por AREA; el día que la planta
          // decida dónde se pega la etiqueta, se llena el campo y no el código.
          subPasoInicial:
            op.linea?.subPasoInicial ??
            l.productoConfigurado?.marca?.linea?.subPasoInicial ??
            null,
          lineaId: op.lineaId ?? l.productoConfigurado?.marca?.lineaId ?? null,
        })),
    );
    if (lineas.length === 0)
      throw new BadRequestException('La OP no tiene producción pendiente');

    // La OF nace VACÍA. Hasta el 2026-09-09 acá se creaban todos los pares de
    // una vez, naciendo en CORTE, donde el par no existe (Gabriel, 04-ago). Ahora
    // cada par nace cuando se le imprime la etiqueta en Preparación (`nacer`),
    // y la OF solo lleva lo programado (las tallas de la OP).
    const programados = lineas.reduce((acc, l) => acc + l.cantAProducir, 0);
    return this.prisma.$transaction(async (tx) => {
      const consecutivo = await siguienteConsecutivo(tx, 'of');
      const of = await tx.ordenFabricacion.create({ data: { consecutivo, opId } });
      return { id: of.id, consecutivo, opId, totalPares: 0, programados };
    });
  }

  /** Las estaciones (puntos de control) en el orden del recorrido, activas o no. */
  estaciones(): Promise<EstacionDef[]> {
    return this.prisma.estacion.findMany({ orderBy: { orden: 'asc' } });
  }

  /** Prender o apagar una estación. PT no se apaga: es donde termina el par. */
  async activarEstacion(codigo: string, activa: boolean) {
    const est = await this.prisma.estacion.findUnique({ where: { codigo } });
    if (!est) throw new NotFoundException(`Estación ${codigo} no existe`);
    if (est.celula === 'PT' && !activa)
      throw new BadRequestException('Producto terminado no se puede apagar: ahí termina el par');
    return this.prisma.estacion.update({ where: { codigo }, data: { activa } });
  }

  /**
   * Nace una tanda de pares de la OF en su estación inicial (Preparación para
   * Basarili: se imprime la etiqueta y se pega en la lengua). Devuelve los pares
   * con lo que va en la etiqueta. Es el primer pistolazo: "de no existir a existir".
   */
  async nacer(ofId: number, dto: NacerDto) {
    const cantidad = dto.cantidad ?? 1;
    const of = await this.prisma.ordenFabricacion.findUnique({
      where: { id: ofId },
      include: {
        op: {
          include: {
            linea: true,
            lineas: {
              include: {
                tallas: { include: { talla: true } },
                productoConfigurado: { include: { marca: { include: { linea: true } } } },
              },
            },
          },
        },
      },
    });
    if (!of) throw new NotFoundException(`OF ${ofId} no existe`);
    if (of.estado === 'ANULADA' || of.estado === 'TERMINADA')
      throw new ConflictException(`La OF está ${of.estado.toLowerCase()}: no nacen más pares`);

    const linea: any = of.op.lineas.find(
      (l: any) => l.productoConfiguradoId === dto.productoConfiguradoId,
    );
    if (!linea) throw new BadRequestException('La OF no fabrica ese producto');
    const talla: any = linea.tallas.find((t: any) => t.tallaId === dto.tallaId);
    if (!talla || talla.cantAProducir <= 0)
      throw new BadRequestException('La OF no programa esa talla');

    const celulaInicial: Celula =
      of.op.linea?.celulaInicial ??
      linea.productoConfigurado?.marca?.linea?.celulaInicial ??
      'CORTE';
    const lineaId: number | null =
      of.op.lineaId ?? linea.productoConfigurado?.marca?.lineaId ?? null;
    const estaciones = await this.estaciones();
    const nac = estacionNacimiento(celulaInicial, estaciones);
    if (!nac) throw new BadRequestException('No hay ninguna estación activa donde nazca el par');

    const creados = await this.prisma.$transaction(async (tx) => {
      // Dos celulares imprimiendo a la vez sobre la misma OF no se pisan la numeración.
      await tx.$queryRaw`SELECT id FROM "OrdenFabricacion" WHERE id = ${ofId} FOR UPDATE`;
      const nacidos = await tx.par.count({
        where: {
          ofId,
          productoConfiguradoId: dto.productoConfiguradoId,
          tallaId: dto.tallaId,
          reponeAParId: null,
          estado: { not: 'CANCELADO' },
        },
      });
      if (nacidos + cantidad > talla.cantAProducir)
        throw new ConflictException(
          `La talla ${talla.talla?.valor ?? dto.tallaId} ya tiene ${nacidos} de ${talla.cantAProducir} pares programados; caben ${Math.max(talla.cantAProducir - nacidos, 0)}`,
        );
      // Las reposiciones llevan sufijo (-R1), así que no ocupan número de la secuencia.
      const seqBase = await tx.par.count({ where: { ofId, reponeAParId: null } });
      const pares = generarPares(
        of.consecutivo,
        [{
          productoConfiguradoId: dto.productoConfiguradoId,
          tallaId: dto.tallaId,
          cantAProducir: cantidad,
          celulaInicial: nac.celula,
          subPasoInicial: nac.subPaso,
          lineaId,
        }],
        seqBase,
      );
      await tx.par.createMany({
        data: pares.map((p) => ({
          ofId,
          codigo: p.codigo,
          productoConfiguradoId: p.productoConfiguradoId,
          tallaId: p.tallaId,
          celulaActual: nac.celula,
          subPasoActual: nac.subPaso,
          subPasoInyeccion: nac.subPasoInyeccion,
          lineaId: p.lineaId,
        })),
      });
      const nuevos = await tx.par.findMany({
        where: { codigo: { in: pares.map((p) => p.codigo) } },
        orderBy: { codigo: 'asc' },
        select: {
          id: true,
          codigo: true,
          talla: { select: { valor: true } },
          productoConfigurado: {
            select: {
              codigo: true,
              nombreComercial: true,
              referencia: { select: { codigo: true, nombreInterno: true } },
              marca: { select: { nombre: true } },
            },
          },
          linea: { select: { codigo: true, nombre: true } },
        },
      });
      // El nacimiento es un evento de entrada a la estación inicial: la TV lo cuenta.
      await tx.eventoTrazabilidad.createMany({
        data: nuevos.map((n) => ({
          parId: n.id,
          celula: nac.celula,
          subPaso: nac.subPaso,
          subPasoInyeccion: nac.subPasoInyeccion,
          estacionDestino: nac.codigo,
          celulaDestino: nac.celula,
          operarioId: dto.operarioId,
          maquinaId: dto.maquinaId ?? null,
        })),
      });
      if (of.estado === 'ABIERTA')
        await tx.ordenFabricacion.update({ where: { id: ofId }, data: { estado: 'EN_PROCESO' } });
      return nuevos;
    });

    const hoy = await this.hoyEnEstacion(nac.codigo);
    return {
      estacion: nac,
      hoy,
      pares: creados.map((n: any) => ({
        id: n.id,
        codigo: n.codigo,
        talla: String(n.talla.valor),
        producto: n.productoConfigurado?.nombreComercial ?? '',
        productoCodigo: n.productoConfigurado?.codigo ?? '',
        referencia: n.productoConfigurado?.referencia?.codigo ?? '',
        marca: n.productoConfigurado?.marca?.nombre ?? '',
        linea: n.linea?.nombre ?? '',
        of: of.consecutivo,
      })),
    };
  }

  /** Cuántos pares entraron hoy (día de Bogotá) a una estación. */
  private hoyEnEstacion(codigo: string): Promise<number> {
    return this.prisma.eventoTrazabilidad.count({
      where: { estacionDestino: codigo, timestamp: { gte: inicioDelDiaBogota(new Date()) } },
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
        {
          TERMINADO: 'El par ya está terminado',
          CANCELADO: 'El par está cancelado (OP anulada)',
          DADO_DE_BAJA: 'El par fue dado de baja',
        }[par.estado] ?? 'El par no está en proceso',
      );

    const celulaActual = par.celulaActual;
    const estado = {
      celula: par.celulaActual,
      subPaso: par.subPasoActual,
      subPasoInyeccion: par.subPasoInyeccion,
    };
    // La siguiente estación ACTIVA decide a dónde va el par; el operario no elige
    // nada. Si el dispositivo declara su estación, se valida que el par venga de
    // la anterior (es el control que pedía Mauricio: nada "en un limbo").
    const estaciones = await this.estaciones();
    if (dto.estacion) {
      const rechazo = validarEstacion(estado, dto.estacion, estaciones);
      if (rechazo) throw new ConflictException(rechazo);
    }
    const next = siguienteEstacion(estado, estaciones);
    // Entrar a Producto terminado ES terminar (5º pistolazo: carga la bodega).
    const terminar = esEstacionTerminal(next);
    const destino = {
      estacionDestino: next?.codigo ?? 'PT',
      celulaDestino: (next?.celula ?? 'PT') as Celula,
    };

    // La bodega destino es configuración global (no cambia durante la tx):
    // se resuelve fuera de la transacción para no alargarla.
    let bodegaPT: { id: number } | null = null;
    if (terminar) {
      bodegaPT = await this.prisma.bodega.findFirst({
        where: { tipo: 'PROPIA', activo: true },
        orderBy: { prioridad: 'asc' },
      });
      if (!bodegaPT)
        throw new BadRequestException('No hay bodega PROPIA configurada');
    }

    let resultado: any;
    try {
      resultado = await this.prisma.$transaction(async (tx) => {
        await tx.eventoTrazabilidad.create({
          data: {
            parId: par.id,
            celula: celulaActual,
            subPaso: par.subPasoActual,
            subPasoInyeccion: par.subPasoInyeccion,
            ...destino,
            operarioId: dto.operarioId,
            maquinaId: dto.maquinaId ?? null,
          },
        });

        // El primer escaneo de cualquier par activa la OF, sin importar en qué
        // célula arranque (la línea Feroz entra en INYECCION, no en CORTE).
        if (par.of.estado === 'ABIERTA') {
          await tx.ordenFabricacion.update({
            where: { id: par.ofId },
            data: { estado: 'EN_PROCESO' },
          });
        }

        if (terminar) {
          // Producto terminado: terminar el par y sumar a InventarioPT.
          const updated = await tx.par.update({
            where: { id: par.id },
            data: { estado: 'TERMINADO', celulaActual: 'PT', subPasoActual: null, subPasoInyeccion: null },
          });
          // El grado viaja del par al stock: una segunda no engorda el saldo de
          // primeras (son saldos distintos bajo la misma llave + calidad).
          const inv = await tx.inventarioPT.upsert({
            where: {
              productoConfiguradoId_tallaId_bodegaId_calidad: {
                productoConfiguradoId: par.productoConfiguradoId,
                tallaId: par.tallaId,
                bodegaId: bodegaPT!.id,
                calidad: par.calidad,
              },
            },
            create: {
              productoConfiguradoId: par.productoConfiguradoId,
              tallaId: par.tallaId,
              bodegaId: bodegaPT!.id,
              calidad: par.calidad,
              cantDisponible: 1,
            },
            update: { cantDisponible: { increment: 1 } },
          });
          // Kardex: cada par terminado es una ENTRADA de PT trazable al par.
          // La línea del par se sella en el movimiento (kardex PT por línea).
          await tx.movimientoInventario.create({
            data: {
              tipo: 'ENTRADA',
              motivo: 'PRODUCCION',
              inventarioPTId: inv.id,
              cantidad: 1,
              referencia: par.codigo,
              lineaId: par.lineaId ?? null,
            },
          });
          // El par ya fue marcado TERMINADO en esta misma tx, así que
          // este count no lo incluye (cuenta solo los que aún siguen en proceso).
          const restantes = await tx.par.count({
            where: { ofId: par.ofId, estado: 'EN_PROCESO' },
          });
          if (restantes === 0)
            // Condición sobre el estado para no pisar una OF que otra tx
            // acaba de ANULAR (anulación de OP concurrente al último escaneo).
            await tx.ordenFabricacion.updateMany({
              where: { id: par.ofId, estado: { not: 'ANULADA' } },
              data: { estado: 'TERMINADA' },
            });
          return updated;
        }

        // Avance normal a la siguiente estación (la activación de la OF ya se
        // resolvió arriba, en el primer escaneo).
        return tx.par.update({
          where: { id: par.id },
          data: {
            celulaActual: next!.celula,
            subPasoActual: next!.subPaso,
            subPasoInyeccion: next!.subPasoInyeccion ?? null,
          },
        });
      });
    } catch (e: unknown) {
      // FK inválida del escaneo → 400 con el campo concreto; cualquier otra
      // violación (p.ej. parId) se relanza para no enmascarar bugs reales.
      if ((e as { code?: string })?.code === 'P2003') {
        const campo = String(
          (e as { meta?: { field_name?: unknown } })?.meta?.field_name ?? '',
        );
        if (/operario/i.test(campo))
          throw new BadRequestException('Operario inexistente');
        if (/maquina/i.test(campo))
          throw new BadRequestException('Máquina inexistente');
        // Sin field_name (depende del driver) asumimos el caso típico del escaneo.
        if (campo === '')
          throw new BadRequestException('Operario o máquina inexistente');
      }
      throw e;
    }
    // Lo que ve el operario después del pistolazo: a dónde entró y cuántos van hoy.
    const hoy = await this.hoyEnEstacion(destino.estacionDestino);
    return {
      ...resultado,
      avance: {
        estacion: destino.estacionDestino,
        nombre: next?.nombre ?? 'Producto terminado',
        terminado: terminar,
        hoy,
      },
    };
  }

  async listarOF() {
    const ofs = await this.prisma.ordenFabricacion.findMany({
      orderBy: { consecutivo: 'desc' },
      select: {
        id: true,
        consecutivo: true,
        estado: true,
        fecha: true,
        op: {
          select: {
            consecutivo: true,
            // Lo programado vive en la OP: la OF nace vacía y solo acumula los pares nacidos.
            lineas: { select: { tallas: { select: { cantAProducir: true } } } },
          },
        },
        _count: { select: { pares: true } },
      },
    });
    return ofs.map(({ op, ...of }) => ({
      ...of,
      op: { consecutivo: op.consecutivo },
      programados: op.lineas.reduce(
        (acc, l) => acc + l.tallas.reduce((a, t) => a + t.cantAProducir, 0),
        0,
      ),
    }));
  }

  async obtenerOF(id: number) {
    const of = await this.prisma.ordenFabricacion.findUnique({
      where: { id },
      include: {
        op: {
          select: {
            consecutivo: true,
            // Lo programado por producto × talla: contra eso nacen los pares.
            lineas: {
              select: {
                productoConfiguradoId: true,
                productoConfigurado: { select: { codigo: true, nombreComercial: true } },
                tallas: {
                  select: { tallaId: true, cantAProducir: true, talla: { select: { valor: true } } },
                },
              },
            },
          },
        },
        pares: {
          orderBy: { codigo: 'asc' },
          select: {
            id: true,
            codigo: true,
            celulaActual: true,
            estado: true,
            talla: { select: { valor: true } },
            // Para las etiquetas físicas: qué es el par y por qué línea se fabrica.
            productoConfigurado: { select: { codigo: true, nombreComercial: true } },
            linea: { select: { codigo: true, nombre: true } },
            tallaId: true,
            productoConfiguradoId: true,
            reponeAParId: true,
          },
        },
      },
    });
    if (!of) throw new NotFoundException(`OF ${id} no existe`);
    return { ...of, programa: programaDeOf(of) };
  }

  /**
   * Tablero en números: cuántos pares hay parados en cada ESTACIÓN y con qué tallas.
   * Se cuenta por estación y no por célula porque es lo que la planta reconoce: un
   * operario está en "Bodega de corte", no en "Almacén", y Montaje y Finizaje son
   * dos puestos distintos aunque compartan célula. Un día son ~1.206 pares, así que
   * la vista no pide la lista: se cuenta en la base y el detalle se pide al abrir.
   */
  async tableroResumen(ofId?: number) {
    const where = ofId ? { ofId } : {};
    const [grupos, tallas, estaciones, ofs] = await Promise.all([
      this.prisma.par.groupBy({
        by: ['celulaActual', 'subPasoActual', 'subPasoInyeccion', 'estado', 'tallaId'],
        where,
        _count: { _all: true },
      }),
      this.prisma.talla.findMany({ select: { id: true, valor: true, orden: true } }),
      this.estaciones(),
      // Lo programado vive en la OP: contra eso se mide lo que falta por nacer.
      this.prisma.ordenFabricacion.findMany({
        where: ofId ? { id: ofId } : { estado: { in: ['ABIERTA', 'EN_PROCESO'] } },
        select: {
          op: { select: { lineas: { select: { tallas: { select: { tallaId: true, cantAProducir: true } } } } } },
        },
      }),
    ]);
    const laTalla = new Map(tallas.map((t) => [t.id, t]));
    const activas = estaciones.filter((e) => e.activa).sort((a, b) => a.orden - b.orden);

    // Una columna por estación activa, más "Otros" para los pares que no están en
    // ninguna (los que nacieron en CORTE antes del piloto, o en una estación apagada).
    const columnas = new Map<string, { codigo: string; nombre: string; total: number; porTalla: Map<number, number> }>();
    // Corte va primero: el par todavía no existe (no hay lengua a la cual pegarle el QR),
    // pero sus piezas sí se están cortando. Es lo programado menos lo ya nacido, no una
    // fila en la base — inventar 1.206 pares que nadie puede tocar fue el modelo anterior.
    columnas.set(CORTE_PENDIENTE, { codigo: CORTE_PENDIENTE, nombre: 'Corte', total: 0, porTalla: new Map() });
    for (const e of activas) columnas.set(e.codigo, { codigo: e.codigo, nombre: e.nombre, total: 0, porTalla: new Map() });
    columnas.set(OTRAS_ESTACIONES, { codigo: OTRAS_ESTACIONES, nombre: 'Otros', total: 0, porTalla: new Map() });

    let terminados = 0;
    let fueraDeFlujo = 0;
    let total = 0;
    for (const g of grupos) {
      const cuantos = g._count._all;
      total += cuantos;
      if (g.estado === 'TERMINADO') {
        terminados += cuantos;
        continue;
      }
      if (g.estado === 'DADO_DE_BAJA' || g.estado === 'CANCELADO') {
        fueraDeFlujo += cuantos;
        continue;
      }
      const estacion = estacionDeEstado(
        { celula: g.celulaActual, subPaso: g.subPasoActual, subPasoInyeccion: g.subPasoInyeccion },
        activas,
      );
      const col = columnas.get(estacion?.codigo ?? OTRAS_ESTACIONES)!;
      col.total += cuantos;
      col.porTalla.set(g.tallaId, (col.porTalla.get(g.tallaId) ?? 0) + cuantos);
    }

    // Nacidos por talla (en cualquier estado: el par ya existe) contra lo programado.
    const nacidosPorTalla = new Map<number, number>();
    for (const g of grupos) nacidosPorTalla.set(g.tallaId, (nacidosPorTalla.get(g.tallaId) ?? 0) + g._count._all);
    const corte = columnas.get(CORTE_PENDIENTE)!;
    for (const of of ofs) {
      for (const linea of of.op.lineas) {
        for (const t of linea.tallas) {
          corte.porTalla.set(t.tallaId, (corte.porTalla.get(t.tallaId) ?? 0) + t.cantAProducir);
        }
      }
    }
    for (const [tallaId, programado] of corte.porTalla) {
      const faltan = Math.max(programado - (nacidosPorTalla.get(tallaId) ?? 0), 0);
      if (faltan) corte.porTalla.set(tallaId, faltan);
      else corte.porTalla.delete(tallaId);
    }
    corte.total = [...corte.porTalla.values()].reduce((a, b) => a + b, 0);
    const programado = ofs.reduce(
      (acc, of) => acc + of.op.lineas.reduce((a, l) => a + l.tallas.reduce((x, t) => x + t.cantAProducir, 0), 0),
      0,
    );

    const salida = [...columnas.values()]
      // "Otros" solo estorba cuando está vacío: es la excepción, no una etapa del flujo.
      .filter((c) => (c.codigo !== OTRAS_ESTACIONES && c.codigo !== CORTE_PENDIENTE) || c.total > 0)
      .map((c) => ({
        codigo: c.codigo,
        nombre: c.nombre,
        total: c.total,
        // Por talla, en el orden del catálogo: es lo que la planta pregunta
        // ("¿cuántas 38 hay en guarnición?"), no el total pelado.
        tallas: [...c.porTalla.entries()]
          .map(([tallaId, cantidad]) => ({
            talla: laTalla.get(tallaId)?.valor ?? tallaId,
            orden: laTalla.get(tallaId)?.orden ?? 0,
            cantidad,
          }))
          .sort((a, b) => a.orden - b.orden)
          .map(({ talla, cantidad }) => ({ talla, cantidad })),
      }));

    return { estaciones: salida, terminados, fueraDeFlujo, total, programado };
  }

  /**
   * El detalle de una columna del tablero: la lista de pares. Va paginado
   * porque una célula puede tener cientos de pares en un día normal.
   */
  async tablero(
    ofId?: number,
    filtro?: { estacion?: string; estados?: EstadoPar[]; take?: number; skip?: number },
  ) {
    const { estacion, estados, take = 100, skip = 0 } = filtro ?? {};
    return this.prisma.par.findMany({
      where: {
        ...(ofId ? { ofId } : {}),
        ...(estacion ? await this.dondeEstaLaEstacion(estacion) : {}),
        // "Fuera de flujo" son dos estados (baja y cancelado), por eso es una lista.
        ...(estados?.length ? { estado: { in: estados } } : {}),
      },
      take: Math.min(take, 500),
      skip,
      orderBy: { codigo: 'asc' },
      select: {
        id: true,
        codigo: true,
        celulaActual: true,
        subPasoActual: true,
        estado: true,
        talla: { select: { valor: true } },
        of: { select: { consecutivo: true } },
      },
    });
  }

  /**
   * Dónde está parado un par de esa estación. "Otros" es el complemento: todo lo que
   * no cae en ninguna estación activa (pares de antes del piloto, o de una apagada).
   */
  private async dondeEstaLaEstacion(codigo: string): Promise<Prisma.ParWhereInput> {
    const activas = (await this.estaciones()).filter((e) => e.activa);
    const posicion = (e: EstacionDef): Prisma.ParWhereInput => ({
      celulaActual: e.celula,
      subPasoActual: e.subPaso,
      subPasoInyeccion: e.subPasoInyeccion,
    });
    if (codigo === OTRAS_ESTACIONES) return { NOT: { OR: activas.map(posicion) } };
    const est = activas.find((e) => e.codigo === codigo);
    if (!est) throw new NotFoundException(`Estación ${codigo} no existe o está apagada`);
    return posicion(est);
  }

  async obtenerPar(codigo: string) {
    const par = await this.prisma.par.findUnique({
      where: { codigo },
      include: {
        of: { select: { consecutivo: true } },
        talla: { select: { valor: true } },
        // Nombres para la pantalla de estación y el sticker de la caja en PT.
        productoConfigurado: {
          select: {
            id: true,
            codigo: true,
            nombreComercial: true,
            referencia: { select: { codigo: true, nombreInterno: true } },
            marca: { select: { nombre: true } },
          },
        },
        linea: { select: { codigo: true, nombre: true } },
        eventos: {
          orderBy: { timestamp: 'asc' },
          include: {
            operario: { select: { nombre: true } },
            maquina: { select: { nombre: true } },
          },
        },
        incidencias: {
          orderBy: { timestamp: 'asc' },
          include: {
            tipoDano: true,
            operario: { select: { nombre: true } },
            autorizadoPor: { select: { username: true } },
            parReposicion: { select: { codigo: true } },
          },
        },
        reponeA: { select: { codigo: true } },
        repuestoPor: { select: { codigo: true } },
      },
    });
    if (!par) throw new NotFoundException(`Par ${codigo} no existe`);
    return par;
  }

  listarOperarios(celula?: Celula) {
    return this.prisma.operario.findMany({
      where: { activo: true, ...(celula ? { celula } : {}) },
      orderBy: { nombre: 'asc' },
    });
  }

  listarMaquinas(celula?: Celula) {
    return this.prisma.maquina.findMany({
      where: { activo: true, ...(celula ? { celula } : {}) },
      orderBy: { nombre: 'asc' },
    });
  }

  // ─────────────────── Consumo real de materiales por OF ───────────────────
  // El almacenista registra a mano lo que entregó (decisión del cliente del
  // 2026-07-29: no hay backflush contra el BOM). Hasta acá el material solo se
  // reservaba al confirmar el pedido; esto es lo que por fin lo descuenta.

  /** Consumo teórico de la OF: BOM resuelto × pares programados (+ reposiciones), por material. */
  private async teoricoDeOf(ofId: number): Promise<Map<number, number>> {
    // Desde el piloto los pares nacen de a pocos en Preparación, pero el material
    // se corta ANTES de que exista el par: el teórico sale de lo programado en la
    // OP. Las reposiciones (un par dado de baja que se vuelve a hacer) sí gastaron
    // material extra, así que suman aparte; el CANCELADO nunca se produjo.
    const of = await this.prisma.ordenFabricacion.findUnique({
      where: { id: ofId },
      select: {
        op: {
          select: {
            lineas: {
              select: {
                productoConfiguradoId: true,
                tallas: { select: { tallaId: true, cantAProducir: true } },
              },
            },
          },
        },
      },
    });
    const conteo = new Map<string, { productoConfiguradoId: number; tallaId: number; _count: number }>();
    const sumar = (productoConfiguradoId: number, tallaId: number, n: number) => {
      const k = `${productoConfiguradoId}:${tallaId}`;
      const g = conteo.get(k) ?? { productoConfiguradoId, tallaId, _count: 0 };
      g._count += n;
      conteo.set(k, g);
    };
    for (const l of (of?.op?.lineas ?? []) as any[])
      for (const t of l.tallas as any[])
        if (t.cantAProducir > 0) sumar(l.productoConfiguradoId, t.tallaId, t.cantAProducir);
    const reposiciones = await this.prisma.par.groupBy({
      by: ['productoConfiguradoId', 'tallaId'],
      where: { ofId, reponeAParId: { not: null }, estado: { not: 'CANCELADO' } },
      _count: true,
    });
    for (const r of reposiciones as any[]) sumar(r.productoConfiguradoId, r.tallaId, r._count as number);
    const grupos = [...conteo.values()];
    if (!grupos.length) return new Map();

    const pcs = await this.prisma.productoConfigurado.findMany({
      where: { id: { in: [...new Set(grupos.map((g) => g.productoConfiguradoId))] } },
      include: { opciones: true },
    });
    const tallas = await this.prisma.talla.findMany({
      where: { id: { in: [...new Set(grupos.map((g) => g.tallaId))] } },
      select: { id: true, valor: true },
    });
    const pcPorId = new Map(pcs.map((p: any) => [p.id, p]));
    const valorTalla = new Map(tallas.map((t) => [t.id, t.valor]));

    // El BOM no depende de la talla: se carga una vez por producto y solo se
    // varía `talla` al resolver cada curva (mismo patrón que el requerimiento).
    const entradaPorPc = new Map<number, EntradaResolucion>();
    const teorico = new Map<number, number>();
    for (const g of grupos) {
      const pc: any = pcPorId.get(g.productoConfiguradoId);
      const talla = valorTalla.get(g.tallaId);
      if (!pc || talla == null) continue;
      if (!entradaPorPc.has(pc.id)) {
        entradaPorPc.set(
          pc.id,
          await this.bomLoader.cargarEntrada({
            referenciaId: pc.referenciaId,
            marcaId: pc.marcaId,
            opcionIds: pc.opciones.map((o: any) => o.opcionId),
            talla,
          }),
        );
      }
      const { comprados } = this.resolver({ ...entradaPorPc.get(pc.id)!, talla });
      for (const c of comprados) {
        teorico.set(
          c.materialId,
          (teorico.get(c.materialId) ?? 0) + c.consumo * (g._count as number),
        );
      }
    }
    return teorico;
  }

  /** Lo ya entregado a la OF, por material, según el kardex. */
  private async entregadoDeOf(ofId: number): Promise<Map<number, number>> {
    const filas = await this.prisma.movimientoInventario.groupBy({
      by: ['materialId'],
      where: { ofId, motivo: 'CONSUMO_PRODUCCION' },
      _sum: { cantidad: true },
    });
    return new Map(
      filas
        .filter((f) => f.materialId != null)
        .map((f) => [f.materialId as number, num(f._sum.cantidad)]),
    );
  }

  /**
   * Tabla teórico vs entregado de la OF: es la pantalla del almacenista y la
   * base del costeo real (la diferencia es lo que se gastó de más o de menos).
   */
  async consumoDeOf(ofId: number) {
    const of = await this.prisma.ordenFabricacion.findUnique({ where: { id: ofId } });
    if (!of) throw new NotFoundException(`OF ${ofId} no existe`);

    const [teorico, entregado] = await Promise.all([
      this.teoricoDeOf(ofId),
      this.entregadoDeOf(ofId),
    ]);
    const filas = consolidarConsumo(teorico, entregado);

    const materiales = await this.prisma.material.findMany({
      where: { id: { in: filas.map((f) => f.materialId) } },
      select: {
        id: true,
        codigo: true,
        nombreCanonico: true,
        unidadMedida: { select: { codigo: true } },
      },
    });
    const info = new Map(materiales.map((m: any) => [m.id, m]));

    return {
      ofId,
      consecutivo: of.consecutivo,
      lineas: filas.map((f) => ({
        ...f,
        materialCodigo: info.get(f.materialId)?.codigo ?? null,
        materialNombre: info.get(f.materialId)?.nombreCanonico ?? null,
        unidad: info.get(f.materialId)?.unidadMedida?.codigo ?? null,
      })),
    };
  }

  /**
   * Registra una entrega de materiales a la OF. Es acumulativo a propósito: el
   * almacenista entrega varias veces a lo largo de la corrida, así que dos
   * registros del mismo material suman, no se pisan.
   */
  async registrarConsumo(ofId: number, dto: RegistrarConsumoDto, user: any) {
    const of = await this.prisma.ordenFabricacion.findUnique({
      where: { id: ofId },
      select: { id: true, consecutivo: true, estado: true, opId: true },
    });
    if (!of) throw new NotFoundException(`OF ${ofId} no existe`);
    if (of.estado === 'ANULADA')
      throw new ConflictException('La OF está anulada: no admite consumo');

    // Dos entregas del mismo material en el mismo POST se suman antes de tocar
    // la bodega, para no descontar la reserva en dos pasadas.
    const pedido = new Map<number, number>();
    for (const l of dto.lineas) {
      pedido.set(l.materialId, (pedido.get(l.materialId) ?? 0) + l.cantidad);
    }
    const ids = [...pedido.keys()].sort((a, b) => a - b);

    await this.prisma.$transaction(async (tx) => {
      // Lock pesimista en el mismo orden que el amarre de insumos, para que dos
      // almacenistas registrando a la vez no se pisen el stock.
      await tx.$queryRaw`SELECT id FROM "InventarioMaterial" WHERE "materialId" IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;

      const stock = await tx.inventarioMaterial.findMany({
        where: { materialId: { in: ids } },
      });
      const stockPorMaterial = new Map(stock.map((s: any) => [s.materialId, s]));

      const materiales = await tx.material.findMany({
        where: { id: { in: ids } },
        select: { id: true, codigo: true, costoPromedio: true, costoBase: true },
      });
      const costoPorMaterial = new Map(
        materiales.map((m: any) => [m.id, num(m.costoPromedio) || num(m.costoBase)]),
      );
      const codigoPorMaterial = new Map(materiales.map((m: any) => [m.id, m.codigo]));

      // Reservas vivas de la OP dueña, para descargarlas contra lo consumido.
      const reqs = await tx.requerimientoCompra.findMany({
        where: { opId: of.opId, reservaActiva: true },
        orderBy: { id: 'asc' },
        include: {
          lineas: {
            where: { materialId: { in: ids } },
            select: { id: true, materialId: true, cantReservada: true },
            orderBy: { id: 'asc' },
          },
        },
      });
      const reservasPorMaterial = new Map<number, LineaReservaMin[]>();
      for (const r of reqs) {
        for (const l of r.lineas as any[]) {
          const acc = reservasPorMaterial.get(l.materialId) ?? [];
          acc.push({ id: l.id, cantReservada: num(l.cantReservada) });
          reservasPorMaterial.set(l.materialId, acc);
        }
      }

      for (const [materialId, cantidad] of pedido) {
        const inv: any = stockPorMaterial.get(materialId);
        const disponible = num(inv?.cantDisponible);
        if (!inv || disponible < cantidad)
          throw new BadRequestException(
            `Material ${codigoPorMaterial.get(materialId) ?? materialId}: hay ${disponible} en bodega y se quieren entregar ${cantidad}`,
          );

        // Lo consumido deja de estar amarrado: baja de la reserva al mismo
        // tiempo que del stock, o al cerrar la OP se liberaría dos veces.
        const descarga = repartirDescargaDeReserva(
          cantidad,
          reservasPorMaterial.get(materialId) ?? [],
        );
        for (const l of descarga.porLinea) {
          await tx.requerimientoCompraLinea.update({
            where: { id: l.id },
            data: { cantReservada: { decrement: l.descontar } },
          });
        }

        await tx.inventarioMaterial.update({
          where: { materialId },
          data: {
            cantDisponible: { decrement: cantidad },
            ...(descarga.total > 0
              ? { cantReservada: { decrement: descarga.total } }
              : {}),
          },
        });

        await tx.movimientoInventario.create({
          data: {
            tipo: 'SALIDA',
            motivo: 'CONSUMO_PRODUCCION',
            materialId,
            cantidad,
            costoUnitario: costoPorMaterial.get(materialId) || null,
            ofId,
            referencia: `OF-${of.consecutivo}`,
            observaciones: dto.observaciones,
            usuarioId: user?.sub ?? null,
          },
        });
      }
    });

    return this.consumoDeOf(ofId);
  }

  // ─────────────────── TV de planta y tablero por órdenes (piloto) ───────────────────

  /**
   * Lo que ven los operarios en la pantalla grande: pares que entraron HOY a cada
   * estación activa, los de la última hora y la meta del día. Reemplaza el tablero
   * manual "HORA / N° PARES" que hoy llevan con marcador en guarnición e inyección.
   */
  async hoy() {
    const ahora = new Date();
    const inicio = inicioDelDiaBogota(ahora);
    const [estaciones, eventos, metas] = await Promise.all([
      this.estaciones(),
      this.prisma.eventoTrazabilidad.findMany({
        where: { timestamp: { gte: inicio }, estacionDestino: { not: null } },
        select: { estacionDestino: true, timestamp: true },
      }),
      this.metaDiariaPorCelula(ahora),
    ]);
    const filas = avanceHoyPorEstacion(eventos, estaciones, inicio, ahora);
    return {
      fecha: inicio.toISOString().slice(0, 10),
      actualizado: ahora.toISOString(),
      estaciones: filas.map((f) => ({ ...f, meta: metas.get(f.celula) ?? META_DIARIA_DEFAULT })),
    };
  }

  /**
   * Meta diaria por célula del mes en curso: la meta mensual del reporte gerencial
   * dividida en días hábiles. Sin meta cargada, el número mágico de la planta: 1.206.
   */
  private async metaDiariaPorCelula(ahora: Date): Promise<Map<Celula, number>> {
    const local = new Date(ahora.getTime() - OFFSET_BOGOTA_HORAS * 3600 * 1000);
    const anio = local.getUTCFullYear();
    const mes = local.getUTCMonth() + 1;
    const desde = new Date(Date.UTC(anio, mes - 1, 1));
    const hasta = new Date(Date.UTC(anio, mes, 1));
    const [metas, cal, noHabiles] = await Promise.all([
      this.prisma.meta.findMany({ where: { anio, mes, lineaId: null } }),
      this.prisma.calendarioLaboral.findUnique({ where: { id: 1 } }),
      this.prisma.diaNoHabil.findMany({ where: { fecha: { gte: desde, lt: hasta } }, select: { fecha: true } }),
    ]);
    const habiles = cal
      ? diasHabilesDelMes(anio, mes, {
          diasSemana: [cal.domingo, cal.lunes, cal.martes, cal.miercoles, cal.jueves, cal.viernes, cal.sabado],
          noHabiles: noHabiles.map((d) => d.fecha.toISOString().slice(0, 10)),
        }).length
      : HABILES_POR_DEFECTO;
    const out = new Map<Celula, number>();
    for (const m of metas as any[]) {
      if (!CELULAS_META.includes(m.tipo)) continue;
      out.set(m.tipo as Celula, metaDiaria(Number(m.valor), habiles));
    }
    return out;
  }

  /**
   * Tablero por órdenes: una fila por OF viva, una columna por estación activa,
   * y en cada celda cuántos pares ya pasaron por ahí sobre lo programado. Ver
   * 1.206 pares uno por uno es imposible; la unidad de pantalla es la orden.
   */
  async tableroOrdenes() {
    const estaciones = await this.estaciones();
    const ofs = await this.prisma.ordenFabricacion.findMany({
      where: { estado: { in: ['ABIERTA', 'EN_PROCESO'] } },
      orderBy: { consecutivo: 'desc' },
      select: {
        id: true,
        consecutivo: true,
        estado: true,
        fecha: true,
        op: {
          select: {
            consecutivo: true,
            linea: { select: { codigo: true, nombre: true } },
            oc: { select: { consecutivo: true, cliente: { select: { nombre: true } } } },
            lineas: {
              select: {
                productoConfiguradoId: true,
                productoConfigurado: { select: { codigo: true, nombreComercial: true } },
                tallas: { select: { tallaId: true, cantAProducir: true, talla: { select: { valor: true } } } },
              },
            },
          },
        },
        pares: {
          select: {
            estado: true,
            celulaActual: true,
            subPasoActual: true,
            subPasoInyeccion: true,
            tallaId: true,
            productoConfiguradoId: true,
            reponeAParId: true,
          },
        },
      },
    });
    return {
      estaciones: estaciones.filter((e) => e.activa),
      ordenes: ofs.map((of: any) => {
        const programa = programaDeOf(of, estaciones);
        return {
          id: of.id,
          consecutivo: of.consecutivo,
          estado: of.estado,
          fecha: of.fecha,
          op: of.op?.consecutivo ?? null,
          oc: of.op?.oc?.consecutivo ?? null,
          cliente: of.op?.oc?.cliente?.nombre ?? null,
          linea: of.op?.linea?.nombre ?? null,
          productos: [...new Set(programa.map((p) => p.producto))],
          programado: programa.reduce((a, p) => a + p.programado, 0),
          nacidos: programa.reduce((a, p) => a + p.nacidos, 0),
          terminados: programa.reduce((a, p) => a + p.terminados, 0),
          porEstacion: paresPorEstacion(
            of.pares.map((p: any) => ({
              estado: p.estado,
              celula: p.celulaActual,
              subPaso: p.subPasoActual,
              subPasoInyeccion: p.subPasoInyeccion,
            })),
            estaciones,
          ),
          programa,
        };
      }),
    };
  }
}

/** Número mágico de la planta: lo que mueve cada proceso por día (Mauricio Sierra). */
export const META_DIARIA_DEFAULT = 1206;
/** Divisor de la meta mensual cuando nadie configuró el calendario (trabajan sábados). */
const HABILES_POR_DEFECTO = 24;
const CELULAS_META: string[] = ['CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION', 'PT'];

/** Programado vs nacidos vs terminados por producto × talla, a partir de la OF cargada con OP y pares. */
function programaDeOf(
  of: any,
  estaciones: readonly EstacionDef[] = [],
): {
  productoConfiguradoId: number;
  producto: string;
  productoCodigo: string;
  tallaId: number;
  talla: string;
  programado: number;
  nacidos: number;
  terminados: number;
  /** Avance acumulado por estación, igual que la cabecera de la orden. */
  porEstacion: Record<string, number>;
}[] {
  const pares: any[] = of.pares ?? [];
  const deLinea = (pcId: number, tallaId: number) =>
    pares.filter((p) => p.productoConfiguradoId === pcId && p.tallaId === tallaId && !p.reponeAParId);
  const out: ReturnType<typeof programaDeOf> = [];
  for (const l of (of.op?.lineas ?? []) as any[]) {
    for (const t of (l.tallas ?? []) as any[]) {
      if (!(t.cantAProducir > 0)) continue;
      const suyos = deLinea(l.productoConfiguradoId, t.tallaId);
      out.push({
        productoConfiguradoId: l.productoConfiguradoId,
        producto: l.productoConfigurado?.nombreComercial ?? '',
        productoCodigo: l.productoConfigurado?.codigo ?? '',
        tallaId: t.tallaId,
        talla: String(t.talla?.valor ?? t.tallaId),
        programado: t.cantAProducir,
        nacidos: suyos.filter((p) => p.estado !== 'CANCELADO').length,
        terminados: suyos.filter((p) => p.estado === 'TERMINADO').length,
        porEstacion: paresPorEstacion(
          suyos.map((p) => ({
            estado: p.estado,
            celula: p.celulaActual,
            subPaso: p.subPasoActual,
            subPasoInyeccion: p.subPasoInyeccion,
          })),
          estaciones,
        ),
      });
    }
  }
  return out;
}
