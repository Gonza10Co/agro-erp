import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Desfase entre el reloj de la tablet y el del servidor (ms; servidor − tablet).
 * Un pistolazo guardado sin señal lleva la hora de la tablet: si su reloj está
 * corrido, el evento quedaría corrido. Se mide con el header `Date` de cada
 * respuesta del API (el backend lo expone por CORS) y se guarda en la tablet para
 * cuando arranque sin señal.
 */
export const CLAVE_DESFASE = 'agro.relojDesfaseMs';
/** Por debajo de esto es ruido (el header Date tiene resolución de 1 s). */
const UMBRAL_MS = 2000;

let desfase: number | null = leerGuardado();

function leerGuardado(): number | null {
  try {
    const v = localStorage.getItem(CLAVE_DESFASE);
    return v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
  } catch {
    return null;
  }
}

/** Desfase conocido (null si nunca se ha medido). */
export function desfaseReloj(): number | null {
  return desfase;
}

/** Registra una medida: `fechaServidor` es el header Date; `ahora` la hora local al recibirlo. */
export function medirReloj(fechaServidor: string | null, ahora = Date.now()): void {
  if (!fechaServidor) return;
  const t = Date.parse(fechaServidor);
  if (Number.isNaN(t)) return;
  // Date se trunca al segundo: +500 ms centra el error.
  const d = t + 500 - ahora;
  desfase = Math.abs(d) < UMBRAL_MS ? 0 : Math.round(d);
  try {
    localStorage.setItem(CLAVE_DESFASE, String(desfase));
  } catch { /* sin storage */ }
}

/** Pasa una hora de la tablet (ISO) a hora del servidor con un desfase dado. */
export function aHoraServidor(isoLocal: string, desfaseMs: number | null | undefined): string {
  const t = Date.parse(isoLocal);
  if (Number.isNaN(t) || !desfaseMs) return isoLocal;
  return new Date(t + desfaseMs).toISOString();
}

/** Solo para pruebas. */
export function reiniciarReloj(valor: number | null = null): void {
  desfase = valor;
  try {
    localStorage.removeItem(CLAVE_DESFASE);
  } catch { /* sin storage */ }
}

/** Una respuesta que tardó más que esto no sirve para medir: el Date ya viene viejo. */
export const MAX_IDA_Y_VUELTA_MS = 1500;

/** Mide el desfase con cada respuesta RÁPIDA del API (con internet lento, el Date llega atrasado). */
export const relojInterceptor: HttpInterceptorFn = (req, next) => {
  const inicio = Date.now();
  return next(req).pipe(
    tap((ev) => {
      if (!(ev instanceof HttpResponse) || !req.url.startsWith(environment.apiUrl)) return;
      const ahora = Date.now();
      if (ahora - inicio <= MAX_IDA_Y_VUELTA_MS) medirReloj(ev.headers.get('Date'), ahora);
    }),
  );
};
