import { CanActivateChildFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { Modulo, puedeVerModulo, rutaInicial } from './modulos';

/**
 * Bloquea el acceso por URL directa a un módulo que el rol no puede ver y
 * redirige a su ruta de aterrizaje. Lee el módulo de `route.data.modulo`.
 */
export const moduloGuard: CanActivateChildFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const modulo = route.data?.['modulo'] as Modulo | undefined;
  const rol = auth.rol();
  if (!modulo || puedeVerModulo(rol, modulo)) {
    return true;
  }
  return router.parseUrl(rutaInicial(rol));
};
