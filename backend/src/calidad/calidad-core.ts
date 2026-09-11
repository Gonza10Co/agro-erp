import { Celula, ClaseDano } from '@prisma/client';

const RE_REPOSICION = /^(?<base>.+)-R(?<n>\d+)$/;

/** Código del par de reposición: `OF12-0003` → `-R1`; `-R1` → `-R2`. */
export function codigoReposicion(codigo: string): string {
  const m = RE_REPOSICION.exec(codigo);
  if (!m?.groups) return `${codigo}-R1`;
  return `${m.groups['base']}-R${Number(m.groups['n']) + 1}`;
}

export type ErrorReporte = 'SIN_DESCRIPCION' | 'ROL_INSUFICIENTE';

/**
 * Reglas por clase de daño:
 *  - BAJA: rol GERENTE/ADMIN + descripción (es un acta: se destruye producto).
 *  - SEGUNDA: no exige nada. No destruye nada, la marca quien revisa en planta, y
 *    el "por qué" ya viaja en el tipo de daño (eso es lo que explica el % de
 *    segundas por célula). Desde el celular, con guantes, una nota obligatoria
 *    era captura manual que el cliente no quiere (2026-09-11).
 *  - REPROCESO: no exige nada.
 * ⚠️ Asunción a confirmar con el cliente: si marcar segunda también debe exigir
 * autorización del gerente, basta sumar la clase a la guarda de rol.
 */
export function validarReporte(
  clase: ClaseDano,
  descripcion: string | undefined,
  rol: string,
): ErrorReporte | null {
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
  segundas: number; // el par sigue vivo pero se vende de segunda
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

/**
 * Imputación por centro de costo + top 5 tipos de daño. Puro.
 * `eventosPorCelula` debe ser el conteo de pares que pasaron por cada célula
 * (en el flujo actual avanzar crea exactamente un evento por par y célula).
 * `pctDano` puede superar 1: un mismo par puede acumular varias incidencias.
 */
export function agruparIndicadores(
  incidencias: IncidenciaConTipo[],
  eventosPorCelula: Partial<Record<Celula, number>>,
): { centros: CentroIndicador[]; topDanos: TopDano[] } {
  const centros = CENTROS_DE_COSTO.map((celula) => {
    const deCelula = incidencias.filter((i) => i.tipoDano.celulaCausante === celula);
    const cuantas = (clase: ClaseDano) =>
      deCelula.filter((i) => i.tipoDano.clase === clase).length;
    const paresProcesados = eventosPorCelula[celula] ?? 0;
    return {
      celula,
      total: deCelula.length,
      // Cada clase se cuenta explícitamente: cuando reprocesos era "todo lo que no
      // es baja", agregar SEGUNDA lo habría inflado en silencio.
      bajas: cuantas('BAJA'),
      reprocesos: cuantas('REPROCESO'),
      segundas: cuantas('SEGUNDA'),
      paresProcesados,
      pctDano: paresProcesados > 0 ? deCelula.length / paresProcesados : null,
    };
  });

  const porTipo = new Map<string, TopDano>();
  for (const i of incidencias) {
    const t = porTipo.get(i.tipoDano.codigo) ?? {
      codigo: i.tipoDano.codigo,
      nombre: i.tipoDano.nombre,
      celulaCausante: i.tipoDano.celulaCausante,
      clase: i.tipoDano.clase,
      total: 0,
    };
    t.total++;
    porTipo.set(i.tipoDano.codigo, t);
  }
  const topDanos = [...porTipo.values()]
    .sort((a, b) => b.total - a.total || a.codigo.localeCompare(b.codigo))
    .slice(0, 5);

  return { centros, topDanos };
}
