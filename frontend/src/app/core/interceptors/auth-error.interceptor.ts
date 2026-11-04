import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';

/**
 * Ante un 401 intenta UNA renovación silenciosa (refresh token) y repite la
 * petición con el token nuevo: el operario pistolea todo el día sin volver al
 * login. Solo si la renovación falla se cierra la sesión y se va al login.
 */
export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const esAuth = req.url.endsWith('/auth/login') || req.url.endsWith('/auth/refresh');

  const alLogin = (err: unknown) => {
    auth.logout();
    router.navigateByUrl('/login?expired=1');
    return throwError(() => err);
  };

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || esAuth) return throwError(() => err);
      return auth.renovar().pipe(
        catchError(() => alLogin(err)),
        switchMap((token) =>
          next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })).pipe(
            catchError((err2: HttpErrorResponse) =>
              err2.status === 401 ? alLogin(err2) : throwError(() => err2),
            ),
          ),
        ),
      );
    }),
  );
};
