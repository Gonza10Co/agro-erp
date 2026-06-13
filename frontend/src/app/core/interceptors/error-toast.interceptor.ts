import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../notificaciones/toast.service';

/**
 * Muestra un toast de error para cualquier respuesta HTTP fallida.
 * Excluye 401 (lo maneja authErrorInterceptor con logout+redirect) y el
 * login (que muestra su error inline) para no duplicar feedback.
 */
export const errorToastInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const esLogin = req.url.endsWith('/auth/login');
      if (err.status !== 401 && !esLogin) {
        toast.error(mensajeDeError(err));
      }
      return throwError(() => err);
    }),
  );
};

/** Extrae un mensaje legible del error: prioriza el del backend NestJS. */
function mensajeDeError(err: HttpErrorResponse): string {
  if (err.status === 0) {
    return 'Sin conexión con el servidor.';
  }
  const m = err.error?.message;
  if (Array.isArray(m)) {
    return m.join(' · ');
  }
  if (typeof m === 'string' && m.trim()) {
    return m;
  }
  if (err.status >= 500) {
    return 'Error del servidor. Intentá de nuevo.';
  }
  return `Error ${err.status}.`;
}
