import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BomLoaderService } from '../../catalog/bom/bom-loader.service';
import { resolverBom } from '../../catalog/bom/bom-resolver';
import {
  costoParDesdeComprados,
  ItemCosteo,
  resumenCosteo,
  ResumenCosteo,
} from './oc-costeo';

type DecimalLike = { toNumber(): number } | number | null;
const num = (d: DecimalLike): number =>
  d == null ? 0 : typeof d === 'number' ? d : d.toNumber();

@Injectable()
export class OcCosteoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bomLoader: BomLoaderService,
  ) {}

  // Costo de materiales (vía BOM) vs. venta pactada de una OC. Solo materiales.
  async costear(ocId: number): Promise<ResumenCosteo & { materialesSinCosto: number }> {
    const oc = await this.prisma.ordenCompra.findUnique({
      where: { id: ocId },
      include: {
        lineas: {
          include: {
            productoConfigurado: { include: { opciones: true } },
            tallas: { include: { talla: true } },
          },
        },
      },
    });
    if (!oc) throw new NotFoundException(`OC ${ocId} no existe`);

    // 1. Explotar el BOM por línea/talla → consumo de insumos por par.
    const detalle: {
      cantidad: number;
      precioUnitario: number;
      comprados: { materialId: number; consumo: number }[];
    }[] = [];
    const materialIds = new Set<number>();

    for (const linea of oc.lineas as any[]) {
      const pc = linea.productoConfigurado;
      const precioUnitario = num(linea.precioUnitario);
      const tallasActivas = (linea.tallas as any[]).filter((t) => t.cantidad > 0);
      if (!tallasActivas.length) continue;
      // El BOM/overrides no dependen de la talla: se carga una vez por línea.
      const entradaBase = await this.bomLoader.cargarEntrada({
        referenciaId: pc.referenciaId,
        marcaId: pc.marcaId,
        opcionIds: pc.opciones.map((o: any) => o.opcionId),
        talla: tallasActivas[0].talla.valor,
      });
      for (const t of tallasActivas) {
        const { comprados } = resolverBom({ ...entradaBase, talla: t.talla.valor });
        comprados.forEach((c) => materialIds.add(c.materialId));
        detalle.push({ cantidad: t.cantidad, precioUnitario, comprados });
      }
    }

    // 2. Cargar el costo de cada insumo usado (promedio si existe, si no el base).
    const materiales = await this.prisma.material.findMany({
      where: { id: { in: [...materialIds] } },
      select: { id: true, costoBase: true, costoPromedio: true },
    });
    const costoDe = new Map<number, number>();
    let materialesSinCosto = 0;
    for (const m of materiales) {
      const costo =
        m.costoPromedio != null
          ? num(m.costoPromedio)
          : m.costoBase != null
            ? num(m.costoBase)
            : 0;
      if (costo <= 0) materialesSinCosto++;
      costoDe.set(m.id, costo);
    }
    for (const id of materialIds) if (!costoDe.has(id)) materialesSinCosto++;

    // 3. Costo por par (por talla) + resumen venta/costo/utilidad/margen.
    const items: ItemCosteo[] = detalle.map((d) => ({
      cantidad: d.cantidad,
      precioUnitario: d.precioUnitario,
      costoPar: costoParDesdeComprados(d.comprados, (id) => costoDe.get(id) ?? 0),
    }));

    return { ...resumenCosteo(items), materialesSinCosto };
  }
}
