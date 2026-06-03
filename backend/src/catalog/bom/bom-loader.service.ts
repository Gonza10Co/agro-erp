import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EntradaResolucion,
  LineaBase,
  MaterialInfo,
  Override,
} from './bom-resolver.types';

export interface SeleccionBom {
  referenciaId: number;
  marcaId?: number | null;
  opcionIds: number[];
  talla: number;
}

type DecimalLike = { toNumber(): number } | number | null;
const num = (d: DecimalLike): number | null =>
  d == null ? null : typeof d === 'number' ? d : d.toNumber();

@Injectable()
export class BomLoaderService {
  constructor(private readonly prisma: PrismaService) {}

  async cargarEntrada(sel: SeleccionBom): Promise<EntradaResolucion> {
    const bom = await this.prisma.bom.findFirst({
      where: { referenciaId: sel.referenciaId, activo: true },
      orderBy: { version: 'desc' },
      include: { lineas: { include: { lineasTalla: { include: { talla: true } } } } },
    });
    if (!bom) throw new NotFoundException(`Referencia ${sel.referenciaId} sin BOM activo`);

    const lineasBase: LineaBase[] = bom.lineas.map((l: any) => this.mapLinea(l));

    const overrides = await this.cargarOverrides(sel);
    const materiales = await this.cargarMateriales(lineasBase, overrides);

    return { lineasBase, overrides, talla: sel.talla, materiales };
  }

  private mapLinea(l: any): LineaBase {
    const consumoPorTalla: Record<number, number> = {};
    for (const lt of l.lineasTalla ?? []) consumoPorTalla[lt.talla.valor] = num(lt.consumo) as number;
    return {
      materialId: l.materialId,
      claseConsumo: l.claseConsumo,
      consumoFijo: num(l.consumoFijo),
      consumoPorTalla,
      mermaPct: num(l.mermaPct),
    };
  }

  private async cargarOverrides(sel: SeleccionBom): Promise<Override[]> {
    const disparadores: any[] = [];
    if (sel.marcaId != null) disparadores.push({ marcaId: sel.marcaId });
    if (sel.opcionIds.length) disparadores.push({ opcionId: { in: sel.opcionIds } });
    if (!disparadores.length) return [];

    const reglas = await this.prisma.reglaOverride.findMany({
      where: { referenciaId: sel.referenciaId, OR: disparadores },
      include: { tallas: { include: { talla: true } }, opcion: { include: { grupoOpcion: true } } },
    });

    return reglas.map((r: any) => {
      const consumoPorTalla: Record<number, number> = {};
      for (const t of r.tallas ?? []) consumoPorTalla[t.talla.valor] = num(t.consumo) as number;
      // Marca dispara primero (orden 0); opciones por el orden de su grupo.
      const orden = r.marcaId != null ? 0 : (r.opcion?.grupoOpcion?.orden ?? 1) + 1;
      return {
        accion: r.accion,
        orden,
        materialObjetivoId: r.materialObjetivoId ?? null,
        materialNuevoId: r.materialNuevoId ?? null,
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
    let pendientes = [...ids];

    // Carga iterativa: al traer un FABRICADO, sus insumos hijos se agregan a la cola.
    while (pendientes.length) {
      const filas = await this.prisma.material.findMany({
        where: { id: { in: pendientes } },
        include: { bomPropio: { include: { lineas: { include: { lineasTalla: { include: { talla: true } } } } } } },
      });
      const nuevos: number[] = [];
      for (const m of filas as any[]) {
        const subBom: LineaBase[] = (m.bomPropio?.lineas ?? []).map((l: any) => this.mapLinea(l));
        materiales[m.id] = { id: m.id, origen: m.origen, subBom };
        for (const l of subBom) if (!(l.materialId in materiales)) nuevos.push(l.materialId);
      }
      pendientes = [...new Set(nuevos)].filter((id) => !(id in materiales));
    }

    return materiales;
  }
}
