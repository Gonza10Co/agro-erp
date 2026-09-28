import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ORDEN_CELULAS } from '../fabricacion/fabricacion-core';
import { validarMovimientoMaterial } from './inventario-core';
import { CrearBodegaDto } from './dto/crear-bodega.dto';
import { RegistrarStockDto } from './dto/registrar-stock.dto';
import { MovimientoMaterialDto } from './dto/movimiento-material.dto';
import { AjustePtDto, FilaAjustePtDto } from './dto/ajuste-pt.dto';
import {
  CatalogoAjuste,
  claveSaldo,
  resolverFilasAjuste,
  resumirAjuste,
} from './ajuste-pt-core';
import { siguienteConsecutivo } from '../prisma/consecutivo';

export interface FilaPlantillaPt {
  referencia: string;
  marca: string;
  producto: string;
  codigo: string;
  talla: number;
  bodega: string;
  calidad: 'PRIMERA' | 'SEGUNDA';
  disponible: number;
  reservado: number;
}

interface Usuario {
  sub: number;
  role: string;
}

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
    const calidad = dto.calidad ?? 'PRIMERA';
    return this.prisma.inventarioPT.upsert({
      where: {
        productoConfiguradoId_tallaId_bodegaId_calidad: {
          productoConfiguradoId,
          tallaId,
          bodegaId,
          calidad,
        },
      },
      create: {
        productoConfiguradoId,
        tallaId,
        bodegaId,
        calidad,
        cantDisponible: cantidad,
      },
      update: { cantDisponible: { increment: cantidad } },
    });
  }

  // Foto única del flujo físico: materia prima → WIP por célula → producto terminado.
  // lineaId opcional: filtra el WIP (pares en proceso) por línea de producción.
  // Materiales y PT quedan globales (materia prima compartida entre líneas).
  async consolidado(lineaId?: number) {
    const [materiales, wipPorCelula, pt] = await Promise.all([
      this.prisma.inventarioMaterial.findMany({
        include: {
          material: {
            include: { unidadMedida: { select: { codigo: true } } },
          },
        },
        orderBy: { material: { codigo: 'asc' } },
      }),
      this.prisma.par.groupBy({
        by: ['celulaActual'],
        where: { estado: 'EN_PROCESO', ...(lineaId ? { lineaId } : {}) },
        _count: { _all: true },
      }),
      this.prisma.inventarioPT.findMany({
        where: { OR: [{ cantDisponible: { gt: 0 } }, { cantReservada: { gt: 0 } }] },
        include: {
          productoConfigurado: { select: { codigo: true, nombreComercial: true } },
          talla: { select: { valor: true } },
          bodega: { select: { codigo: true, nombre: true } },
        },
        // Primeras antes que segundas dentro del mismo producto/talla.
        orderBy: [
          { productoConfigurado: { codigo: 'asc' } },
          { talla: { valor: 'asc' } },
          { calidad: 'asc' },
        ],
      }),
    ]);

    const conteo = new Map(
      wipPorCelula.map((w) => [w.celulaActual, w._count._all]),
    );
    return {
      materiales: materiales.map((m) => ({
        materialId: m.material.id,
        codigo: m.material.codigo,
        nombre: m.material.nombreCanonico,
        unidad: m.material.unidadMedida.codigo,
        cantDisponible: Number(m.cantDisponible),
      })),
      wip: ORDEN_CELULAS.map((celula) => ({
        celula,
        pares: conteo.get(celula) ?? 0,
      })),
      pt: pt.map((i) => ({
        producto: i.productoConfigurado.nombreComercial,
        codigo: i.productoConfigurado.codigo,
        talla: i.talla.valor,
        bodega: i.bodega.nombre,
        calidad: i.calidad,
        cantDisponible: i.cantDisponible,
        cantReservada: i.cantReservada,
      })),
    };
  }

  kardex(limit = 50) {
    return this.prisma.movimientoInventario.findMany({
      take: Math.min(limit, 200),
      // createdAt primero: los datos históricos/sembrados traen fecha retroactiva.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        material: {
          select: {
            codigo: true,
            nombreCanonico: true,
            unidadMedida: { select: { codigo: true } },
          },
        },
        inventarioPT: {
          select: {
            productoConfigurado: { select: { codigo: true, nombreComercial: true } },
            talla: { select: { valor: true } },
            bodega: { select: { nombre: true } },
          },
        },
        usuario: { select: { username: true } },
      },
    });
  }

  // Plantilla del conteo físico de producto terminado: una fila por producto
  // activo × talla del rango de su referencia × bodega activa, en PRIMERA.
  // Las SEGUNDAS solo salen donde ya hay saldo: son pocas y agregarlas todas
  // duplicaría la plantilla (quien encuentre una nueva copia la fila y cambia la calidad).
  async plantillaAjustePt() {
    const [productos, tallas, bodegas] = await Promise.all([
      this.prisma.productoConfigurado.findMany({
        where: { activo: true, referencia: { activo: true } },
        select: {
          id: true,
          codigo: true,
          nombreComercial: true,
          referencia: {
            select: {
              codigo: true,
              tallaMin: { select: { valor: true } },
              tallaMax: { select: { valor: true } },
            },
          },
          marca: { select: { nombre: true } },
        },
        orderBy: { codigo: 'asc' },
      }),
      this.prisma.talla.findMany({ orderBy: { valor: 'asc' } }),
      this.prisma.bodega.findMany({
        where: { activo: true },
        orderBy: [{ prioridad: 'asc' }, { codigo: 'asc' }],
      }),
    ]);
    const saldos = await this.prisma.inventarioPT.findMany({
      where: { productoConfiguradoId: { in: productos.map((p) => p.id) } },
    });
    const saldo = new Map(
      saldos.map((s) => [
        claveSaldo(s.productoConfiguradoId, s.tallaId, s.bodegaId, s.calidad),
        s,
      ]),
    );

    const filas: FilaPlantillaPt[] = [];
    for (const p of productos) {
      const enRango = tallas.filter(
        (t) =>
          t.valor >= p.referencia.tallaMin.valor && t.valor <= p.referencia.tallaMax.valor,
      );
      for (const t of enRango)
        for (const b of bodegas)
          for (const calidad of ['PRIMERA', 'SEGUNDA'] as const) {
            const s = saldo.get(claveSaldo(p.id, t.id, b.id, calidad));
            if (calidad === 'SEGUNDA' && !s) continue;
            filas.push({
              referencia: p.referencia.codigo,
              marca: p.marca.nombre,
              producto: p.nombreComercial,
              codigo: p.codigo,
              talla: t.valor,
              bodega: b.codigo,
              calidad,
              disponible: s?.cantDisponible ?? 0,
              reservado: s?.cantReservada ?? 0,
            });
          }
    }
    return filas;
  }

  private async catalogoAjuste(filas: FilaAjustePtDto[]): Promise<CatalogoAjuste> {
    const codigos = [...new Set(filas.map((f) => f.codigo.trim()))];
    const [productos, tallas, bodegas] = await Promise.all([
      this.prisma.productoConfigurado.findMany({
        where: { codigo: { in: codigos }, activo: true },
        select: {
          id: true,
          codigo: true,
          nombreComercial: true,
          referencia: {
            select: {
              tallaMin: { select: { valor: true } },
              tallaMax: { select: { valor: true } },
            },
          },
        },
      }),
      this.prisma.talla.findMany(),
      this.prisma.bodega.findMany({ where: { activo: true } }),
    ]);
    const saldos = await this.prisma.inventarioPT.findMany({
      where: { productoConfiguradoId: { in: productos.map((p) => p.id) } },
    });
    return {
      productos: new Map(
        productos.map((p) => [
          p.codigo,
          {
            id: p.id,
            nombre: p.nombreComercial,
            tallaMin: p.referencia.tallaMin.valor,
            tallaMax: p.referencia.tallaMax.valor,
          },
        ]),
      ),
      tallas: new Map(tallas.map((t) => [t.valor, t.id])),
      bodegas: new Map(bodegas.map((b) => [b.codigo.toUpperCase(), b.id])),
      saldos: new Map(
        saldos.map((s) => [
          claveSaldo(s.productoConfiguradoId, s.tallaId, s.bodegaId, s.calidad),
          { disponible: s.cantDisponible, reservado: s.cantReservada },
        ]),
      ),
    };
  }

  async previsualizarAjustePt(dto: AjustePtDto) {
    const filas = resolverFilasAjuste(dto.filas, await this.catalogoAjuste(dto.filas));
    return {
      filas: filas.map(({ ids: _ids, ...f }) => f),
      resumen: resumirAjuste(filas),
    };
  }

  // Aplica el conteo: cada saldo queda en lo contado y la diferencia se anota en
  // el kardex como AJUSTE_MANUAL bajo un mismo consecutivo AJ-n. Es todo o nada:
  // con una sola fila en error no se toca nada.
  async aplicarAjustePt(dto: AjustePtDto, user: Usuario) {
    const filas = resolverFilasAjuste(dto.filas, await this.catalogoAjuste(dto.filas));
    const conError = filas.filter((f) => f.error);
    if (conError.length)
      throw new BadRequestException(
        `El archivo tiene ${conError.length} fila(s) con error; corríjalas y vuelva a importar`,
      );
    const cambios = filas.filter((f) => f.diferencia !== 0);
    if (!cambios.length) throw new BadRequestException('El conteo no cambia ningún saldo');

    return this.prisma.$transaction(async (tx) => {
      const referencia = `AJ-${await siguienteConsecutivo(tx, 'ajustePt')}`;
      for (const f of cambios) {
        const { productoConfiguradoId, tallaId, bodegaId, calidad } = f.ids!;
        const llave = { productoConfiguradoId, tallaId, bodegaId, calidad };
        // Guarda contra carrera: el saldo debe seguir siendo el que se previsualizó
        // (un pistolazo a PT o un despacho en el medio cambiaría la diferencia).
        let invId: number;
        if (f.actual === 0 && f.reservado === 0) {
          const inv = await tx.inventarioPT.upsert({
            where: { productoConfiguradoId_tallaId_bodegaId_calidad: llave },
            create: { ...llave, cantDisponible: f.conteo },
            update: {},
          });
          if (inv.cantDisponible !== f.conteo) throw this.saldoCambio(f.fila);
          invId = inv.id;
        } else {
          const res = await tx.inventarioPT.updateMany({
            where: { ...llave, cantDisponible: f.actual, cantReservada: { lte: f.conteo } },
            data: { cantDisponible: f.conteo },
          });
          if (res.count === 0) throw this.saldoCambio(f.fila);
          invId = (await tx.inventarioPT.findUniqueOrThrow({
            where: { productoConfiguradoId_tallaId_bodegaId_calidad: llave },
            select: { id: true },
          })).id;
        }
        await tx.movimientoInventario.create({
          data: {
            tipo: f.diferencia > 0 ? 'ENTRADA' : 'SALIDA',
            motivo: 'AJUSTE_MANUAL',
            inventarioPTId: invId,
            cantidad: Math.abs(f.diferencia),
            referencia,
            observaciones: dto.observaciones?.trim() || 'Conteo físico (plantilla)',
            usuarioId: user.sub,
          },
        });
      }
      return { referencia, resumen: resumirAjuste(filas) };
    });
  }

  private saldoCambio(fila: number) {
    return new ConflictException(
      `El saldo de la fila ${fila} cambió mientras revisaba el archivo; vuelva a importarlo`,
    );
  }

  // Movimiento manual de materia prima (recepción de compra, devolución a
  // proveedor, consumo, ajuste). Los motivos del sistema se rechazan en el core.
  async movimientoMaterial(dto: MovimientoMaterialDto, user: Usuario) {
    const error = validarMovimientoMaterial(dto);
    if (error) throw new BadRequestException(error);

    const material = await this.prisma.material.findUnique({
      where: { id: dto.materialId },
    });
    if (!material) throw new NotFoundException(`Material ${dto.materialId} no existe`);

    return this.prisma.$transaction(async (tx) => {
      if (dto.tipo === 'ENTRADA') {
        await tx.inventarioMaterial.upsert({
          where: { materialId: dto.materialId },
          create: { materialId: dto.materialId, cantDisponible: dto.cantidad },
          update: { cantDisponible: { increment: dto.cantidad } },
        });
      } else {
        // Guarda de stock: la SALIDA solo aplica si hay disponible suficiente.
        const res = await tx.inventarioMaterial.updateMany({
          where: { materialId: dto.materialId, cantDisponible: { gte: dto.cantidad } },
          data: { cantDisponible: { decrement: dto.cantidad } },
        });
        if (res.count === 0)
          throw new ConflictException(
            `Stock insuficiente del material ${dto.materialId} para la salida`,
          );
      }
      return tx.movimientoInventario.create({
        data: {
          tipo: dto.tipo,
          motivo: dto.motivo,
          materialId: dto.materialId,
          cantidad: dto.cantidad,
          referencia: dto.referencia,
          observaciones: dto.observaciones,
          usuarioId: user.sub,
        },
      });
    });
  }
}
