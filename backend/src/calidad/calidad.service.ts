import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Celula, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { agruparIndicadores, codigoReposicion, validarReporte } from './calidad-core';
import { EstacionDef, estacionNacimiento, subPasoInicial } from '../fabricacion/fabricacion-core';
import { ReportarIncidenciaDto } from './dto/reportar-incidencia.dto';

export interface Usuario {
  sub: number;
  role: string;
}

/** Lo mínimo de un par para parir su reposición. */
export interface ParARepondr {
  id: number;
  codigo: string;
  ofId: number;
  productoConfiguradoId: number;
  tallaId: number;
}

/** Lo que necesita una incidencia para quedar escrita (append-only). */
export interface DatosIncidencia {
  parId: number;
  tipoDanoId: number;
  celulaDeteccion: Celula;
  operarioId: number;
  descripcion?: string | null;
  autorizadoPorId?: number | null;
  parReposicionId?: number | null;
}

const MSG_ESTADO: Record<string, string> = {
  TERMINADO: 'El par ya está terminado',
  CANCELADO: 'El par está cancelado (OP anulada)',
  DADO_DE_BAJA: 'El par ya fue dado de baja',
};

const MSG_RACE = 'El par cambió de estado durante el reporte — recárgalo e intenta de nuevo';

@Injectable()
export class CalidadService {
  constructor(private readonly prisma: PrismaService) {}

  listarTiposDano() {
    return this.prisma.tipoDano.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  /** Un tipo de daño vivo, o 404. Lo usa también el pistolazo con daño. */
  async obtenerTipo(id: number) {
    const tipo = await this.prisma.tipoDano.findUnique({ where: { id } });
    if (!tipo || !tipo.activo)
      throw new NotFoundException('Tipo de daño inexistente o inactivo');
    return tipo;
  }

  /**
   * Sella el grado SEGUNDA dentro de una transacción ajena (el pistolazo de la
   * estación, que en PT termina el par en la misma tx). Condición sobre el estado
   * por la misma razón que la baja: no pisar un par que otra tx acaba de terminar.
   * Un par ya marcado no vuelve a primera.
   */
  async sellarSegunda(tx: Prisma.TransactionClient, parId: number): Promise<void> {
    const res = await tx.par.updateMany({
      where: { id: parId, estado: 'EN_PROCESO' },
      data: { calidad: 'SEGUNDA' },
    });
    if (res.count === 0) throw new ConflictException(MSG_RACE);
  }

  /**
   * Nace la reposición de un par que salió del pedido (baja o segunda): donde nace
   * cualquier par de su línea (Preparación / Montaje), con evento de entrada para que
   * la TV y el tablero la cuenten desde ya. Sin estaciones (base vieja) cae en la
   * célula inicial a secas. El cliente confirmó el 2026-09-11 que una segunda
   * también se repone: el pedido se completa con primeras, no se despacha corto.
   */
  async crearReposicion(
    tx: Prisma.TransactionClient,
    par: ParARepondr,
    operarioId: number,
    celulaInicial: Celula,
    lineaId: number | null,
    estaciones: readonly EstacionDef[],
  ) {
    const nac = estacionNacimiento(celulaInicial, estaciones);
    const parReposicion = await tx.par.create({
      data: {
        codigo: codigoReposicion(par.codigo),
        ofId: par.ofId,
        productoConfiguradoId: par.productoConfiguradoId,
        tallaId: par.tallaId,
        celulaActual: nac?.celula ?? celulaInicial,
        subPasoActual: nac ? nac.subPaso : subPasoInicial(celulaInicial),
        subPasoInyeccion: nac?.subPasoInyeccion ?? null,
        lineaId,
        reponeAParId: par.id,
      },
    });
    if (nac) {
      await tx.eventoTrazabilidad.create({
        data: {
          parId: parReposicion.id,
          celula: nac.celula,
          subPaso: nac.subPaso,
          subPasoInyeccion: nac.subPasoInyeccion,
          estacionDestino: nac.codigo,
          celulaDestino: nac.celula,
          operarioId,
        },
      });
    }
    return parReposicion;
  }

  /**
   * SEGUNDA dentro de una transacción ajena (el pistolazo): sella el grado, pare la
   * reposición y deja el acta. El par sigue su curso (se vende como segunda) y el
   * pedido se completa con la reposición.
   */
  async marcarSegundaEn(
    tx: Prisma.TransactionClient,
    par: ParARepondr,
    d: Omit<DatosIncidencia, 'parId' | 'parReposicionId'>,
    celulaInicial: Celula,
    lineaId: number | null,
    estaciones: readonly EstacionDef[],
  ) {
    await this.sellarSegunda(tx, par.id);
    const parReposicion = await this.crearReposicion(tx, par, d.operarioId, celulaInicial, lineaId, estaciones);
    const incidencia = await this.registrarIncidencia(tx, { ...d, parId: par.id, parReposicionId: parReposicion.id });
    return { incidencia, parReposicion };
  }

  /** Estaciones del recorrido, en orden (la reposición nace en la primera activa de su línea). */
  estaciones() {
    return this.prisma.estacion.findMany({ orderBy: { orden: 'asc' } });
  }

  /** La incidencia es un registro append-only; la célula causante viaja en el tipo. */
  registrarIncidencia(tx: Prisma.TransactionClient, d: DatosIncidencia) {
    return tx.incidenciaCalidad.create({
      data: {
        parId: d.parId,
        tipoDanoId: d.tipoDanoId,
        celulaDeteccion: d.celulaDeteccion,
        operarioId: d.operarioId,
        descripcion: d.descripcion ?? null,
        autorizadoPorId: d.autorizadoPorId ?? null,
        parReposicionId: d.parReposicionId ?? null,
      },
      include: { tipoDano: true },
    });
  }

  async reportar(codigo: string, dto: ReportarIncidenciaDto, user: Usuario) {
    const par = await this.prisma.par.findUnique({
      where: { codigo },
      // La línea del par define dónde re-arranca la reposición (Feroz → INYECCION).
      // La denormalizada en el par (línea por pedido) manda; marca = fallback.
      include: {
        linea: true,
        productoConfigurado: { include: { marca: { include: { linea: true } } } },
      },
    });
    if (!par) throw new NotFoundException(`Par ${codigo} no existe`);
    const tipo = await this.obtenerTipo(dto.tipoDanoId);
    if (par.estado !== 'EN_PROCESO')
      throw new ConflictException(MSG_ESTADO[par.estado] ?? 'El par no está en proceso');

    const err = validarReporte(tipo.clase, dto.descripcion, user.role);
    if (err === 'ROL_INSUFICIENTE')
      throw new ForbiddenException('Solo un gerente puede autorizar una baja');
    if (err === 'SIN_DESCRIPCION')
      throw new BadRequestException('La baja requiere descripción (acta)');

    try {
      // REPROCESO no muta estado: la incidencia es un registro append-only.
      // El race read-then-create (el par sale de EN_PROCESO entre la lectura y
      // este insert) se acepta: registra un daño real, no descuadra inventario.
      if (tipo.clase === 'REPROCESO') {
        const incidencia = await this.registrarIncidencia(this.prisma, {
          parId: par.id,
          tipoDanoId: tipo.id,
          celulaDeteccion: par.celulaActual,
          operarioId: dto.operarioId,
          descripcion: dto.descripcion,
        });
        return { incidencia, parReposicion: null };
      }
      const marca = (par as any).productoConfigurado?.marca;
      const celulaInicial =
        (par as any).linea?.celulaInicial ?? marca?.linea?.celulaInicial ?? 'CORTE';
      const lineaId = par.lineaId ?? marca?.lineaId ?? null;
      // SEGUNDA: el par NO muere — sigue su curso y entra a bodega con grado SEGUNDA —
      // pero SÍ se repone: el pedido se completa con primeras (JP, 2026-09-11).
      if (tipo.clase === 'SEGUNDA')
        return await this.marcarSegunda(par, tipo.id, dto, user, celulaInicial, lineaId);
      return await this.darDeBaja(par, tipo.id, dto, user, celulaInicial, lineaId);
    } catch (e: unknown) {
      // FK inválida del reporte: solo el operario (input del usuario) → 400.
      // Cualquier otra FK (productoConfigurado, talla, autorizadoPor, par…) es
      // un bug de datos y debe aflorar como 500, no enmascararse (patrón fabricacion).
      if ((e as { code?: string })?.code === 'P2003') {
        const campo = String(
          (e as { meta?: { field_name?: unknown } })?.meta?.field_name ?? '',
        );
        if (/operario/i.test(campo) || campo === '')
          throw new BadRequestException('Operario inexistente');
      }
      throw e;
    }
  }

  async indicadores() {
    // Lectura sin paginar a propósito: es un dashboard de back-office; el volumen
    // de incidencias de una fábrica es bajo. Si crece, filtrar por rango de fechas.
    const [incidencias, eventos] = await Promise.all([
      this.prisma.incidenciaCalidad.findMany({ include: { tipoDano: true } }),
      this.prisma.eventoTrazabilidad.groupBy({ by: ['celula'], _count: { _all: true } }),
    ]);
    const eventosPorCelula = Object.fromEntries(
      eventos.map((e) => [e.celula, e._count._all]),
    );
    return agruparIndicadores(incidencias, eventosPorCelula);
  }

  /**
   * Baja de grado: el par queda marcado como SEGUNDA, sigue produciéndose y se
   * vende como segunda. Desde el 2026-09-11 (respuesta de JP) también nace su
   * reposición: 100 primeras pedidas son 100 primeras entregadas.
   */
  private async marcarSegunda(
    par: ParARepondr & { celulaActual: Celula },
    tipoDanoId: number,
    dto: ReportarIncidenciaDto,
    user: Usuario,
    celulaInicial: Celula,
    lineaId: number | null,
  ) {
    const estaciones = await this.estaciones();
    return this.prisma.$transaction((tx) =>
      this.marcarSegundaEn(
        tx,
        par,
        {
          tipoDanoId,
          celulaDeteccion: par.celulaActual,
          operarioId: dto.operarioId,
          descripcion: dto.descripcion,
          autorizadoPorId: user.sub,
        },
        celulaInicial,
        lineaId,
        estaciones,
      ),
    );
  }

  private async darDeBaja(
    par: ParARepondr & { celulaActual: Celula },
    tipoDanoId: number,
    dto: ReportarIncidenciaDto,
    user: Usuario,
    celulaInicial: Celula,
    lineaId: number | null,
  ) {
    const estaciones = await this.estaciones();
    return this.prisma.$transaction(async (tx) => {
      // Condición sobre el estado para no pisar un par que otra tx acaba de
      // terminar/cancelar (mismo patrón que el cierre de OF en fabricacion).
      const res = await tx.par.updateMany({
        where: { id: par.id, estado: 'EN_PROCESO' },
        data: { estado: 'DADO_DE_BAJA' },
      });
      if (res.count === 0) throw new ConflictException(MSG_RACE);

      const parReposicion = await this.crearReposicion(
        tx, par, dto.operarioId, celulaInicial, lineaId, estaciones,
      );

      const incidencia = await this.registrarIncidencia(tx, {
        parId: par.id,
        tipoDanoId,
        celulaDeteccion: par.celulaActual,
        operarioId: dto.operarioId,
        descripcion: dto.descripcion,
        autorizadoPorId: user.sub,
        parReposicionId: parReposicion.id,
      });

      return { incidencia, parReposicion };
    });
  }
}
