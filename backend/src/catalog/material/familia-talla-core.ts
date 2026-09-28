// Lógica pura para etiquetar materiales por talla (sin Prisma). La usa el script
// prisma/etiquetar-familias-talla.ts; vive en src/ para poder probarla con jest.

/**
 * Familias de materiales que existen uno POR TALLA. Para sumar otra familia basta
 * agregarla acá (el nombre del material debe ser "<FAMILIA> [TALLA] <nn>").
 */
export const FAMILIAS_TALLA = ['PLANTILLA PU', 'PLANTILLA EVA', 'PLANTILLA KEVLAR'] as const;

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "PLANTILLA PU TALLA 38" o "PLANTILLA PU 38" (los duplicados MRP- no llevan "TALLA").
const PATRON = new RegExp(
  `^(${FAMILIAS_TALLA.map((f) => escapar(f).replace(/ /g, '\\s+')).join('|')})\\s+(TALLA\\s+)?(\\d{2})$`,
  'i',
);

export interface FamiliaTallaParseada {
  familia: string;
  talla: number;
}

/** Familia (en mayúsculas, espacios normalizados) y talla a partir del nombre; null si no casa. */
export function parsearFamiliaTalla(nombre: string): FamiliaTallaParseada | null {
  const m = PATRON.exec(nombre.trim());
  if (!m) return null;
  return {
    familia: m[1].toUpperCase().replace(/\s+/g, ' '),
    talla: Number(m[3]),
  };
}

export interface MaterialEtiquetable {
  id: number;
  codigo: string;
  nombreCanonico: string;
  familiaTalla: string | null;
  tallaId: number | null;
}

export interface PlanEtiquetado {
  /** Materiales a escribir (nuevos o con etiqueta distinta). */
  etiquetar: { id: number; codigo: string; nombre: string; familiaTalla: string; tallaId: number; talla: number }[];
  /** Ya tenían exactamente esa etiqueta (idempotencia). */
  yaEtiquetados: number;
  /** Casan con una familia pero su talla no existe en la tabla Talla: no se etiquetan. */
  sinTalla: { codigo: string; nombre: string; talla: number }[];
}

/** Decide qué etiquetar. `tallas` es la tabla Talla (id + valor). */
export function planearEtiquetado(
  materiales: MaterialEtiquetable[],
  tallas: { id: number; valor: number }[],
): PlanEtiquetado {
  const idTalla = new Map(tallas.map((t) => [t.valor, t.id]));
  const plan: PlanEtiquetado = { etiquetar: [], yaEtiquetados: 0, sinTalla: [] };
  for (const m of materiales) {
    const p = parsearFamiliaTalla(m.nombreCanonico);
    if (!p) continue;
    const tallaId = idTalla.get(p.talla);
    if (tallaId == null) {
      plan.sinTalla.push({ codigo: m.codigo, nombre: m.nombreCanonico, talla: p.talla });
      continue;
    }
    if (m.familiaTalla === p.familia && m.tallaId === tallaId) {
      plan.yaEtiquetados++;
      continue;
    }
    plan.etiquetar.push({
      id: m.id,
      codigo: m.codigo,
      nombre: m.nombreCanonico,
      familiaTalla: p.familia,
      tallaId,
      talla: p.talla,
    });
  }
  return plan;
}
