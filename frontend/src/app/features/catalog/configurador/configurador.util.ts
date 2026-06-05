import { EjeConfig, ReferenciaConfig } from '../../../core/api/models/catalogo.models';

/** Valores de talla del rango de la referencia (inclusivo). */
export function tallasDeRef(config: ReferenciaConfig): number[] {
  const { tallaMin, tallaMax } = config.referencia;
  const out: number[] = [];
  for (let v = tallaMin; v <= tallaMax; v++) out.push(v);
  return out;
}

/** opcionIds elegidos (de la Map grupoId→opcionId|null), sin nulos. */
export function opcionIdsSel(sel: Map<number, number | null>): number[] {
  return [...sel.values()].filter((v): v is number => v != null);
}

/** Nombres de los grupos obligatorios que aún no tienen opción elegida. */
export function obligatoriosFaltantes(ejes: EjeConfig[], sel: Map<number, number | null>): string[] {
  return ejes.filter((e) => e.grupo.obligatorio && sel.get(e.grupo.id) == null).map((e) => e.grupo.nombre);
}
