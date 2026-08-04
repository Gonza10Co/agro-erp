import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Celula, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { siguienteConsecutivo } from '../prisma/consecutivo';
import { generarPares, siguienteEstado, LineaProduccion } from './fabricacion-core';
import { AvanzarDto } from './dto/avanzar.dto';
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
          lineaId: op.lineaId ?? l.productoConfigurado?.marca?.lineaId ?? null,
        })),
    );
    if (lineas.length === 0)
      throw new BadRequestException('La OP no tiene producción pendiente');

    return this.prisma.$transaction(async (tx) => {
      const consecutivo = await siguienteConsecutivo(tx, 'of');
      const of = await tx.ordenFabricacion.create({ data: { consecutivo, opId } });
      const pares = generarPares(consecutivo, lineas).map((p) => ({
        ofId: of.id,
        codigo: p.codigo,
        productoConfiguradoId: p.productoConfiguradoId,
        tallaId: p.tallaId,
        celulaActual: p.celulaInicial,
        subPasoActual: p.subPasoInicial,
        subPasoInyeccion: p.subPasoInyeccionInicial,
        lineaId: p.lineaId,
      }));
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
        {
          TERMINADO: 'El par ya está terminado',
          CANCELADO: 'El par está cancelado (OP anulada)',
          DADO_DE_BAJA: 'El par fue dado de baja',
        }[par.estado] ?? 'El par no está en proceso',
      );

    const celulaActual = par.celulaActual;
    const next = siguienteEstado({
      celula: par.celulaActual,
      subPaso: par.subPasoActual,
      subPasoInyeccion: par.subPasoInyeccion,
    });

    // La bodega destino es configuración global (no cambia durante la tx):
    // se resuelve fuera de la transacción para no alargarla.
    let bodegaPT: { id: number } | null = null;
    if (next === null) {
      bodegaPT = await this.prisma.bodega.findFirst({
        where: { tipo: 'PROPIA', activo: true },
        orderBy: { prioridad: 'asc' },
      });
      if (!bodegaPT)
        throw new BadRequestException('No hay bodega PROPIA configurada');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.eventoTrazabilidad.create({
          data: {
            parId: par.id,
            celula: celulaActual,
            subPaso: par.subPasoActual,
            subPasoInyeccion: par.subPasoInyeccion,
            operarioId: dto.operarioId,
            maquinaId: dto.maquinaId,
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

        if (next === null) {
          // Última célula (PT): terminar el par y sumar a InventarioPT.
          const updated = await tx.par.update({
            where: { id: par.id },
            data: { estado: 'TERMINADO' },
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

        // Avance normal a la siguiente célula (la activación de la OF ya se
        // resolvió arriba, en el primer escaneo).
        return tx.par.update({
          where: { id: par.id },
          data: {
            celulaActual: next.celula,
            subPasoActual: next.subPaso,
            subPasoInyeccion: next.subPasoInyeccion ?? null,
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
            // Para las etiquetas físicas: qué es el par y por qué línea se fabrica.
            productoConfigurado: { select: { codigo: true, nombreComercial: true } },
            linea: { select: { codigo: true, nombre: true } },
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
      // Cap defensivo: el tablero opera por OF; sin filtro, 500 pares es más que una corrida.
      take: 500,
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

  /** Consumo teórico de la OF: BOM resuelto × pares, por material. */
  private async teoricoDeOf(ofId: number): Promise<Map<number, number>> {
    // Un par DADO_DE_BAJA sí gastó material (por eso lleva acta); el CANCELADO
    // nunca llegó a producirse, así que no suma al teórico.
    const grupos = await this.prisma.par.groupBy({
      by: ['productoConfiguradoId', 'tallaId'],
      where: { ofId, estado: { not: 'CANCELADO' } },
      _count: true,
    });
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
}
