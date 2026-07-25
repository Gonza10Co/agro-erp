import { CanActivateChildFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { Modulo, Seccion, puedeVerModulo, puedeVerSeccion, rutaInicial } from './modulos';

/**
 * Bloquea el acceso por URL directa y redirige a la ruta de aterrizaje del rol.
 * Mira dos cosas: el módulo (`route.data.modulo`) y, para pantallas nuevas que
 * viven dentro de un módulo ya entregado, la sección (`route.data.seccion`) —
 * sin esto el cliente entra tecleando la URL aunque el botón esté oculto.
 */
export const moduloGuard: CanActivateChildFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const modulo = route.data?.['modulo'] as Modulo | undefined;
  const seccion = route.data?.['seccion'] as Seccion | undefined;
  const rol = auth.rol();
  const veModulo = !modulo || puedeVerModulo(rol, modulo);
  const veSeccion = !seccion || puedeVerSeccion(rol, seccion);
  if (veModulo && veSeccion) {
    return true;
  }
  return router.parseUrl(rutaInicial(rol));
};
