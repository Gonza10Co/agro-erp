import { HttpParams } from '@angular/common/http';

/**
 * Query del listado de maestros. Sin `incluirInactivas` no manda nada: así los
 * consumidores de siempre (selects, configurador de BOM, wizard de OC) siguen
 * recibiendo solo lo activo y la URL queda idéntica a la de antes.
 */
export function inactivas(opts?: { incluirInactivas?: boolean }): HttpParams {
  return opts?.incluirInactivas ? new HttpParams().set('incluirInactivas', 'true') : new HttpParams();
}
