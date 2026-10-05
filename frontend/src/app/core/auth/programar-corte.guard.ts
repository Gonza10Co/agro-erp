import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { puedeProgramarCorte } from './modulos';

/**
 * "Nueva orden de corte" es solo para quien programa el corte (gerencia y jefe de
 * corte). El resto ve el tablero pero, si teclea la URL, vuelve a él. El backend
 * responde 403 igual; esto evita mostrar un formulario que siempre falla.
 */
export const programarCorteGuard: CanActivateFn = () =>
  puedeProgramarCorte(inject(AuthService).rol()) || inject(Router).parseUrl('/corte');
