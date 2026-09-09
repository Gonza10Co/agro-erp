import { ProgramaOfLinea } from '../../core/api/models/fabricacion.models';

/**
 * El programa de una OF (producto × talla) agrupado por producto: el nombre y el
 * código de la referencia se dicen una sola vez y cada grupo lleva su total.
 * Lo usan la estación de Preparación (donde nacen los pares) y el aside de la
 * lista de OF (donde se consulta la composición desde el escritorio).
 */
export interface GrupoPrograma {
  productoConfiguradoId: number;
  producto: string;
  productoCodigo: string;
  programado: number;
  nacidos: number;
  lineas: ProgramaOfLinea[];
}

export function agruparPrograma(lineas: ProgramaOfLinea[] | undefined): GrupoPrograma[] {
  const grupos: GrupoPrograma[] = [];
  for (const l of lineas ?? []) {
    let g = grupos.find((x) => x.productoConfiguradoId === l.productoConfiguradoId);
    if (!g) {
      g = {
        productoConfiguradoId: l.productoConfiguradoId,
        producto: l.producto,
        productoCodigo: l.productoCodigo,
        programado: 0,
        nacidos: 0,
        lineas: [],
      };
      grupos.push(g);
    }
    g.lineas.push(l);
    g.programado += l.programado;
    g.nacidos += l.nacidos;
  }
  return grupos;
}
