import { MonoTypeOperatorFunction, catchError, of, tap, throwError } from 'rxjs';
import { esFalloDeRed } from './offline-scan-queue.service';

export const PREFIJO_RESPALDO = 'agro.respaldo.';

/**
 * Último valor bueno de una lectura (estaciones, operarios, máquinas, OF, tipos de
 * daño), guardado en la tablet. Si la tablet arranca sin señal, la pantalla sale con
 * lo último que se supo en vez de quedar vacía. Solo cubre fallos de red: un error
 * del servidor (4xx/500) sale como siempre.
 */
export function conRespaldoLocal<T>(clave: string): MonoTypeOperatorFunction<T> {
  const k = PREFIJO_RESPALDO + clave;
  return (fuente) =>
    fuente.pipe(
      tap((v) => {
        try {
          localStorage.setItem(k, JSON.stringify(v));
        } catch { /* sin storage: no hay respaldo, nada más */ }
      }),
      catchError((e: unknown) => {
        if (!esFalloDeRed(e)) return throwError(() => e);
        let guardado: string | null = null;
        try {
          guardado = localStorage.getItem(k);
        } catch { /* sin storage */ }
        if (guardado == null) return throwError(() => e);
        try {
          return of(JSON.parse(guardado) as T);
        } catch {
          return throwError(() => e);
        }
      }),
    );
}

/** Borra todos los respaldos (pruebas, o si hiciera falta limpiar la tablet). */
export function borrarRespaldos(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIJO_RESPALDO)) localStorage.removeItem(k);
    }
  } catch { /* sin storage */ }
}
