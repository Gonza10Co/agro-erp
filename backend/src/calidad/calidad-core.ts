import { Celula, ClaseDano } from '@prisma/client';

const RE_REPOSICION = /^(?<base>.+)-R(?<n>\d+)$/;

/** Código del par de reposición: `OF12-0003` → `-R1`; `-R1` → `-R2`. */
export function codigoReposicion(codigo: string): string {
  const m = RE_REPOSICION.exec(codigo);
  if (!m?.groups) return `${codigo}-R1`;
  return `${m.groups['base']}-R${Number(m.groups['n']) + 1}`;
}

export type ErrorReporte = 'SIN_DESCRIPCION' | 'ROL_INSUFICIENTE' | null;

/** Reglas del acta de baja: rol GERENTE/ADMIN + descripción obligatoria. REPROCESO no exige nada. */
export function validarReporte(
  clase: ClaseDano,
  descripcion: string | undefined,
  rol: string,
): ErrorReporte {
  if (clase !== 'BAJA') return null;
  if (rol !== 'GERENTE' && rol !== 'ADMIN') return 'ROL_INSUFICIENTE';
  if (!descripcion?.trim()) return 'SIN_DESCRIPCION';
  return null;
}

/** Células que son centro de costo imputable (PT no causa daños en el catálogo). */
export const CENTROS_DE_COSTO: Celula[] = ['CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION'];

export interface IncidenciaConTipo {
  tipoDano: { codigo: string; nombre: string; celulaCausante: Celula; clase: ClaseDano };
}

export interface CentroIndicador {
  celula: Celula;
  total: number;
  bajas: number;
  reprocesos: number;
  paresProcesados: number;
  pctDano: number | null; // null si no hay denominador
}

export interface TopDano {
  codigo: string;
  nombre: string;
  celulaCausante: Celula;
  clase: ClaseDano;
  total: number;
}

/** Imputación por centro de costo + top 5 tipos de daño. Puro. */
export function agruparIndicadores(
  incidencias: IncidenciaConTipo[],
  eventosPorCelula: Partial<Record<Celula, number>>,
): { centros: CentroIndicador[]; topDanos: TopDano[] } {
  const centros = CENTROS_DE_COSTO.map((celula) => {
    const deCelula = incidencias.filter((i) => i.tipoDano.celulaCausante === celula);
    const bajas = deCelula.filter((i) => i.tipoDano.clase === 'BAJA').length;
    const paresProcesados = eventosPorCelula[celula] ?? 0;
    return {
      celula,
      total: deCelula.length,
      bajas,
      reprocesos: deCelula.length - bajas,
      paresProcesados,
      pctDano: paresProcesados > 0 ? deCelula.length / paresProcesados : null,
    };
  });

  const porTipo = new Map<string, TopDano>();
  for (const i of incidencias) {
    const t = porTipo.get(i.tipoDano.codigo) ?? { ...i.tipoDano, total: 0 };
    t.total++;
    porTipo.set(i.tipoDano.codigo, t);
  }
  const topDanos = [...porTipo.values()].sort((a, b) => b.total - a.total).slice(0, 5);

  return { centros, topDanos };
}
