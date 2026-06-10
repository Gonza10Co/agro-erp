import { ClaseDano } from '@prisma/client';

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
