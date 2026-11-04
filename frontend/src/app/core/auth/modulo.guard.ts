import { CanActivateChildFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { Modulo, Seccion, puedeVerModulo, puedeVerRuta, puedeVerSeccion, rutaInicial } from './modulos';

/**
 * Bloquea el acceso por URL directa y redirige a la ruta de aterrizaje del rol.
 * Mira tres cosas: el módulo (`route.data.modulo`), para pantallas nuevas que
 * viven dentro de un módulo ya entregado, la sección (`route.data.seccion`) —
 * sin esto el cliente entra tecleando la URL aunque el botón esté oculto — y,
 * para los roles acotados con lista de rutas, la URL misma.
 */
export const moduloGuard: CanActivateChildFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const modulo = route.data?.['modulo'] as Modulo | undefined;
  const seccion = route.data?.['seccion'] as Seccion | undefined;
  const rol = auth.rol();
  const veModulo = !modulo || puedeVerModulo(rol, modulo);
  const veSeccion = !seccion || puedeVerSeccion(rol, seccion);
  // Un rol acotado con lista de rutas (la tablet de estación) solo abre esas URLs.
  const veRuta = puedeVerRuta(rol, state?.url);
  if (veModulo && veSeccion && veRuta) {
    return true;
  }
  return router.parseUrl(rutaInicial(rol));
};
