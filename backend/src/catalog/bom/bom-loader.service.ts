import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EntradaResolucion,
  LineaBase,
  MaterialInfo,
  Override,
} from './bom-resolver.types';
import { descartarGlobalesPisadas } from './bom-reglas-core';

export interface SeleccionBom {
  referenciaId: number;
  marcaId?: number | null;
  opcionIds: number[];
  talla: number;
}

type DecimalLike = { toNumber(): number } | number | null;
const num = (d: DecimalLike): number | null =>
  d == null ? null : typeof d === 'number' ? d : d.toNumber();

interface LineaRaw {
  materialId: number;
  piezaId?: number | null;
  claseConsumo: 'CURVA' | 'FIJO';
  consumoFijo: DecimalLike;
  mermaPct: DecimalLike;
  lineasTalla?: { talla: { valor: number }; consumo: DecimalLike }[];
}

@Injectable()
export class BomLoaderService {
  constructor(private readonly prisma: PrismaService) {}

  async cargarEntrada(sel: SeleccionBom): Promise<EntradaResolucion> {
    const bom = await this.prisma.bom.findFirst({
      where: { referenciaId: sel.referenciaId, activo: true },
      orderBy: { version: 'desc' },
      include: {
        lineas: { include: { lineasTalla: { include: { talla: true } } } },
      },
    });
    if (!bom)
      throw new NotFoundException(
        `Referencia ${sel.referenciaId} sin BOM activo`,
      );

    const lineasBase: LineaBase[] = bom.lineas.map((l: any) =>
      this.mapLinea(l),
    );

    const overrides = await this.cargarOverrides(sel);
    const materiales = await this.cargarMateriales(lineasBase, overrides);

    return { lineasBase, overrides, talla: sel.talla, materiales };
  }

  private mapLinea(l: LineaRaw): LineaBase {
    const consumoPorTalla: Record<number, number> = {};
    for (const lt of l.lineasTalla ?? [])
      consumoPorTalla[lt.talla.valor] = num(lt.consumo) as number;
    return {
      materialId: l.materialId,
      piezaId: l.piezaId ?? null,
      claseConsumo: l.claseConsumo,
      consumoFijo: num(l.consumoFijo),
      consumoPorTalla,
      mermaPct: num(l.mermaPct),
    };
  }

  private async cargarOverrides(sel: SeleccionBom): Promise<Override[]> {
    const disparadores: any[] = [];
    if (sel.marcaId != null) disparadores.push({ marcaId: sel.marcaId });
    if (sel.opcionIds.length)
      disparadores.push({ opcionId: { in: sel.opcionIds } });
    if (!disparadores.length) return [];

    // Reglas de la referencia (por marca u opción) + materiales propios de la marca
    // (reglas globales, referenciaId NULL), que aplican a todas las referencias.
    const alcances: any[] = [
      { referenciaId: sel.referenciaId, OR: disparadores },
    ];
    if (sel.marcaId != null)
      alcances.push({ referenciaId: null, marcaId: sel.marcaId });

    const filas = await this.prisma.reglaOverride.findMany({
      where: { OR: alcances },
      include: {
        tallas: { include: { talla: true } },
        opcion: { include: { grupoOpcion: true } },
      },
    });
    // La regla de marca propia de la referencia gana sobre la global del mismo material.
    const reglas = descartarGlobalesPisadas(filas as any[]);

    return reglas.map((r: any) => {
      const consumoPorTalla: Record<number, number> = {};
      for (const t of r.tallas ?? [])
        consumoPorTalla[t.talla.valor] = num(t.consumo) as number;
      // Marca dispara primero (orden 0); opciones por el orden de su grupo.
      const orden =
        r.marcaId != null ? 0 : (r.opcion?.grupoOpcion?.orden ?? 1) + 1;
      return {
        accion: r.accion,
        orden,
        materialObjetivoId: r.materialObjetivoId ?? null,
        materialNuevoId: r.materialNuevoId ?? null,
        piezaObjetivoId: r.piezaId ?? null,
        consumoFijo: num(r.consumoFijo),
        heredaCurva: r.heredaCurva,
        consumoPorTalla,
      };
    });
  }

  private async cargarMateriales(
    lineasBase: LineaBase[],
    overrides: Override[],
  ): Promise<Record<number, MaterialInfo>> {
    const ids = new Set<number>();
    for (const l of lineasBase) ids.add(l.materialId);
    for (const o of overrides) {
      if (o.materialObjetivoId != null) ids.add(o.materialObjetivoId);
      if (o.materialNuevoId != null) ids.add(o.materialNuevoId);
    }

    const materiales: Record<number, MaterialInfo> = {};
    const include = {
      talla: { select: { valor: true } },
      // Solo el BOM propio ACTIVO del sub-ensamble (puede haber versiones inactivas).
      bomsPropios: {
        where: { activo: true },
        include: {
          lineas: {
            include: { lineasTalla: { include: { talla: true } } },
          },
        },
      },
    };

    /** Registra las filas y devuelve los insumos hijos aún sin cargar. */
    const incorporar = (filas: any[]): number[] => {
      const nuevos: number[] = [];
      for (const m of filas) {
        const subBom: LineaBase[] = (m.bomsPropios?.[0]?.lineas ?? []).map(
          (l: any) => this.mapLinea(l),
        );
        const info: MaterialInfo = { id: m.id, origen: m.origen, subBom };
        if (m.familiaTalla)
          info.familiaTalla = {
            familia: m.familiaTalla,
            tallaValor: m.talla?.valor ?? null,
            codigo: m.codigo,
            activo: m.activo !== false,
          };
        materiales[m.id] = info;
        for (const l of subBom)
          if (!(l.materialId in materiales)) nuevos.push(l.materialId);
      }
      return [...new Set(nuevos)].filter((id) => !(id in materiales));
    };

    // Carga iterativa: al traer un FABRICADO, sus insumos hijos se agregan a la cola.
    const cargarPendientes = async (ids: number[]): Promise<void> => {
      let pendientes = ids;
      while (pendientes.length) {
        const filas = await this.prisma.material.findMany({
          where: { id: { in: pendientes } },
          include,
        });
        pendientes = incorporar(filas as any[]);
      }
    };

    await cargarPendientes([...ids]);

    // Materiales por talla: se traen de UNA vez todos los hermanos de las familias
    // presentes, porque la entrada se reutiliza para resolver todas las tallas.
    const familias = [
      ...new Set(
        Object.values(materiales)
          .map((m) => m.familiaTalla?.familia)
          .filter((f): f is string => !!f),
      ),
    ];
    if (familias.length) {
      const hermanos = await this.prisma.material.findMany({
        where: { familiaTalla: { in: familias } },
        include,
      });
      const nuevos = (hermanos as any[]).filter((m) => !(m.id in materiales));
      await cargarPendientes(incorporar(nuevos));
    }

    return materiales;
  }
}
